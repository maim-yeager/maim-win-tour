# Winning Tour — User Android App

WebView wrapper for `index.html` with **native Google Sign-In** bridge.

---

## One-time setup (required before building)

### 1. google-services.json
Download from **Firebase Console → Project Settings → General → Your apps → Android app**
and place it at:

```
android-user/app/google-services.json
```

If there is no Android app registered yet, click **Add app → Android**, use package name:
`com.winningbd.app`, and follow the steps.

### 2. SHA-1 fingerprint
Google Sign-In requires your keystore's SHA-1 to be registered in Firebase.

Debug builds use the default debug keystore:
```bash
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
```

Copy the **SHA-1** value and paste it in:
**Firebase Console → Project Settings → Your apps → Android app → Add fingerprint**

For release builds, use your own keystore's SHA-1 instead.

### 3. Web Client ID
After registering the SHA-1 and downloading an updated `google-services.json`:

1. Open **Google Cloud Console → APIs & Services → Credentials**
2. Find the **OAuth 2.0 Client ID** whose type is **Web client (auto created by Google Service)**
3. Copy its Client ID (ends in `.apps.googleusercontent.com`)
4. Paste it into `app/src/main/res/values/strings.xml`:

```xml
<string name="default_web_client_id">PASTE_YOUR_WEB_CLIENT_ID_HERE</string>
```

### 4. App URL
In `app/src/main/res/values/strings.xml`, set your deployed web app URL:
```xml
<string name="web_app_url">https://your-deployed-app-url/</string>
```

---

## How the Google Sign-In bridge works

```
Web page                             Android (Java)
──────────────────────────────────────────────────────────
User taps "Sign in with Google"
  → window.WinApp.startGoogleSignIn()
                                     WebAppInterface.startGoogleSignIn()
                                       → MainActivity.launchGoogleSignIn()
                                         → Google native account picker (Intent)
                                         ← User selects Gmail account
                                         ← GoogleSignInAccount + ID token
                                     deliverIdToken(idToken)
  window.onNativeGoogleSignIn(token) ←
  signInWithCredential(auth, GoogleAuthProvider.credential(token))
  → Firebase Auth user ✓
  → finishGoogleSignIn(user)
  → App authenticated state ✓
```

---

## Build

```bash
cd android-user
./gradlew assembleDebug          # debug APK
./gradlew assembleRelease        # release APK (needs signing config)
```

Output APK: `app/build/outputs/apk/debug/app-debug.apk`

---

## Internal hosts (WebView vs. system browser)

Edit `INTERNAL_HOSTS` in `MainActivity.java` to match your domain(s):
```java
private static final String[] INTERNAL_HOSTS = {
    "winning-tour.vercel.app",
    "winningtour.com",
    "www.winningtour.com"
};
```

Google's `accounts.google.com` is intentionally sent to the system browser to avoid
Google's **disallowed_useragent** block on plain WebViews.
