package com.winningbd.app;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;

import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.tasks.Task;

/**
 * Single-activity host for the Winning Tour web app.
 *
 * Native Google Sign-In flow:
 *  1. Web JS calls window.WinApp.startGoogleSignIn()
 *  2. WebAppInterface.startGoogleSignIn() → this.launchGoogleSignIn()
 *  3. We launch Google's native account-picker intent (RC_SIGN_IN)
 *  4. onActivityResult() receives the selected account → extracts ID token
 *  5. We call window.onNativeGoogleSignIn(idToken) back into the page
 *  6. The web page exchanges the ID token for a Firebase credential and signs in
 *
 * SETUP REQUIRED (one-time):
 *  • Add your google-services.json to app/ (download from Firebase Console)
 *  • Set default_web_client_id in res/values/strings.xml
 *  • Register your app's SHA-1 in Firebase Console → Project Settings → Your apps → Android
 */
public class MainActivity extends AppCompatActivity {

    private static final int RC_SIGN_IN = 9001;

    // Domains that should stay inside the WebView (your deployed app domains).
    // Add any custom domains here; everything else opens in the system browser.
    private static final String[] INTERNAL_HOSTS = {
        "winning-tour.vercel.app",
        "winningtour.com",
        "www.winningtour.com"
    };

    private WebView webView;
    private GoogleSignInClient googleSignInClient;

    // ──────────────────────────────────────────────────────────────────────────
    // Lifecycle
    // ──────────────────────────────────────────────────────────────────────────

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        setupGoogleSignIn();
        setupWebView();

        final String url = getString(R.string.web_app_url);
        webView.loadUrl(url);
    }

    @Override
    public void onBackPressed() {
        // Let the web page handle back navigation first (its own history stack).
        // If the page can't go back, fall through to the OS default (exit / home).
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Google Sign-In setup
    // ──────────────────────────────────────────────────────────────────────────

    private void setupGoogleSignIn() {
        // requestIdToken() is what we need: the server/web auth flow uses the ID token.
        // The web client ID comes from strings.xml — replace the placeholder there.
        GoogleSignInOptions gso = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                .requestIdToken(getString(R.string.default_web_client_id))
                .requestEmail()
                .build();

        googleSignInClient = GoogleSignIn.getClient(this, gso);
    }

    /**
     * Called by WebAppInterface on the UI thread when the web page calls
     * window.WinApp.startGoogleSignIn().
     */
    public void launchGoogleSignIn() {
        // Sign out first so the account picker always appears,
        // matching the web app's { prompt: 'select_account' } behaviour.
        googleSignInClient.signOut().addOnCompleteListener(this, task -> {
            Intent signInIntent = googleSignInClient.getSignInIntent();
            startActivityForResult(signInIntent, RC_SIGN_IN);
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, @Nullable Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode != RC_SIGN_IN) return;

        Task<GoogleSignInAccount> task = GoogleSignIn.getSignedInAccountFromIntent(data);
        try {
            GoogleSignInAccount account = task.getResult(ApiException.class);

            if (account == null) {
                deliverSignInError("Google sign-in returned no account. Please try again.");
                return;
            }

            String idToken = account.getIdToken();
            if (idToken == null || idToken.isEmpty()) {
                // This usually means default_web_client_id is wrong or the SHA-1 is not
                // registered in Firebase Console.
                deliverSignInError(
                    "Could not get Google ID token. " +
                    "Please check that google-services.json is correct and your " +
                    "app's SHA-1 is registered in Firebase Console."
                );
                return;
            }

            deliverIdToken(idToken);

        } catch (ApiException e) {
            int statusCode = e.getStatusCode();
            String msg;
            switch (statusCode) {
                case 12501: // SIGN_IN_CANCELLED
                    // User pressed back — not an error, just silently ignore.
                    return;
                case 12502: // SIGN_IN_CURRENTLY_IN_PROGRESS
                    return;
                case 10: // DEVELOPER_ERROR — almost always a SHA-1 / client ID mismatch
                    msg = "Configuration error (code 10): make sure your app's " +
                          "SHA-1 fingerprint is registered in Firebase Console and " +
                          "google-services.json is up to date.";
                    break;
                default:
                    msg = "Google sign-in failed (code " + statusCode + "). Please try again.";
            }
            deliverSignInError(msg);
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Bridge → Web
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Sends the Google ID token back to the web page.
     * The page exchanges it for a Firebase credential with signInWithCredential().
     */
    private void deliverIdToken(final String idToken) {
        // Escape single quotes in the token (JWT tokens never contain them,
        // but defensive is cheap).
        final String safeToken = idToken.replace("'", "\\'");
        final String js = "javascript:window.onNativeGoogleSignIn('" + safeToken + "')";
        runOnUiThread(() -> webView.loadUrl(js));
    }

    /**
     * Sends an error message back to the web page so it can show a toast.
     */
    private void deliverSignInError(final String message) {
        final String safeMsg = message.replace("'", "\\'");
        final String js = "javascript:window.onNativeGoogleSignInError('" + safeMsg + "')";
        runOnUiThread(() -> webView.loadUrl(js));
    }

    // ──────────────────────────────────────────────────────────────────────────
    // WebView setup
    // ──────────────────────────────────────────────────────────────────────────

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        webView = findViewById(R.id.webView);
        final View splashOverlay = findViewById(R.id.splashOverlay);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);          // Firebase Auth needs this
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(false);
        // Append a marker so the web page can detect "running in WinApp WebView"
        // even before the JS bridge is ready.
        String baseUa = settings.getUserAgentString() != null ? settings.getUserAgentString() : "";
        settings.setUserAgentString(baseUa + " WinningTourApp/1.0");

        // Expose the JS bridge as window.WinApp
        webView.addJavascriptInterface(new WebAppInterface(this), "WinApp");

        webView.setWebChromeClient(new WebChromeClient());

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                // Hide the native splash once the page is ready
                if (splashOverlay != null) splashOverlay.setVisibility(View.GONE);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri == null) return false;

                String scheme = uri.getScheme();
                String host   = uri.getHost() != null ? uri.getHost() : "";

                // Keep internal app pages inside the WebView
                for (String h : INTERNAL_HOSTS) {
                    if (host.equals(h)) return false;
                }

                // Firebase auth handler runs on the app domain — keep it in WebView
                if (host.isEmpty() || uri.getPath() != null && uri.getPath().startsWith("/__/auth/")) {
                    return false;
                }

                // Google OAuth redirect — let it open in Chrome Custom Tab / system browser
                // so Google's "disallowed_useragent" check doesn't fire.
                if ("accounts.google.com".equals(host) || host.endsWith(".google.com")) {
                    openInBrowser(uri);
                    return true;
                }

                // Any other external HTTP(S) link → system browser
                if ("https".equals(scheme) || "http".equals(scheme)) {
                    openInBrowser(uri);
                    return true;
                }

                return false;
            }
        });
    }

    private void openInBrowser(Uri uri) {
        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(intent);
    }
}
