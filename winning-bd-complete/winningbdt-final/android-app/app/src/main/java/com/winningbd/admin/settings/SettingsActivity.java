package com.winningbd.admin.settings;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;
import com.winningbd.admin.R;
import com.winningbd.admin.store.Prefs;

public class SettingsActivity extends AppCompatActivity {

    private Prefs prefs;
    private EditText etServerUrl;
    private EditText etDeviceId;
    private EditText etDeviceToken;
    private EditText etDeviceName;
    private Button btnRegister;
    private Button btnSave;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_settings);
        
        prefs = new Prefs(this);
        
        etServerUrl = findViewById(R.id.etServerUrl);
        etDeviceId = findViewById(R.id.etDeviceId);
        etDeviceToken = findViewById(R.id.etDeviceToken);
        etDeviceName = findViewById(R.id.etDeviceName);
        btnRegister = findViewById(R.id.btnRegister);
        btnSave = findViewById(R.id.btnSave);

        loadCurrentValues();
        
        btnRegister.setOnClickListener(v -> registerDevice());
        btnSave.setOnClickListener(v -> saveSettings());
    }

    private void loadCurrentValues() {
        etServerUrl.setText(prefs.getServerUrl());
        etDeviceId.setText(prefs.getDeviceId());
        etDeviceToken.setText(prefs.getDeviceToken());
        etDeviceName.setText(prefs.getDeviceName());
    }

    private void saveSettings() {
        String serverUrl = etServerUrl.getText().toString().trim();
        String deviceName = etDeviceName.getText().toString().trim();
        
        if (serverUrl.isEmpty()) {
            Toast.makeText(this, "Server URL is required", Toast.LENGTH_SHORT).show();
            return;
        }
        
        prefs.setServerUrl(serverUrl);
        prefs.setDeviceName(deviceName);
        Toast.makeText(this, "Settings saved", Toast.LENGTH_SHORT).show();
    }

    private void registerDevice() {
        String serverUrl = etServerUrl.getText().toString().trim();
        if (serverUrl.isEmpty()) {
            Toast.makeText(this, "Server URL is required", Toast.LENGTH_SHORT).show();
            return;
        }
        
        prefs.setServerUrl(serverUrl);
        
        // Generate a device ID
        String deviceId = "device_" + System.currentTimeMillis() + "_" + 
            java.util.UUID.randomUUID().toString().substring(0, 8);
        String deviceName = etDeviceName.getText().toString().trim();
        if (deviceName.isEmpty()) {
            deviceName = "Admin APK (" + new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(new java.util.Date()) + ")";
        }
        
        // Call the backend to register the device
        new RegisterDeviceTask().execute(serverUrl, deviceId, deviceName);
    }

    private class RegisterDeviceTask extends android.os.AsyncTask<String, Void, String> {
        @Override
        protected String doInBackground(String... params) {
            String serverUrl = params[0];
            String deviceId = params[1];
            String deviceName = params[2];
            
            try {
                // First, we need to authenticate as admin to get a token
                // This is a simplified version - in reality, the admin would log in first
                // For now, we'll just save the device ID locally
                prefs.setDeviceId(deviceId);
                prefs.setDeviceName(deviceName);
                
                // Generate a token (in real app, this comes from backend after admin login)
                String token = java.util.UUID.randomUUID().toString().replace("-", "") + 
                    java.util.UUID.randomUUID().toString().replace("-", "");
                prefs.setDeviceToken(token);
                
                return "Device ID generated locally. Please register this device in the Admin Panel (Devices page) to get a valid token.";
            } catch (Exception e) {
                return "Error: " + e.getMessage();
            }
        }
        
        @Override
        protected void onPostExecute(String result) {
            Toast.makeText(SettingsActivity.this, result, Toast.LENGTH_LONG).show();
            loadCurrentValues();
        }
    }
}