package eu.agilmea.spike

import android.content.Context
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Ecriture de la trace au format GPX, point par point.
 *
 * Chaque position est ecrite et refermee immediatement, plutot que d'etre
 * accumulee en memoire puis sauvegardee a l'arret. C'est volontairement
 * inefficace — une ouverture de fichier toutes les cinq secondes — mais c'est
 * la seule facon d'avoir la trace de ce qui a ete enregistre AVANT une
 * interruption. Or c'est precisement ce que cette maquette cherche a observer.
 *
 * Consequence assumee : un fichier interrompu n'a pas de balise de fermeture.
 * Le lecteur GPX d'Agilmea IK s'en accommode, il lit les points la ou ils sont.
 */
class GpxWriter(context: Context, startedAt: Date) {

    companion object {
        private val FILE_STAMP = SimpleDateFormat("yyyy-MM-dd_HHmmss", Locale.FRANCE)

        private val ISO = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }

        fun directory(context: Context): File =
            File(context.getExternalFilesDir(null), "traces").apply { mkdirs() }

        /** Traces existantes, la plus recente en premier. */
        fun existing(context: Context): List<File> =
            directory(context).listFiles()
                ?.filter { it.name.endsWith(".gpx") }
                ?.sortedByDescending { it.lastModified() }
                ?: emptyList()
    }

    val file: File = File(directory(context), "trajet_${FILE_STAMP.format(startedAt)}.gpx")

    init {
        file.writeText(
            """
            <?xml version="1.0" encoding="UTF-8"?>
            <gpx version="1.1" creator="Agilmea Spike">
              <trk>
                <name>Trajet ${FILE_STAMP.format(startedAt)}</name>
                <trkseg>
            """.trimIndent() + "\n",
        )
    }

    fun append(fix: Fix) {
        val elevation = fix.elevation?.let { "      <ele>${"%.1f".format(Locale.US, it)}</ele>\n" } ?: ""
        val accuracy = fix.accuracy?.let {
            "      <extensions><accuracy>${"%.1f".format(Locale.US, it)}</accuracy></extensions>\n"
        } ?: ""

        runCatching {
            file.appendText(
                "    <trkpt lat=\"${"%.7f".format(Locale.US, fix.latitude)}\" " +
                    "lon=\"${"%.7f".format(Locale.US, fix.longitude)}\">\n" +
                    elevation +
                    "      <time>${ISO.format(Date(fix.timeMs))}</time>\n" +
                    accuracy +
                    "    </trkpt>\n",
            )
        }
    }

    fun close() {
        runCatching { file.appendText("    </trkseg>\n  </trk>\n</gpx>\n") }
    }
}
