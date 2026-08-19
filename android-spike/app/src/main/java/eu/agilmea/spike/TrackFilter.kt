package eu.agilmea.spike

import kotlin.math.PI
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Filtrage du bruit GPS et cumul de la distance.
 *
 * Transcription fidele de `src/domain/tracks/trackDistance.js` d'Agilmea IK :
 * memes seuils, meme formule, meme regle sur le point de reference. Les
 * distances doivent etre comparables entre la maquette et l'application, sans
 * quoi l'experience ne prouverait rien.
 *
 * Difference de forme, imposee par le contexte : ici les positions arrivent une
 * par une, alors que l'application traite un fichier complet. Le resultat est le
 * meme, a condition de ne PAS avancer le point de reference quand un point est
 * ecarte — c'est exactement ce que fait la version JavaScript.
 */
object Filters {
    /** Au-dela, la position est trop incertaine pour etre exploitee (metres). */
    const val MAX_ACCURACY_METERS = 25.0

    /** En deca, on considere que le vehicule n'a pas bouge (metres). */
    const val MIN_STEP_METERS = 10.0

    /** Au-dela, il s'agit d'un saut de position, pas d'un deplacement (km/h). */
    const val MAX_SPEED_KMH = 200.0
}

/** Une position telle que le recepteur la livre. */
data class Fix(
    val latitude: Double,
    val longitude: Double,
    val elevation: Double?,
    /** Precision horizontale annoncee, en metres. `null` si inconnue. */
    val accuracy: Double?,
    val timeMs: Long,
)

enum class Outcome { ACCEPTED, DROPPED_ACCURACY, DROPPED_NOISE, DROPPED_SPEED }

class TrackAccumulator {

    var received = 0
        private set
    var used = 0
        private set
    var droppedForAccuracy = 0
        private set
    var droppedForNoise = 0
        private set
    var droppedForSpeed = 0
        private set
    var distanceMeters = 0.0
        private set

    var firstFixMs = 0L
        private set
    var lastFixMs = 0L
        private set

    /**
     * Plus long silence entre deux positions recues.
     *
     * C'est la mesure qui repond a la question posee : un trou de plusieurs
     * minutes signifie que le systeme a suspendu l'enregistrement, meme si le
     * service n'a jamais ete officiellement tue.
     */
    var longestGapMs = 0L
        private set

    private var previous: Fix? = null

    fun accept(fix: Fix): Outcome {
        received += 1

        if (firstFixMs == 0L) {
            firstFixMs = fix.timeMs
        } else {
            val gap = fix.timeMs - lastFixMs
            if (gap > longestGapMs) longestGapMs = gap
        }
        lastFixMs = fix.timeMs

        // 1. Position trop imprecise. Precision absente = on garde : beaucoup
        // de recepteurs ne la renseignent pas.
        if (fix.accuracy != null && fix.accuracy > Filters.MAX_ACCURACY_METERS) {
            droppedForAccuracy += 1
            return Outcome.DROPPED_ACCURACY
        }

        val last = previous
        if (last == null) {
            previous = fix
            used = 1
            return Outcome.ACCEPTED
        }

        val step = haversineMeters(last.latitude, last.longitude, fix.latitude, fix.longitude)

        // 2. Derive a l'arret : le point existe, mais le vehicule n'a pas bouge.
        if (step < Filters.MIN_STEP_METERS) {
            droppedForNoise += 1
            return Outcome.DROPPED_NOISE
        }

        // 3. Saut de position : vitesse impossible entre deux points horodates.
        val seconds = (fix.timeMs - last.timeMs) / 1000.0
        if (seconds > 0) {
            val kmh = (step / seconds) * 3.6
            if (kmh > Filters.MAX_SPEED_KMH) {
                droppedForSpeed += 1
                return Outcome.DROPPED_SPEED
            }
        }

        distanceMeters += step
        used += 1
        previous = fix
        return Outcome.ACCEPTED
    }

    /** Distance en kilometres, arrondie au dixieme comme dans l'application. */
    fun kilometers(): Double = Math.round(distanceMeters / 100.0) / 10.0

    fun durationSeconds(): Long =
        if (firstFixMs == 0L) 0L else (lastFixMs - firstFixMs) / 1000L
}

private const val EARTH_RADIUS_M = 6371008.8

fun haversineMeters(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
    val toRad = PI / 180.0
    val dLat = (lat2 - lat1) * toRad
    val dLon = (lon2 - lon1) * toRad

    val a = sin(dLat / 2) * sin(dLat / 2) +
        cos(lat1 * toRad) * cos(lat2 * toRad) * sin(dLon / 2) * sin(dLon / 2)

    return 2 * EARTH_RADIUS_M * asin(min(1.0, sqrt(a)))
}
