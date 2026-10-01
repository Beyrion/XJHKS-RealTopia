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
