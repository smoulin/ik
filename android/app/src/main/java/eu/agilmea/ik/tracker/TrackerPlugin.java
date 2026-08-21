package eu.agilmea.ik.tracker;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.util.List;
import java.util.Set;

/**
 * Pont entre l'enregistrement natif et l'application web.
 *
 * Le service tourne meme quand l'application est fermee : il ne peut donc pas
 * prevenir la page au moment ou il enregistre. Il depose ses traces sur le
 * disque, et l'application vient les chercher a son ouverture — d'ou les
 * methodes de lecture et de suppression de sessions plutot qu'un flux
 * d'evenements.
 */
@CapacitorPlugin(
    name = "AgilmeaTracker",
    permissions = {
        @Permission(alias = "location", strings = {
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION
        }),
        @Permission(alias = "backgroundLocation", strings = {
            Manifest.permission.ACCESS_BACKGROUND_LOCATION
        }),
        @Permission(alias = "notifications", strings = {
            Manifest.permission.POST_NOTIFICATIONS
        }),
        @Permission(alias = "bluetooth", strings = {
            Manifest.permission.BLUETOOTH_CONNECT
        })
    }
)
public class TrackerPlugin extends Plugin {

    /* ---------------------------------------------------------------- */
    /* Autorisations                                                     */
    /* ---------------------------------------------------------------- */

    @PluginMethod
    public void readiness(PluginCall call) {
        JSObject result = new JSObject();
        result.put("location", granted(Manifest.permission.ACCESS_FINE_LOCATION));
        result.put("backgroundLocation", granted(Manifest.permission.ACCESS_BACKGROUND_LOCATION));
        result.put("notifications", Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
            || granted(Manifest.permission.POST_NOTIFICATIONS));
        result.put("bluetooth", Build.VERSION.SDK_INT < Build.VERSION_CODES.S
            || granted(Manifest.permission.BLUETOOTH_CONNECT));
        result.put("batteryUnrestricted", ignoringBatteryOptimizations());
        call.resolve(result);
    }

    /**
     * Une autorisation a la fois, sur demande explicite du web.
     *
     * Android impose cet ordre : la position en arriere-plan ne peut etre
     * demandee qu'apres la position simple, et jamais dans le meme lot.
     */
    @PluginMethod
    public void requestPermission(PluginCall call) {
        String alias = call.getString("alias", "location");
        requestPermissionForAlias(alias, call, "permissionResult");
    }

    @PermissionCallback
    private void permissionResult(PluginCall call) {
        readiness(call);
    }

    private boolean granted(String permission) {
        return getContext().checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean ignoringBatteryOptimizations() {
        PowerManager power = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        return power != null && power.isIgnoringBatteryOptimizations(getContext().getPackageName());
    }

    /**
     * Sans cette exemption, Android interdit au recepteur Bluetooth de demarrer
     * le service quand l'application dort : c'est le point de blocage le plus
     * probable de toute la chaine.
     */
    @PluginMethod
    public void requestBatteryExemption(PluginCall call) {
        if (ignoringBatteryOptimizations()) {
            call.resolve();
            return;
        }

        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                .setData(Uri.parse("package:" + getContext().getPackageName()));
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            openSettings(call);
        }
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                .setData(Uri.fromParts("package", getContext().getPackageName(), null));
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("Impossible d'ouvrir les reglages : " + error.getMessage());
        }
    }

    /* ---------------------------------------------------------------- */
    /* Vehicule                                                          */
    /* ---------------------------------------------------------------- */

    @PluginMethod
    public void pairedDevices(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !granted(Manifest.permission.BLUETOOTH_CONNECT)) {
            call.reject("Autorisation Bluetooth manquante.");
            return;
        }

        BluetoothManager manager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        BluetoothAdapter adapter = manager == null ? null : manager.getAdapter();

        if (adapter == null || !adapter.isEnabled()) {
            call.reject("Bluetooth desactive.");
            return;
        }

        JSArray devices = new JSArray();
        try {
            Set<BluetoothDevice> bonded = adapter.getBondedDevices();
            for (BluetoothDevice device : bonded) {
                JSObject item = new JSObject();
                item.put("address", device.getAddress());
                item.put("name", device.getName() == null ? device.getAddress() : device.getName());
                devices.put(item);
            }
        } catch (SecurityException error) {
            call.reject("Autorisation Bluetooth refusee.");
            return;
        }

        JSObject result = new JSObject();
        result.put("devices", devices);
        call.resolve(result);
    }

    @PluginMethod
    public void getVehicle(PluginCall call) {
        JSObject result = new JSObject();
        result.put("address", Vehicle.address(getContext()));
        result.put("name", Vehicle.name(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void setVehicle(PluginCall call) {
        String address = call.getString("address");
        if (address == null) {
            Vehicle.clear(getContext());
        } else {
            Vehicle.set(getContext(), address, call.getString("name", address));
        }
        call.resolve();
    }

    /* ---------------------------------------------------------------- */
    /* Enregistrement                                                    */
    /* ---------------------------------------------------------------- */

    @PluginMethod
    public void status(PluginCall call) {
        JSObject result = new JSObject();
        result.put("recording", TrackingService.isRunning());
        result.put("startedAt", TrackingService.startedAt());
        result.put("kilometers", TrackingService.kilometers());
        result.put("points", TrackingService.points());
        call.resolve(result);
    }

    @PluginMethod
    public void startRecording(PluginCall call) {
        TrackingService.start(getContext(), "manuel");
        call.resolve();
    }

    @PluginMethod
    public void stopRecording(PluginCall call) {
        TrackingService.stop(getContext(), "manuel");
        call.resolve();
    }

    /* ---------------------------------------------------------------- */
    /* Sessions enregistrees                                             */
    /* ---------------------------------------------------------------- */

    @PluginMethod
    public void listSessions(PluginCall call) {
        JSArray sessions = new JSArray();
        List<File> files = Sessions.complete(getContext());

        for (File file : files) {
            JSObject item = new JSObject();
            item.put("name", file.getName());
            item.put("modifiedAt", file.lastModified());
            item.put("bytes", file.length());
            sessions.put(item);
        }

        JSObject result = new JSObject();
        result.put("sessions", sessions);
        call.resolve(result);
    }

    @PluginMethod
    public void readSession(PluginCall call) {
        File file = Sessions.byName(getContext(), call.getString("name"));
        if (file == null) {
            call.reject("Session introuvable.");
            return;
        }

        try {
            JSObject result = new JSObject();
            result.put("gpx", Sessions.read(file));
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Lecture impossible : " + error.getMessage());
        }
    }

    @PluginMethod
    public void deleteSession(PluginCall call) {
        File file = Sessions.byName(getContext(), call.getString("name"));
        if (file != null) file.delete();
        call.resolve();
    }
}
