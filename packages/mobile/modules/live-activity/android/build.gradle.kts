plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.boardsesh.liveactivity"
    compileSdk = 35

    defaultConfig {
        minSdk = 24
    }
}

dependencies {
    // Must match the installed expo-modules-core version AND the pin in
    // modules/board-renderer/android/build.gradle.kts (the coordinate resolves
    // to that exact published artifact). Bump both in lockstep when
    // expo-modules-core updates, or the Android build fails to resolve it.
    implementation("expo:modules-core:56.0.14")
    // MediaStyle for the ongoing session notification (Previous/Next actions).
    implementation("androidx.media:media:1.7.0")
    // Notification + service compat helpers (NotificationCompat, ServiceCompat,
    // ContextCompat) used by the foreground service.
    implementation("androidx.core:core-ktx:1.13.1")
}
