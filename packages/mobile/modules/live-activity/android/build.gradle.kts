plugins {
    id("com.android.library")
    // Canonical Expo local-module plugin: applies Kotlin + provides
    // expo-modules-core (the Module/Record/Events API) on the compile classpath,
    // version-proof. Same wiring every stock Expo module uses.
    id("expo-module-gradle-plugin")
}

// expo-module-gradle-plugin's maven-publication setup derives its coordinate
// from group + a semver version; without these its PublicationInfo init throws.
group = "com.boardsesh"
version = "1.0.0"

android {
    namespace = "com.boardsesh.liveactivity"
    compileSdk = 35

    defaultConfig {
        minSdk = 24
        // Required by expo-module-gradle-plugin's publication setup.
        versionCode = 1
        versionName = "1.0.0"
    }
}

dependencies {
    // MediaStyle for the ongoing session notification (Previous/Next actions);
    // pulls androidx.core transitively for NotificationCompat/ServiceCompat/
    // ContextCompat. expo-modules-core comes from the plugin above.
    implementation("androidx.media:media:1.7.0")
}
