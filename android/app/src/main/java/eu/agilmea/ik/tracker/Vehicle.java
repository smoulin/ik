package eu.agilmea.ik.tracker;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Appareil Bluetooth qui declenche l'enregistrement.
 *
 * Choisi par l'utilisateur et range ici : son nom et son adresse n'apparaissent
 * nulle part dans le code, ce qui garde le depot exempt de donnee personnelle.
 */
final class Vehicle {

    private static final String FILE = "agilmea-tracker";
    private static final String ADDRESS = "vehicleAddress";
    private static final String NAME = "vehicleName";

    private Vehicle() {}

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    static String address(Context context) {
        return prefs(context).getString(ADDRESS, null);
    }

    static String name(Context context) {
        return prefs(context).getString(NAME, null);
    }

    static void set(Context context, String address, String name) {
        prefs(context).edit().putString(ADDRESS, address).putString(NAME, name).apply();
    }

    static void clear(Context context) {
        prefs(context).edit().remove(ADDRESS).remove(NAME).apply();
    }
}
