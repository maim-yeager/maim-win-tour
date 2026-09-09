package com.winningbd.admin.web;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.Menu;
import android.view.MenuItem;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.Toolbar;
import com.winningbd.admin.R;
import com.winningbd.admin.service.QueueFlusher;
import com.winningbd.admin.service.SmsBridgeService;
import com.winningbd.admin.settings.SettingsActivity;
import com.winningbd.admin.store.Prefs;

public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private Prefs prefs;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        Toolbar toolbar = findViewById(R.id.toolbar);
        setSupportActionBar(toolbar);

        prefs = new Prefs(this);
        webView = findViewById(R.id.webView);
        setupWebView();
        
        SmsBridgeService.ensureStarted(this);
        QueueFlusher.flushAsync(this);

        String url = prefs.getServerUrl().trim().replaceAll("/+$", "") + "/admin/";
        webView.loadUrl(url);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setUserAgentString((settings.getUserAgentString() != null ? settings.getUserAgentString() : "") + " WinningBDAdmin/1.0");
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (url == null) return false;
                String host = url.getHost();
                if (host == null) return false;
                
                String expectedHost;
                try {
                    expectedHost = new URL(prefs.getServerUrl()).getHost();
                } catch (Exception e) {
                    return false;
                }
                
                if (host.equals(expectedHost) && (url.getScheme().equals("https") || url.getScheme().equals("http"))) {
                    return false;
                }
                
                if (url.getScheme().equals("https") || url.getScheme().equals("http")) {
                    Intent intent = new Intent(Intent.ACTION_VIEW, url);
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                    return true;
                }
                return false;
            }
        });

        webView.addJavascriptInterface(new AdminWebInterface(this), "WinAdmin");
    }

    @Override
    public boolean onCreateOptionsMenu(Menu menu) {
        getMenuInflater().inflate(R.menu.menu_main, menu);
        return true;
    }

    @Override
    public boolean onOptionsItemSelected(MenuItem item) {
        int id = item.getItemId();
        if (id == R.id.action_sync) {
            QueueFlusher.flushAsync(this);
            return true;
        } else if (id == R.id.action_reload) {
            webView.reload();
            return true;
        } else if (id == R.id.action_settings) {
            startActivity(new Intent(this, SettingsActivity.class));
            return true;
        }
        return super.onOptionsItemSelected(item);
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}