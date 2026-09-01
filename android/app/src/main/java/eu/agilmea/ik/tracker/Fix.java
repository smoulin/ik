package eu.agilmea.ik.tracker;

/** Une position telle que le recepteur la livre. */
public final class Fix {

    public final double latitude;
    public final double longitude;
    public final Double elevation;
    /** Precision horizontale annoncee, en metres. `null` si inconnue. */
    public final Double accuracy;
    public final long timeMs;

    public Fix(double latitude, double longitude, Double elevation, Double accuracy, long timeMs) {
        this.latitude = latitude;
        this.longitude = longitude;
        this.elevation = elevation;
        this.accuracy = accuracy;
        this.timeMs = timeMs;
    }
}
