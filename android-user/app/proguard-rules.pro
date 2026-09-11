# Keep the JavaScript bridge so @JavascriptInterface methods survive shrinking
-keepclassmembers class com.winningbd.app.WebAppInterface {
    @android.webkit.JavascriptInterface <methods>;
}

# Google Sign-In
-keep class com.google.android.gms.auth.** { *; }
-keep class com.google.android.gms.common.** { *; }

# Firebase (if added later)
-keep class com.google.firebase.** { *; }
