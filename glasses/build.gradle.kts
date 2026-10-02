plugins { id("com.android.application") }
android {
    namespace = "com.realtopia.glasses"
    compileSdk = 35
    buildToolsVersion = "35.0.0"
    defaultConfig {
        applicationId = "com.realtopia.glasses"
        minSdk = 28
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    buildTypes { release { isMinifyEnabled = false } }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures { aidl = true }
}
dependencies {
    implementation("com.rokid.cxr:cxr-service-bridge:1.0")
    implementation("com.rokid.security:glass3.open.sdk:2.2.0-E") {
        exclude(group = "org.slf4j")
    }
    testImplementation("junit:junit:4.13.2")
}
