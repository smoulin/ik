package eu.agilmea.ik;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Impression et export PDF.
 *
 * La WebView d'Android n'implemente tout simplement pas window.print() : le
 * clic ne produit rien, sans erreur ni message. On passe donc par le service
 * d'impression du systeme, qui offre aussi « Enregistrer au format PDF » —
 * c'est-a-dire exactement ce que fait le navigateur sur ordinateur.
 *
 * On imprime la WebView elle-meme, donc le document tel qu'il est affiche,
 * avec la feuille de style @media print de l'application. L'etat de frais
 * imprime depuis le telephone est ainsi identique a celui imprime depuis un
 * navigateur.
 */
@CapacitorPlugin(name = "AgilmeaPrint")
public class PrintPlugin extends Plugin {

    @PluginMethod
    public void print(PluginCall call) {
        final String title = call.getString("title", "Agilmea IK");

        // Le service d'impression exige le fil principal.
        getActivity().runOnUiThread(() -> {
            try {
                WebView webView = getBridge().getWebView();
                PrintManager printManager = (PrintManager) getContext().getSystemService(Context.PRINT_SERVICE);

                if (printManager == null) {
                    call.reject("Aucun service d'impression sur cet appareil.");
                    return;
                }

                PrintDocumentAdapter adapter = webView.createPrintDocumentAdapter(title);
                printManager.print(title, adapter, new PrintAttributes.Builder().build());
                call.resolve();
            } catch (Exception error) {
                call.reject("Impression impossible : " + error.getMessage(), error);
            }
        });
    }
}
