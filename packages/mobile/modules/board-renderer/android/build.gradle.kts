plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

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

dependencies {
    // MUST match the installed expo-modules-core version (packages/mobile's
    // node_modules) — the coordinate resolves to that exact published artifact,
    // so a drift (e.g. 56.0.12 vs the installed 56.0.14) fails the whole Android
    // build with "Could not find expo:modules-core:<pin>". Bump in lockstep when
    // expo-modules-core updates.
    implementation("expo:modules-core:56.0.14")
}
