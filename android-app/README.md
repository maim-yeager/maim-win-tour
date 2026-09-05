# WinningBD Admin — Android APK

Native shell around the web Admin Panel plus an SMS payment checker that
forwards payment messages to the backend (`/sms-verification/*`). The
backend remains the single authority over all wallet/transaction state —
this app never fabricates data.

## What's inside

- **WebView Admin Panel** — loads `https://winning-tour-web.vercel.app/admin/`,
  session persists across restarts (WebView localStorage). Exposes
  `window.WinAdmin` (device id/token/server url/version) to the panel JS.
- **SMS payment bridge** — listens for sms (manifest priority 999),
  parses it against server-provided provider config, POSTs the parsed
  payload to the backend. On network failure or a 5xx the payload is
  encrypted into an offline FIFO queue and drained later.
- **Foreground `dataSync` service** — keeps the bridge alive, flushes the
  queue every 5 minutes, handles boot / package-replaced restarts.
- **Settings screen** — server URL, Device ID, Device Token, device name,
  "Test connection", SMS permission request, "Sync now", activity log.

## Build

Requirements: JDK 17, Android SDK platform 34.
The Gradle wrapper is included.

```bash
cd android-app
./gradlew assembleDebug        # -> app/build/outputs/apk/debug/app-debug.apk
```

Or open `android-app/` in Android Studio and run on a device.
Install the APK and grant SMS (and, on Android 13+, notification) permission.

## Connect a device

1. Deploy the backend/Vercel project (see repo root). The app defaults to
   `https://winning-tour-web.vercel.app`.
2. Open the Admin Panel at `https://<your-host>/admin/` →
   **SMS Payment Checker** → **Register device**. Copy the generated
   **Device ID** and the one-time **Device token**.
3. In the app: Menu → Settings. Paste the Device ID and token, save, then
   tap **Test connection** (expect `Connected` with device status).
4. Tap **SMS permission** so the bridge can read messages.

The app talks to:
- `GET  /sms-verification/config` — provider config + device status
- `POST /sms-verification/transactions` — submitted payments

Auth: `Authorization: Bearer <token>` + `X-Device-Id: <deviceId>`.
Vercel must rewrite `/sms-verification/(.*)` → `/api` (already in `vercel.json`).

## Provider SMS matching config

Parsing is driven by `app_settings/sms_config` in Firebase (no admin-panel
UI yet — write it as JSON):

```json
{
  "enabled": true,
  "providers": {
    "bkash": {
      "senders": ["BKash", "16247"],
      "keywords": ["payment", "from"],
      "trxPattern": "(TRX\\s*ID[\\s:]*)([A-Z0-9]{10})",
      "amountPattern": "(\\d{1,10}(?:\\.\\d{1,2})?)\\s*(?:BDT|Tk)",
      "minAmount": 1,
      "maxAmount": 1000000
    },
    "nagad":   { "senders": ["Nagad"], "keywords": [], "minAmount": 1, "maxAmount": 1000000 },
    "rocket":  { "senders": ["Rocket"], "keywords": [], "minAmount": 1, "maxAmount": 1000000 },
    "bank":    { "senders": [], "keywords": ["transfer"], "minAmount": 1, "maxAmount": 1000000 },
    "other":   { "senders": [], "keywords": [], "minAmount": 1, "maxAmount": 1000000 }
  }
}
```

For each SMS the app tries labeled `TRX ID`/`Ref`, then the provider
`trxPattern`/`amountPattern`, then heuristic fallbacks. All amounts are
scoped to each provider's `minAmount..maxAmount`; a single unambiguous
candidate wins, and each (provider, trxId, amount) is deduped.

## Reliability

- Offline queue: AES-256-GCM (AndroidKeyStore), capped at 300 entries,
  drained on connectivity changes, "Sync now", and the service tick.
- FGS background-start restrictions are handled: receivers flush inline
  instead of forcing a service start; boot is allowed to start the FGS.
- Matching decimal precision: amounts are rounded to 2 dp before sending
  and validated against the backend `[A-Z0-9._:\-]{4,64}` trx format.

## Layout

```
app/src/main/java/com/winningbd/admin/
  App.kt                  application entry, starts the service
  model/Models.kt         parsed SMS + payload DTOs (JSON (de)serialization)
  sec/Crypto.kt           Keystore AES-GCM + SHA-256
  store/                  prefs, encrypted FIFO sync queue, dedupe, logs
  net/Api.kt              minimal HTTPS client (config + transactions)
  sms/                    receiver, parser, intent handler
  service/                FGS, queue flusher, boot + network receivers
  web/                    WebView shell + WinAdmin JS bridge
  settings/               device connection screen
```