package eu.agilmea.spike

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.util.TypedValue
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.core.content.FileProvider
import java.io.File

/**
 * Ecran unique de la maquette.
 *
 * Volontairement construit en code, sans mise en page XML ni bibliotheque
 * d'interface : cette application n'a pas vocation a etre belle, seulement a
 * rendre observable ce que fait le systeme.
 */
class MainActivity : Activity() {

    private lateinit var permissionsView: TextView
    private lateinit var deviceView: TextView
    private lateinit var sessionView: TextView
    private lateinit var journalView: TextView
    private lateinit var startButton: Button
    private lateinit var stopButton: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(buildLayout())
        Diary.log(this, "Ecran ouvert.")
    }

    override fun onResume() {
        super.onResume()
        refresh()
    }

    /* ---------------------------------------------------------------- */
    /* Mise en page                                                      */
    /* ---------------------------------------------------------------- */

    private fun buildLayout(): ScrollView {
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(20), dp(20), dp(32))
        }

        column.addView(title("Maquette d'enregistrement"))
        column.addView(
            hint(
                "Objectif : verifier qu'un trajet complet peut etre enregistre " +
                    "telephone en poche, ecran eteint, application fermee.",
            ),
        )

        column.addView(heading("1. Autorisations"))
        permissionsView = hint("")
        column.addView(permissionsView)
        column.addView(button("Accorder les autorisations") { requestNextPermission() })
        column.addView(button("Ouvrir les reglages de l'application") { openAppSettings() })
        column.addView(button("Batterie sans restriction") { requestBatteryExemption() })

        column.addView(heading("2. Vehicule"))
        deviceView = hint("")
        column.addView(deviceView)
        column.addView(button("Choisir l'appareil Bluetooth") { chooseDevice() })

        column.addView(heading("3. Essai manuel"))
        startButton = button("Demarrer un enregistrement") {
            TrackingService.start(this, "manuel")
            postRefresh()
        }
        column.addView(startButton)
        stopButton = button("Arreter") {
            TrackingService.stop(this, "manuel")
            postRefresh()
        }
        column.addView(stopButton)

        column.addView(heading("Derniere session"))
        sessionView = mono("")
        column.addView(sessionView)
        column.addView(button("Partager la derniere trace GPX") { shareLatestTrace() })

        column.addView(heading("Journal"))
        journalView = mono("")
        column.addView(journalView)
        column.addView(button("Partager le journal") { shareJournal() })
        column.addView(button("Effacer le journal") { Diary.clear(this); refresh() })
        column.addView(button("Rafraichir") { refresh() })

        return ScrollView(this).apply { addView(column) }
    }

    private fun title(text: String) = TextView(this).apply {
        this.text = text
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
        setTypeface(typeface, Typeface.BOLD)
        setPadding(0, 0, 0, dp(8))
    }

    private fun heading(text: String) = TextView(this).apply {
        this.text = text
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
        setTypeface(typeface, Typeface.BOLD)
        setPadding(0, dp(20), 0, dp(6))
    }

    private fun hint(text: String) = TextView(this).apply {
        this.text = text
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
        setTextColor(Color.DKGRAY)
        setPadding(0, 0, 0, dp(6))
    }

    private fun mono(text: String) = TextView(this).apply {
        this.text = text
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
        typeface = Typeface.MONOSPACE
        setPadding(dp(10), dp(10), dp(10), dp(10))
        setBackgroundColor(Color.parseColor("#F0F0F0"))
    }

    private fun button(text: String, onClick: () -> Unit) = Button(this).apply {
        this.text = text
        layoutParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
        )
        setOnClickListener { onClick() }
    }

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()

    /* ---------------------------------------------------------------- */
    /* Autorisations                                                     */
    /* ---------------------------------------------------------------- */

    /**
     * Les autorisations se demandent dans un ordre impose : Android refuse
     * d'accorder la position en arriere-plan tant que la position simple n'est
     * pas accordee, et exige qu'elle soit demandee seule.
     */
    private fun requestNextPermission() {
        if (!granted(Manifest.permission.ACCESS_FINE_LOCATION)) {
            requestPermissions(
                arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION,
                ),
                1,
            )
            return
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
            !granted(Manifest.permission.BLUETOOTH_CONNECT)
        ) {
            requestPermissions(arrayOf(Manifest.permission.BLUETOOTH_CONNECT), 2)
            return
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            !granted(Manifest.permission.POST_NOTIFICATIONS)
        ) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 3)
            return
        }

        if (!granted(Manifest.permission.ACCESS_BACKGROUND_LOCATION)) {
            requestPermissions(arrayOf(Manifest.permission.ACCESS_BACKGROUND_LOCATION), 4)
            return
        }

        toast("Toutes les autorisations sont accordees.")
        refresh()
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        refresh()

        // Enchainement : chaque accord debloque la demande suivante.
        if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            requestNextPermission()
        } else if (requestCode == 4) {
            toast("La position « Toujours autoriser » se regle dans les parametres de l'application.")
        }
    }

    private fun granted(permission: String) =
        checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

    private fun openAppSettings() {
        startActivity(
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                .setData(Uri.fromParts("package", packageName, null)),
        )
    }

    /**
     * Sans cette exemption, Android 12 et suivants interdisent au recepteur
     * Bluetooth de demarrer le service quand l'application dort. C'est le point
     * de blocage le plus probable.
     */
    private fun requestBatteryExemption() {
        val power = getSystemService(Context.POWER_SERVICE) as PowerManager
        if (power.isIgnoringBatteryOptimizations(packageName)) {
            toast("L'exemption est deja accordee.")
            return
        }

        runCatching {
            startActivity(
                Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                    .setData(Uri.parse("package:$packageName")),
            )
        }.onFailure { openAppSettings() }
    }

    /* ---------------------------------------------------------------- */
    /* Choix du vehicule                                                 */
    /* ---------------------------------------------------------------- */

    private fun chooseDevice() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
            !granted(Manifest.permission.BLUETOOTH_CONNECT)
        ) {
            requestPermissions(arrayOf(Manifest.permission.BLUETOOTH_CONNECT), 2)
            return
        }

        val manager = getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
        val adapter = manager.adapter
        if (adapter == null || !adapter.isEnabled) {
            toast("Active le Bluetooth pour voir les appareils appaires.")
            return
        }

        val devices = runCatching { adapter.bondedDevices.toList() }.getOrElse { emptyList() }
        if (devices.isEmpty()) {
            toast("Aucun appareil appaire.")
            return
        }

        val labels = devices.map { "${it.name ?: "sans nom"}\n${it.address}" }.toTypedArray()

        AlertDialog.Builder(this)
            .setTitle("Appareil du vehicule")
            .setItems(labels) { _, index ->
                val device = devices[index]
                Prefs.setDevice(this, device.address, device.name ?: device.address)
                Diary.log(this, "Vehicule choisi : ${device.name ?: device.address}")
                refresh()
            }
            .show()
    }

    /* ---------------------------------------------------------------- */
    /* Partage                                                           */
    /* ---------------------------------------------------------------- */

    private fun shareLatestTrace() {
        val trace = GpxWriter.existing(this).firstOrNull()
        if (trace == null) {
            toast("Aucune trace enregistree.")
            return
        }
        share(trace, "application/gpx+xml")
    }

    private fun shareJournal() {
        val journal = Diary.file(this)
        if (!journal.exists()) {
            toast("Journal vide.")
            return
        }
        share(journal, "text/plain")
    }

    private fun share(file: File, mimeType: String) {
        val uri = FileProvider.getUriForFile(this, "eu.agilmea.spike.files", file)
        val intent = Intent(Intent.ACTION_SEND)
            .setType(mimeType)
            .putExtra(Intent.EXTRA_STREAM, uri)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)

        startActivity(Intent.createChooser(intent, file.name))
    }

    /* ---------------------------------------------------------------- */
    /* Affichage                                                         */
    /* ---------------------------------------------------------------- */

    private fun postRefresh() {
        // Le service demarre de facon asynchrone : laisser un instant avant de
        // relire son etat.
        window.decorView.postDelayed({ refresh() }, 800)
    }

    private fun refresh() {
        permissionsView.text = buildString {
            appendLine("Position precise      : ${yesNo(granted(Manifest.permission.ACCESS_FINE_LOCATION))}")
            appendLine("Position en arriere-plan : ${yesNo(granted(Manifest.permission.ACCESS_BACKGROUND_LOCATION))}")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                appendLine("Notifications         : ${yesNo(granted(Manifest.permission.POST_NOTIFICATIONS))}")
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                appendLine("Bluetooth             : ${yesNo(granted(Manifest.permission.BLUETOOTH_CONNECT))}")
            }
            val power = getSystemService(Context.POWER_SERVICE) as PowerManager
            append("Batterie sans restriction : ${yesNo(power.isIgnoringBatteryOptimizations(packageName))}")
        }

        deviceView.text = Prefs.deviceName(this)
            ?.let { "Vehicule retenu : $it" }
            ?: "Aucun vehicule choisi — le declenchement automatique est inactif."

        startButton.isEnabled = !TrackingService.isRunning
        stopButton.isEnabled = TrackingService.isRunning

        sessionView.text = if (TrackingService.isRunning) {
            "Enregistrement en cours."
        } else {
            Prefs.lastSession(this) ?: "Aucune session enregistree."
        }

        journalView.text = Diary.tail(this, 20)
    }

    private fun yesNo(value: Boolean) = if (value) "oui" else "NON"

    private fun toast(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    }
}
