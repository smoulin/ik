package eu.agilmea.spike

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.os.PowerManager
import java.util.Date
import java.util.Locale

/**
 * Service de premier plan qui suit la position pendant le trajet.
 *
 * C'est le sujet de l'experience : Android autorise ce service a tourner ecran
 * eteint, mais les surcouches constructeur — One UI en particulier — se
 * reservent le droit de le suspendre. Tout ce qui est ecrit ici vise donc autant
 * a enregistrer le trajet qu'a laisser une trace exploitable si l'enregistrement
 * est interrompu.
 */
class TrackingService : Service(), LocationListener {

    companion object {
        private const val ACTION_START = "eu.agilmea.spike.START"
        private const val ACTION_STOP = "eu.agilmea.spike.STOP"
        private const val EXTRA_TRIGGER = "trigger"

        private const val CHANNEL_ID = "tracking"
        private const val NOTIFICATION_ID = 1

        /** Une position toutes les 5 s ; le tri des points est notre affaire, pas celle du systeme. */
        private const val INTERVAL_MS = 5_000L

        @Volatile
        var isRunning = false
            private set

        fun start(context: Context, trigger: String) {
            if (isRunning) {
                Diary.log(context, "Demarrage ignore ($trigger) : enregistrement deja en cours.")
                return
            }

            val intent = Intent(context, TrackingService::class.java)
                .setAction(ACTION_START)
                .putExtra(EXTRA_TRIGGER, trigger)

            // Ce demarrage peut echouer : depuis Android 12, une application
            // endormie n'a pas le droit de lancer un service de premier plan
            // sans exemption d'optimisation de batterie. L'echec doit etre
            // consigne — c'est l'une des reponses que l'experience cherche.
            runCatching { context.startForegroundService(intent) }
                .onFailure {
                    Diary.log(
                        context,
                        "ECHEC du demarrage ($trigger) : ${it.javaClass.simpleName} — ${it.message}",
                    )
                }
        }

        fun stop(context: Context, trigger: String) {
            if (!isRunning) {
                Diary.log(context, "Arret ignore ($trigger) : aucun enregistrement en cours.")
                return
            }

            val intent = Intent(context, TrackingService::class.java)
                .setAction(ACTION_STOP)
                .putExtra(EXTRA_TRIGGER, trigger)

            runCatching { context.startService(intent) }
                .onFailure { Diary.log(context, "ECHEC de l'arret ($trigger) : ${it.message}") }
        }
    }

    private val accumulator = TrackAccumulator()
    private var gpx: GpxWriter? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var startedAt: Date = Date()
    private var trigger: String = "?"
    private var stoppedOnPurpose = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stoppedOnPurpose = true
            Diary.log(this, "Arret demande (${intent.getStringExtra(EXTRA_TRIGGER)}).")
            stopSelf()
            return START_NOT_STICKY
        }

        if (isRunning) return START_STICKY

        trigger = intent?.getStringExtra(EXTRA_TRIGGER) ?: "?"
        startedAt = Date()

        if (!hasLocationPermission()) {
            Diary.log(this, "Demarrage impossible : autorisation de position absente.")
            stopSelf()
            return START_NOT_STICKY
        }

        // Le systeme exige que la notification apparaisse dans les 5 secondes.
        runCatching { goToForeground() }.onFailure {
            Diary.log(this, "ECHEC du passage en premier plan : ${it.javaClass.simpleName} — ${it.message}")
            stopSelf()
            return START_NOT_STICKY
        }

        isRunning = true
        gpx = GpxWriter(this, startedAt)
        holdWakeLock()

        Diary.log(this, "----- Debut d'enregistrement ($trigger) -> ${gpx?.file?.name}")

        runCatching { requestUpdates() }.onFailure {
            Diary.log(this, "ECHEC de la demande de positions : ${it.message}")
            stopSelf()
        }

        // START_STICKY : si le systeme nous tue faute de memoire, il tentera de
        // nous relancer. Le journal montrera la coupure.
        return START_STICKY
    }

    private fun hasLocationPermission(): Boolean =
        checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

    private fun requestUpdates() {
        val manager = getSystemService(LOCATION_SERVICE) as LocationManager

        if (!manager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
            Diary.log(this, "Attention : le GPS est desactive dans les reglages du telephone.")
        }

        @Suppress("MissingPermission")
        manager.requestLocationUpdates(LocationManager.GPS_PROVIDER, INTERVAL_MS, 0f, this)
    }

    private fun holdWakeLock() {
        val power = getSystemService(POWER_SERVICE) as PowerManager
        wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "agilmea-spike:tracking").apply {
            setReferenceCounted(false)
            // Une heure suffit largement, et la limite evite qu'un oubli vide la
            // batterie si le service survit a un arret manque.
            acquire(60 * 60 * 1000L)
        }
    }

    /* ---------------------------------------------------------------- */
    /* Positions                                                         */
    /* ---------------------------------------------------------------- */

    override fun onLocationChanged(location: Location) {
        val fix = Fix(
            latitude = location.latitude,
            longitude = location.longitude,
            elevation = if (location.hasAltitude()) location.altitude else null,
            accuracy = if (location.hasAccuracy()) location.accuracy.toDouble() else null,
            timeMs = if (location.time > 0) location.time else System.currentTimeMillis(),
        )

        val outcome = accumulator.accept(fix)
        if (outcome == Outcome.ACCEPTED) {
            gpx?.append(fix)
        }

        // Une ligne par position, retenue ou non : c'est ce journal qui dira si
        // le systeme a cesse de nous alimenter, et a quelle heure exactement.
        Diary.log(
            this,
            "%s  precision %s m  cumul %.2f km".format(
                Locale.FRANCE,
                label(outcome),
                fix.accuracy?.let { "%.0f".format(Locale.FRANCE, it) } ?: "?",
                accumulator.distanceMeters / 1000.0,
            ),
        )

        updateNotification()
    }

    private fun label(outcome: Outcome) = when (outcome) {
        Outcome.ACCEPTED -> "point retenu "
        Outcome.DROPPED_ACCURACY -> "ecarte precision"
        Outcome.DROPPED_NOISE -> "ecarte bruit"
        Outcome.DROPPED_SPEED -> "ecarte vitesse"
    }

    @Deprecated("Requis par LocationListener avant Android 11.")
    override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit

    override fun onProviderEnabled(provider: String) {
        Diary.log(this, "Fournisseur $provider active.")
    }

    override fun onProviderDisabled(provider: String) {
        Diary.log(this, "Fournisseur $provider DESACTIVE.")
    }

    /* ---------------------------------------------------------------- */
    /* Notification                                                      */
    /* ---------------------------------------------------------------- */

    private fun goToForeground() {
        createChannel()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, buildNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        } else {
            startForeground(NOTIFICATION_ID, buildNotification())
        }
    }

    private fun createChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Enregistrement de trajet",
            NotificationManager.IMPORTANCE_LOW,
        )
        (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(channel)
    }

    private fun buildNotification(): Notification {
        val open = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE,
        )

        return Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("Enregistrement en cours")
            .setContentText(
                "%.1f km · %d points retenus".format(Locale.FRANCE, accumulator.kilometers(), accumulator.used),
            )
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentIntent(open)
            .setOngoing(true)
            .build()
    }

    private fun updateNotification() {
        runCatching {
            (getSystemService(NOTIFICATION_SERVICE) as NotificationManager)
                .notify(NOTIFICATION_ID, buildNotification())
        }
    }

    /* ---------------------------------------------------------------- */
    /* Fin                                                               */
    /* ---------------------------------------------------------------- */

    override fun onDestroy() {
        isRunning = false

        runCatching {
            (getSystemService(LOCATION_SERVICE) as LocationManager).removeUpdates(this)
        }

        gpx?.close()
        wakeLock?.let { if (it.isHeld) it.release() }
        wakeLock = null

        val summary = summary()
        Prefs.setLastSession(this, summary)

        // Si `stoppedOnPurpose` est faux, personne n'a demande cet arret : c'est
        // le systeme qui a coupe. C'est le resultat le plus important de toute
        // l'experience, il doit sauter aux yeux dans le journal.
        Diary.log(
            this,
            if (stoppedOnPurpose) {
                "----- Fin d'enregistrement (arret demande).\n$summary"
            } else {
                "----- COUPURE SUBIE : le service a ete detruit sans arret demande.\n$summary"
            },
        )

        super.onDestroy()
    }

    private fun summary(): String = buildString {
        appendLine("Depart      : $startedAt")
        appendLine("Declencheur : $trigger")
        appendLine("Duree       : ${accumulator.durationSeconds() / 60} min")
        appendLine("Distance    : %.1f km".format(Locale.FRANCE, accumulator.kilometers()))
        appendLine("Positions   : ${accumulator.received} recues, ${accumulator.used} retenues")
        appendLine(
            "Ecartees    : ${accumulator.droppedForAccuracy} precision, " +
                "${accumulator.droppedForNoise} bruit, ${accumulator.droppedForSpeed} vitesse",
        )
        appendLine("Plus long silence : ${accumulator.longestGapMs / 1000} s")
        append("Fichier     : ${gpx?.file?.name ?: "aucun"}")
    }
}
