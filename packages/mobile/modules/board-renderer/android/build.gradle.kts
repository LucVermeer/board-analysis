plugins {
    id("com.android.library")
    // The canonical Expo local-module plugin: applies Kotlin, wires
    // expo-modules-core onto the compile classpath (version-proof — no manual
    // `expo:modules-core:<version>` coordinate, which doesn't resolve and was
    // failing the whole Android build), and supplies Expo's SDK defaults.
    id("expo-module-gradle-plugin")
}

// expo-module-gradle-plugin sets up a maven publication that derives its
// coordinate from group + a semver version; without these its PublicationInfo
// init throws. Any valid values work for a local autolinked module.
group = "com.boardsesh"
version = "1.0.0"

android {
    namespace = "com.boardsesh.boardrenderer"
    compileSdk = 35

    defaultConfig {
        minSdk = 24
        ndk {
            abiFilters += listOf("arm64-v8a", "armeabi-v7a", "x86_64", "x86")
        }
    }

    sourceSets {
        getByName("main") {
            jniLibs.srcDirs("src/main/jniLibs")
        }
    }

    externalNativeBuild {
        cmake {
            path = file("src/main/cpp/CMakeLists.txt")
        }
    }
}
