package eu.agilmea.ik.tracker;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import java.io.File;
import java.util.Date;
import java.util.Locale;

import eu.agilmea.ik.MainActivity;
import eu.agilmea.ik.R;

/**
 * Enregistrement du trajet, ecran eteint et application fermee.
 *
 * Ce service est la transcription de la maquette validee sur le terrain :
 * 731 positions sur soixante minutes sans une seule interruption, et une
 * justesse de l'ordre de 2 % en sous-estimation face au compteur.
 *
 * Deux garde-fous herites de cette validation :
 *  - un verrou de veille de trois heures, plus long que tout trajet envisage,
 *    pour qu'une expiration ne cree pas un trou de notre propre fait ;
 *  - l'ecriture au fil de l'eau, pour qu'une interruption laisse malgre tout
 *    une trace exploitable.
 */
public class TrackingService extends Service implements LocationListener {

    private static final String ACTION_START = "eu.agilmea.ik.tracker.START";
    private static final String ACTION_STOP = "eu.agilmea.ik.tracker.STOP";
    private static final String EXTRA_TRIGGER = "trigger";

    private static final String CHANNEL_ID = "trajet";
    private static final int NOTIFICATION_ID = 4201;

    /** Une position toutes les 5 s ; le tri des points revient au domaine. */
    private static final long INTERVAL_MS = 5_000L;

    private static volatile boolean running = false;
    private static volatile long startedAtMs = 0L;
    private static volatile double kilometers = 0d;
    private static volatile int points = 0;

    private final LiveDistance live = new LiveDistance();
    private File session;
    private PowerManager.WakeLock wakeLock;

    public static boolean isRunning() {
        return running;
    }

    public static long startedAt() {
        return startedAtMs;
    }

    public static double kilometers() {
        return kilometers;
    }

    public static int points() {
        return points;
    }

    public static void start(Context context, String trigger) {
        if (running) return;

        Intent intent = new Intent(context, TrackingService.class)
            .setAction(ACTION_START)
            .putExtra(EXTRA_TRIGGER, trigger);

        // Ce demarrage peut echouer : depuis Android 12, une application
        // endormie n'a pas le droit de lancer un service de premier plan sans
        // exemption d'optimisation de batterie.
        try {
            context.startForegroundService(intent);
        } catch (Exception ignored) {
            // L'ecran de reglages signale l'exemption manquante ; inutile de
            // faire tomber l'application depuis un recepteur de diffusion.
        }
    }

    public static void stop(Context context, String trigger) {
        if (!running) return;

        Intent intent = new Intent(context, TrackingService.class)
            .setAction(ACTION_STOP)
            .putExtra(EXTRA_TRIGGER, trigger);

        try {
            context.startService(intent);
        } catch (Exception ignored) {
            // Idem : rien a gagner a propager l'echec.
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }

        if (running) return START_STICKY;

        if (!hasLocationPermission()) {
            stopSelf();
            return START_NOT_STICKY;
        }

        try {
            goToForeground();
        } catch (Exception error) {
            stopSelf();
            return START_NOT_STICKY;
        }

        // Une session laissee ouverte par un arret brutal est refermee ici :
        // c'est le seul instant ou l'on sait qu'aucune autre n'est en cours.
        Sessions.recoverOrphans(this);

        try {
            session = Sessions.begin(this, new Date());
        } catch (Exception error) {
            stopSelf();
            return START_NOT_STICKY;
        }

        running = true;
        startedAtMs = System.currentTimeMillis();
        kilometers = 0d;
        points = 0;

        holdWakeLock();
        requestUpdates();

        return START_STICKY;
    }

    private boolean hasLocationPermission() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private void requestUpdates() {
        LocationManager manager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        if (manager == null) {
            stopSelf();
            return;
        }

        try {
            manager.requestLocationUpdates(LocationManager.GPS_PROVIDER, INTERVAL_MS, 0f, this);
        } catch (SecurityException error) {
            stopSelf();
        }
    }

    private void holdWakeLock() {
        PowerManager power = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (power == null) return;

        wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "agilmea:trajet");
        wakeLock.setReferenceCounted(false);
        // Trois heures : au-dela du plus long trajet envisage, tout en evitant
        // de vider la batterie si un arret etait manque.
        wakeLock.acquire(3 * 60 * 60 * 1000L);
    }

    @Override
    public void onLocationChanged(Location location) {
        Fix fix = new Fix(
            location.getLatitude(),
            location.getLongitude(),
            location.hasAltitude() ? location.getAltitude() : null,
            location.hasAccuracy() ? (double) location.getAccuracy() : null,
            location.getTime() > 0 ? location.getTime() : System.currentTimeMillis()
        );

        if (session != null) Sessions.append(session, fix);

        live.add(fix);
        kilometers = live.kilometers();
        points = live.received();

        updateNotification();
    }

    @Override
    public void onProviderEnabled(String provider) {}

    @Override
    public void onProviderDisabled(String provider) {}

    /* ---------------------------------------------------------------- */
    /* Notification                                                      */
    /* ---------------------------------------------------------------- */

    private void goToForeground() {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            // Importance normale et non basse : en importance basse, One UI
            // relegue la notification parmi les silencieuses, ou elle passe
            // inapercue — c'est ce qui s'est produit avec la maquette.
            manager.createNotificationChannel(new NotificationChannel(
                CHANNEL_ID,
                "Trajet en cours",
                NotificationManager.IMPORTANCE_DEFAULT
            ));
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, buildNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NOTIFICATION_ID, buildNotification());
        }
    }

    private Notification buildNotification() {
        PendingIntent open = PendingIntent.getActivity(
            this,
            0,
            new Intent(this, MainActivity.class),
            PendingIntent.FLAG_IMMUTABLE
        );

        return new Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("Trajet en cours d'enregistrement")
            .setContentText(String.format(Locale.FRANCE, "%.1f km", kilometers))
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(open)
            .setOngoing(true)
            .build();
    }

    private void updateNotification() {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.notify(NOTIFICATION_ID, buildNotification());
    }

    /* ---------------------------------------------------------------- */
    /* Fin                                                               */
    /* ---------------------------------------------------------------- */

    @Override
    public void onDestroy() {
        running = false;

        LocationManager manager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        if (manager != null) {
            try {
                manager.removeUpdates(this);
            } catch (Exception ignored) {
                // Le service s'arrete de toute facon.
            }
        }

        if (session != null) Sessions.end(session);
        session = null;

        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;

        super.onDestroy();
    }
}
