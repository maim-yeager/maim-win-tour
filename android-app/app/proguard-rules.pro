# Keep the WebView JS bridge methods (proxied via addJavascriptInterface).
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
# Keep model classes used by reflection-free JSON parsing (paranoia for R8).
-keep class com.winningbd.admin.model.** { *; }
-keepattributes JavascriptInterface
-keepattributes *Annotation*