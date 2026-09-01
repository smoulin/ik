package eu.agilmea.ik;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import eu.agilmea.ik.tracker.TrackerPlugin;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // L'enregistrement doit preceder super.onCreate() : le pont est
        // construit la, et un greffon declare apres ne serait pas visible
        // depuis le web.
        registerPlugin(PrintPlugin.class);
        registerPlugin(TrackerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
