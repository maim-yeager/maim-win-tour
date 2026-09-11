package com.winningbd.app;

import android.webkit.JavascriptInterface;

/**
 * JavaScript bridge exposed to the web page as window.WinApp.
 *
 * The web page calls:
 *   window.WinApp.startGoogleSignIn()
 *
 * After the native sign-in completes, MainActivity calls back into the page:
 *   window.onNativeGoogleSignIn(idToken)   — success
 *   window.onNativeGoogleSignInError(msg)  — failure / cancellation
 *
 * No Firebase dependency here — Firebase auth is done entirely on the web side
 * using the ID token returned by Google Sign-In.
 */
public class WebAppInterface {

    private final MainActivity activity;

    public WebAppInterface(MainActivity activity) {
        this.activity = activity;
    }

    /**
     * Called from JavaScript: window.WinApp.startGoogleSignIn()
     * Switches to the UI thread and launches the native Google account picker.
     */
    @JavascriptInterface
    public void startGoogleSignIn() {
        // JavascriptInterface methods are called on a background thread;
        // startActivityForResult must run on the UI thread.
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                activity.launchGoogleSignIn();
            }
        });
    }
}
