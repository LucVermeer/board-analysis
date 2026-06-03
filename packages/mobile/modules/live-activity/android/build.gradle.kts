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
    // Matches the pin in modules/board-renderer/android/build.gradle.kts so the
    // two local Expo modules can't pull conflicting expo-modules-core versions.
    implementation("expo:modules-core:56.0.12")
    // MediaStyle for the ongoing session notification (Previous/Next actions).
    implementation("androidx.media:media:1.7.0")
    // Notification + service compat helpers (NotificationCompat, ServiceCompat,
    // ContextCompat) used by the foreground service.
    implementation("androidx.core:core-ktx:1.13.1")
}
