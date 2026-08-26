package eu.agilmea.ik.tracker;

import android.content.Context;

import java.io.File;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Comparator;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Ecriture des traces enregistrees, au format GPX, point par point.
 *
 * Deux choix de conception, tous deux dictes par la meme idee — une trace
 * interrompue doit rester exploitable :
 *
 * 1. chaque position est ecrite puis refermee immediatement, jamais accumulee
 *    en memoire jusqu'a l'arret ;
 * 2. une session en cours porte l'extension `.part`. Au demarrage suivant, une
 *    session restee `.part` est refermee proprement et devient exploitable :
 *    si le systeme a tue le service, on ne perd que le point en cours.
 */
final class Sessions {

    private static final String IN_PROGRESS = ".gpx.part";
    private static final String COMPLETE = ".gpx";

    private static final SimpleDateFormat FILE_STAMP = new SimpleDateFormat("yyyy-MM-dd_HHmmss", Locale.FRANCE);

    private static final SimpleDateFormat ISO;

    static {
        ISO = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US);
        ISO.setTimeZone(TimeZone.getTimeZone("UTC"));
    }

    private Sessions() {}

    /**
     * Dossier externe de l'application.
     *
     * Externe et non interne, deliberement : le stockage interne est invisible
     * depuis un gestionnaire de fichiers, donc impossible a inspecter quand
     * quelque chose ne va pas. Ici, traces et journal restent recuperables sans
     * passer par l'application — ce qui compte le jour ou c'est justement
     * l'application qui ne repond pas.
     */
    static File baseDirectory(Context context) {
        File external = context.getExternalFilesDir(null);
        File dir = external != null ? external : context.getFilesDir();
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    static File directory(Context context) {
        File dir = new File(baseDirectory(context), "traces");
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    /** Sessions terminees, la plus recente en premier. */
    static List<File> complete(Context context) {
        File[] files = directory(context).listFiles((dir, name) -> name.endsWith(COMPLETE));
        if (files == null) return java.util.Collections.emptyList();
        Arrays.sort(files, Comparator.comparingLong(File::lastModified).reversed());
        return Arrays.asList(files);
    }

    static File byName(Context context, String name) {
        // On refuse tout nom qui sortirait du dossier : le nom vient du pont JS.
        if (name == null || name.contains("/") || name.contains("\\") || name.contains("..")) return null;
        File file = new File(directory(context), name);
        return file.exists() ? file : null;
    }

    static File begin(Context context, Date startedAt) throws IOException {
        String stamp = FILE_STAMP.format(startedAt);
        File file = new File(directory(context), "trajet_" + stamp + IN_PROGRESS);

        String header = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
            + "<gpx version=\"1.1\" creator=\"Agilmea IK\">\n"
            + "  <trk>\n"
            + "    <name>Trajet " + stamp + "</name>\n"
            + "    <trkseg>\n";

        write(file, header, false);
        return file;
    }

    static void append(File file, Fix fix) {
        StringBuilder point = new StringBuilder(160);
        point.append("    <trkpt lat=\"").append(format(fix.latitude, 7))
            .append("\" lon=\"").append(format(fix.longitude, 7)).append("\">\n");

        if (fix.elevation != null) {
            point.append("      <ele>").append(format(fix.elevation, 1)).append("</ele>\n");
        }

        point.append("      <time>").append(ISO.format(new Date(fix.timeMs))).append("</time>\n");

        if (fix.accuracy != null) {
            point.append("      <extensions><accuracy>")
                .append(format(fix.accuracy, 1))
                .append("</accuracy></extensions>\n");
        }

        point.append("    </trkpt>\n");

        try {
            write(file, point.toString(), true);
        } catch (IOException ignored) {
            // Un point perdu ne justifie pas d'interrompre l'enregistrement.
        }
    }

    /** Referme la session et la rend visible a l'application. */
    static File end(File file) {
        try {
            write(file, "    </trkseg>\n  </trk>\n</gpx>\n", true);
        } catch (IOException ignored) {
            // Le lecteur GPX tolere une trace sans balise de fermeture.
        }

        String name = file.getName().replace(IN_PROGRESS, COMPLETE);
        File complete = new File(file.getParentFile(), name);
        return file.renameTo(complete) ? complete : file;
    }

    /**
     * Referme les sessions laissees en plan par un arret brutal. Appele au
     * demarrage du service : c'est le seul moment ou l'on sait qu'aucune
     * session n'est legitimement en cours.
     */
    static void recoverOrphans(Context context) {
        File[] orphans = directory(context).listFiles((dir, name) -> name.endsWith(IN_PROGRESS));
        if (orphans == null) return;
        for (File orphan : orphans) end(orphan);
    }

    static void write(File file, String text, boolean append) throws IOException {
        try (RandomAccessFile out = new RandomAccessFile(file, "rw")) {
            if (append) out.seek(out.length());
            else out.setLength(0);
            out.write(text.getBytes(StandardCharsets.UTF_8));
        }
    }

    static String read(File file) throws IOException {
        byte[] buffer = new byte[(int) file.length()];
        try (RandomAccessFile in = new RandomAccessFile(file, "r")) {
            in.readFully(buffer);
        }
        return new String(buffer, StandardCharsets.UTF_8);
    }

    private static String format(double value, int decimals) {
        return String.format(Locale.US, "%." + decimals + "f", value);
    }
}
