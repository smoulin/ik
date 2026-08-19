package eu.agilmea.spike

import android.content.Context

/**
 * Reglages et resume de la derniere session.
 *
 * L'adresse Bluetooth du vehicule est saisie par l'utilisateur et rangee ici :
 * elle n'apparait nulle part dans le code, ce qui garde le depot exempt de
 * toute donnee personnelle.
 */
object Prefs {

    private const val FILE = "spike"
    private const val DEVICE_ADDRESS = "deviceAddress"
    private const val DEVICE_NAME = "deviceName"
    private const val LAST_SESSION = "lastSession"

    private fun prefs(context: Context) =
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun deviceAddress(context: Context): String? =
        prefs(context).getString(DEVICE_ADDRESS, null)

    fun deviceName(context: Context): String? =
        prefs(context).getString(DEVICE_NAME, null)

    fun setDevice(context: Context, address: String, name: String) {
        prefs(context).edit()
            .putString(DEVICE_ADDRESS, address)
            .putString(DEVICE_NAME, name)
            .apply()
    }

    fun lastSession(context: Context): String? =
        prefs(context).getString(LAST_SESSION, null)

    fun setLastSession(context: Context, summary: String) {
        prefs(context).edit().putString(LAST_SESSION, summary).apply()
    }
}
