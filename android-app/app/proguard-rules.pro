# ProGuard rules for WinningBD Admin APK
-keep class com.winningbd.admin.** { *; }
-keep interface com.winningbd.admin.** { *; }
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-dontwarn org.json.**
-dontwarn android.security.keystore.**
-dontwarn javax.crypto.**

# Keep native methods
-keepclasseswithmembernames class * {
    native <methods>;
}