package eu.agilmea.spike

import android.content.Context
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Journal de diagnostic.
 *
 * C'est la piece a conviction de l'experience. Si One UI interrompt
 * l'enregistrement, seul un journal ecrit au fil de l'eau permettra de dire a
 * quelle heure et apres quel evenement — un resume calcule a la fin ne
 * survivrait pas a la mort du processus.
 *
 * Volontairement un simple fichier texte : lisible sans outil, partageable tel
 * quel.
 */
object Diary {

    private const val FILE_NAME = "journal.txt"
    private val stamp = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.FRANCE)
    private val lock = Any()

    fun file(context: Context): File = File(context.getExternalFilesDir(null), FILE_NAME)

    fun log(context: Context, message: String) {
        synchronized(lock) {
            runCatching {
                file(context).appendText("${stamp.format(Date())}  $message\n")
            }
        }
    }

    /** Dernieres lignes, pour l'affichage a l'ecran. */
    fun tail(context: Context, lines: Int): String {
        val f = file(context)
        if (!f.exists()) return "Journal vide."
        return runCatching {
            f.readLines().takeLast(lines).joinToString("\n")
        }.getOrElse { "Journal illisible : ${it.message}" }
    }

    fun clear(context: Context) {
        synchronized(lock) {
            runCatching { file(context).delete() }
        }
    }
}
