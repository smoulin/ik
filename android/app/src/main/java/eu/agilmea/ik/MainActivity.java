package eu.agilmea.ik;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // L'enregistrement doit precer super.onCreate() : le pont est construit
        // la, et un greffon declare apres ne serait pas visible depuis le web.
        registerPlugin(PrintPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
