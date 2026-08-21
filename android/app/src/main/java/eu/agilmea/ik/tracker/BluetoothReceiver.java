package eu.agilmea.ik.tracker;

import android.bluetooth.BluetoothDevice;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/**
 * Declencheur : la connexion et la deconnexion du Bluetooth du vehicule.
 *
 * Declare dans le manifeste, donc reveille l'application meme fermee :
 * `ACL_CONNECTED` et `ACL_DISCONNECTED` figurent parmi les rares diffusions
 * qu'Android continue de livrer aux applications endormies.
 *
 * L'enregistrement ne demarre que si l'appareil correspond a celui choisi dans
 * les reglages : sans ce filtre, un casque audio lancerait un trajet.
 */
public class BluetoothReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        BluetoothDevice device = deviceOf(intent);
        if (device == null) return;

        String chosen = Vehicle.address(context);
        if (chosen == null || !chosen.equalsIgnoreCase(device.getAddress())) return;

        String action = intent.getAction();
        if (BluetoothDevice.ACTION_ACL_CONNECTED.equals(action)) {
            TrackingService.start(context, "bluetooth");
        } else if (BluetoothDevice.ACTION_ACL_DISCONNECTED.equals(action)) {
            TrackingService.stop(context, "bluetooth");
        }
    }

    private BluetoothDevice deviceOf(Intent intent) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice.class);
        }
        return intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
    }
}
