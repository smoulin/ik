package eu.agilmea.ik.tracker;

/**
 * Distance affichee pendant l'enregistrement.
 *
 * Attention a ce que fait cette classe, et surtout a ce qu'elle ne fait pas :
 * elle sert UNIQUEMENT a alimenter la notification. Le calcul qui compte,
 * celui qui produira les kilometres declares, est fait par le domaine a
 * l'import — `src/domain/tracks/trackDistance.js` — sur la trace complete.
 *
 * C'est delibere. Le service enregistre tout ce qu'il recoit, sans rien
 * ecarter : filtrer a l'ecriture rendrait le reglage des seuils definitif, et
 * interdirait de recalculer une ancienne trace si on les affinait un jour.
 * Le filtrage reste donc la ou il est deja teste, et la ou il est reversible.
 */
final class LiveDistance {

    private static final double EARTH_RADIUS_M = 6371008.8;
    private static final double MIN_STEP_METERS = 10.0;
    private static final double MAX_ACCURACY_METERS = 25.0;

    private Fix previous;
    private double meters;
    private int received;

    void add(Fix fix) {
        received += 1;

        if (fix.accuracy != null && fix.accuracy > MAX_ACCURACY_METERS) return;

        if (previous == null) {
            previous = fix;
            return;
        }

        double step = haversineMeters(previous.latitude, previous.longitude, fix.latitude, fix.longitude);
        if (step < MIN_STEP_METERS) return;

        meters += step;
        previous = fix;
    }

    double kilometers() {
        return Math.round(meters / 100.0) / 10.0;
    }

    int received() {
        return received;
    }

    static double haversineMeters(double lat1, double lon1, double lat2, double lon2) {
        double toRad = Math.PI / 180.0;
        double dLat = (lat2 - lat1) * toRad;
        double dLon = (lon2 - lon1) * toRad;

        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
            + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

        return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1.0, Math.sqrt(a)));
    }
}
