package eu.agilmea.ik.tracker;

import android.content.Context;

import java.io.File;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Journal de diagnostic de l'enregistrement.
 *
 * Il existe pour une raison precise, apprise a nos depens : quand le
 * declenchement echoue, il echoue SILENCIEUSEMENT. Android refuse de demarrer
 * le service, le recepteur attrape l'exception, et l'utilisateur ne constate
 * qu'une absence — un trajet qui n'est jamais apparu. Sans trace ecrite, il n'y
 * a alors rien a diagnostiquer.
 *
 * Le journal est ecrit au fil de l'eau dans le dossier externe de
 * l'application, donc lisible depuis un gestionnaire de fichiers et
 * partageable, sans quoi il ne servirait a rien.
 */
public final class Diary {

    private static final String FILE_NAME = "journal.txt";
    private static final int MAX_BYTES = 512 * 1024;

    private static final SimpleDateFormat STAMP =
        new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.FRANCE);

    private static final Object LOCK = new Object();

    private Diary() {}

    public static File file(Context context) {
        return new File(Sessions.baseDirectory(context), FILE_NAME);
    }

    public static void log(Context context, String message) {
        synchronized (LOCK) {
            try {
                File journal = file(context);

                // Un journal qui grossit sans fin finirait par remplir le
                // telephone : au-dela d'un demi-megaoctet, on repart a zero en
                // gardant une ligne qui dit ce qui s'est passe.
                if (journal.length() > MAX_BYTES) {
                    write(journal, STAMP.format(new Date()) + "  --- journal tronque ---\n", false);
                }

                write(journal, STAMP.format(new Date()) + "  " + message + "\n", true);
            } catch (IOException ignored) {
                // Un journal illisible ne doit jamais empecher un enregistrement.
            }
        }
    }

    public static String read(Context context) {
        File journal = file(context);
        if (!journal.exists()) return "";

        try {
            byte[] buffer = new byte[(int) journal.length()];
            try (RandomAccessFile in = new RandomAccessFile(journal, "r")) {
                in.readFully(buffer);
            }
            return new String(buffer, StandardCharsets.UTF_8);
        } catch (IOException error) {
            return "Journal illisible : " + error.getMessage();
        }
    }

    public static void clear(Context context) {
        synchronized (LOCK) {
            file(context).delete();
        }
    }

    private static void write(File file, String text, boolean append) throws IOException {
        try (RandomAccessFile out = new RandomAccessFile(file, "rw")) {
            if (append) out.seek(out.length());
            else out.setLength(0);
            out.write(text.getBytes(StandardCharsets.UTF_8));
        }
    }
}
