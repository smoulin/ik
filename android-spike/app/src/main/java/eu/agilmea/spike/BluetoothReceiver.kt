package eu.agilmea.spike

import android.bluetooth.BluetoothDevice
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * Declencheur : la connexion et la deconnexion du Bluetooth du vehicule.
 *
 * Declare dans le manifeste, donc reveille l'application meme fermee :
 * `ACL_CONNECTED` et `ACL_DISCONNECTED` font partie des rares diffusions
 * qu'Android continue de livrer aux applications endormies.
 *
 * Le service ne demarre que si l'appareil correspond a celui choisi dans
 * l'ecran de reglage — sinon un casque audio lancerait un enregistrement.
 */
class BluetoothReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val device = deviceOf(intent) ?: return
        val chosen = Prefs.deviceAddress(context)

        if (chosen == null) {
            Diary.log(context, "${shortAction(intent)} ignore : aucun vehicule choisi.")
            return
        }

        if (!device.address.equals(chosen, ignoreCase = true)) {
            Diary.log(context, "${shortAction(intent)} d'un autre appareil : ignore.")
            return
        }

        when (intent.action) {
            BluetoothDevice.ACTION_ACL_CONNECTED -> {
                Diary.log(context, "Vehicule connecte -> demarrage demande.")
                TrackingService.start(context, "bluetooth")
            }

            BluetoothDevice.ACTION_ACL_DISCONNECTED -> {
                Diary.log(context, "Vehicule deconnecte -> arret demande.")
                TrackingService.stop(context, "bluetooth")
            }
        }
    }

    private fun deviceOf(intent: Intent): BluetoothDevice? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
        }

    private fun shortAction(intent: Intent): String =
        when (intent.action) {
            BluetoothDevice.ACTION_ACL_CONNECTED -> "Connexion Bluetooth"
            BluetoothDevice.ACTION_ACL_DISCONNECTED -> "Deconnexion Bluetooth"
            else -> "Evenement Bluetooth"
        }
}
