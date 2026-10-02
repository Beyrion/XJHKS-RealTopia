buildscript {
    repositories {
        google()
        mavenCentral()
        maven("https://maven.rokid.com/repository/maven-public/")
    }
    dependencies {
        classpath("com.android.tools.build:gradle:8.7.3")
        // Rokid CXR-M 1.2.2 publishes Kotlin 2.1 metadata.
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.1.0")
        
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
        maven("https://maven.rokid.com/repository/maven-public/")
    }
}

tasks.register("clean").configure {
    delete("build")
}

// Tauri CLI requests this task for a non-split debug APK. This checked-in
// customized project has a single arm64 app variant, so the universal alias is
// exactly the app debug package.
tasks.register("assembleUniversalDebug") {
    dependsOn(":app:assembleDebug")
    doLast {
        val source = layout.projectDirectory.file("app/build/outputs/apk/debug/app-debug.apk").asFile
        val destination = layout.projectDirectory
            .file("app/build/outputs/apk/universal/debug/app-universal-debug.apk")
            .asFile
        check(source.isFile) { "Debug APK was not produced: $source" }
        destination.parentFile.mkdirs()
        source.copyTo(destination, overwrite = true)
    }
}
