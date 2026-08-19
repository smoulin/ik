plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "eu.agilmea.spike"
    compileSdk = 35

    defaultConfig {
        applicationId = "eu.agilmea.spike"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1"
    }

    buildTypes {
        debug {
            // Maquette : aucune reduction de code, pour que les traces d'erreur
            // restent lisibles si quelque chose casse sur le telephone.
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    // Seule dependance : FileProvider, indispensable pour partager le GPX vers
    // une autre application. Tout le reste utilise les API natives d'Android,
    // ce qui garde l'APK minuscule et evite toute bibliotheque propriétaire.
    implementation("androidx.core:core-ktx:1.13.1")
}
