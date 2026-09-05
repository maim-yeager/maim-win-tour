================================================================================
  WINNING BD — মোবাইল দিয়ে সম্পূর্ণ ডিপ্লয় গাইড (কোনো কম্পিউটার লাগবে না)
================================================================================

প্রজেক্টের বিষয়বস্তু:
  - index.html            → User App
  - admin/index.html      → Admin Panel
  - api/                  → Backend (সব টাকার লেনদেন, Vercel Serverless)
  - firebase/database.rules.json → Database rules (console-এ পেস্ট করতে হবে)
  - scripts/bootstrap-owner.js → প্রথম OWNER অ্যাডমিন (১ বার)
  - android-app/          → Admin APK (SMS Payment Checker)
  - winningbd-secrets/    → (প্রজেক্টের বাইরে) Service Account + base64 — Vercel env-এ বসবে
  - .vercelignore, .gitignore → সব secrets/কিছু বের করে দেয়, কখনো deploy/commit হয় না

কী লাগবে:
  - শুধু একটি ফোন + ব্রাউজার (Chrome)
  - এই ডিভাইসে (প্রজেক্ট ফোল্ডারে) node/npm আগে থেকেই আছে → vercel CLI + bootstrap এখানেই চলে
  - Vercel account ও GitHub account (ঐচ্ছিক)

================================================================================
কাজের ক্রম (concise):
  ১. Firebase console → Auth enable + Realtime DB create
  ২. Firebase console → Rules পেস্ট + Publish (CLI লাগবে না!)
  ৩. এই ডিভাইস থেকেই: vercel CLI দিয়ে deploy (login → env → deploy)
  ৪. bootstrap:owner → RECOVERY CODE সেভ
  ৫. Admin Panel login → Settings → (যা ইচ্ছে)
  ৬. (ঐচ্ছিক) sms_config node + APK

================================================================================
১. Firebase (console.firebase.google.com — ব্রাউজার দিয়েই সব)
================================================================================
  a) Project "winningbdupdate" নির্বাচন/তৈরি ✔ (আগে থেকেই আছে)

  b) Authentication → Sign-in method → Email/Password → Enable
     (user app-এর signup/login এর জন্য; admin login কোডে আছে)

  c) Build → Realtime Database → Create database → Start in production mode
     ‍ডেটাবেস URL লিখে রাখুন (console-এ যা দেখাবে), যেমন:
        https://winningbdupdate-default-rtdb.firebaseio.com
     ⚠️ যদি console-এর URL ভিন্ন হয়, তাহলে index.html এর firebaseConfig databaseURL +
     নিচে ৩-এ দেওয়া FIREBASE_DB_URL মিলিয়ে নিন।

  d) Rules পাবলিশ (CLI ছাড়াই):
       Build → Realtime Database → Rules ট্যাব
       → এরপর firebase/database.rules.json ফাইলের পুরোটা খুলে কপি করুন
         (এই ডিভাইসের File Manager বা এডিটর দিয়ে)
       → console-এর এডিটরে পুরো কনটেন্ট পেস্ট করুন → Publish ✅
       (নিজে firebase.json দরকার নেই — console সরাসরি rules নেয়)

================================================================================
২. Service Account — রেডি সেট (আর কিছু করতে হবে না)
================================================================================
  - /mnt/sdcard/1DM/winningbd-secrets/service-account.b64 (৩১৮০ অক্ষর এক লাইনে)
  - এটি শুধু Vercel env (FIREBASE_SERVICE_ACCOUNT_B64)-তে বসাতে হবে
  - নিচের "vercel env add" কমান্ডটি এখান থেকেই চালালে ফাইল থেকে অটো নেয়

================================================================================
৩. Vercel-এ ডিপ্লয় — এই ফোন/ডিভাইস থেকেই
================================================================================
  ৩.১ Vercel CLI ব্যবহার (সবচেয়ে সহজ — এই ডিভাইসে node আছে):

        npm install -g vercel
        vercel login          # ফোনেই ব্রাউজারে code গিয়ে confirm
        vercel link           # Project-টি "winning-tour-web" নির্বাচন/তৈরি

        # Environment Variables (Production + Preview):
        echo -n "$(cat /mnt/sdcard/1DM/winningbd-secrets/service-account.b64)" | vercel env add FIREBASE_SERVICE_ACCOUNT_B64 production
        echo -n "$(cat /mnt/sdcard/1DM/winningbd-secrets/service-account.b64)" | vercel env add FIREBASE_SERVICE_ACCOUNT_B64 preview
        echo -n "https://winningbdupdate-default-rtdb.firebaseio.com" | vercel env add FIREBASE_DB_URL production
        echo -n "https://winningbdupdate-default-rtdb.firebaseio.com" | vercel env add FIREBASE_DB_URL preview

        vercel --prod          # সব deploy হয়ে যাবে

  ৩.২ (বিকল্প) একান্তই CLI না চাইলে — GitHub + Vercel import:
        - GitHub অ্যাপে একটি جدید repo বানিয়ে files আপলোড করুন
          (node_modules ‌bad — পুরো folder নয়, শুধু এই ফোল্ডারের ফাইলগুলো)
        - এদিকে Vercel → Add New Project → Import Git Repo
        - Settings → Environment Variables-এ দুইটি যোগ করুন
          (FIREBASE_SERVICE_ACCOUNT_B64 = service-account.b64 পুরোটা,
           FIREBASE_DB_URL = ...default-rtdb.firebaseio.com)
        - Deploy ✅

  ৩.৩ ডিপ্লয় শেষে হলেই চালু:
        /                     → User App
        /admin                → Admin Panel
        /api/*                → Backend
        /sms-verification/*   → APK endpoints
        ডোমেইন: https://winning-tour-web.vercel.app
        (কাস্টম ডোমেন লাগলে Vercel → Settings → Domains যোগ করুন — কোডে কিছু লাগে না)

================================================================================
৪. OWNER (প্রথম অ্যাডমিন) — এখানেই, কমান্ড একদফা
================================================================================
      cd /mnt/sdcard/1DM/winningbd
      FIREBASE_SERVICE_ACCOUNT_B64="$(cat /mnt/sdcard/1DM/winningbd-secrets/service-account.b64)" \
      FIREBASE_DB_URL="https://winningbdupdate-default-rtdb.firebaseio.com" \
      OWNER_ID="OWNER1" OWNER_NAME="Your Name" OWNER_EMAIL="you@example.com" \
      OWNER_PASSWORD="strong-password-1" \
      npm run bootstrap:owner

   ✅ 8-অক্ষরের RECOVERY CODE ছাপা হবে — এখনই সেভ করুন (১ বার দেখায়)।
   এরপর ফোনের ব্রাউজারে:  https://winning-tour-web.vercel.app/admin
   OWNER1 + password দিয়ে login ✅

================================================================================
৫. Admin Panel (login-এর পর)
================================================================================
  - Settings/Apper Settings → company info, limits → Save
  - Payment Settings → bKash/Nagad/Rocket/Bank enabled → Save
  - SMS Checker → Register device (Device ID + ১ বার token)
  - Banners, Categories, Matches, Promos → তৈরী করুন (user app-এ সাথে সাথে দেখা যায়)

================================================================================
৬. SMS Payment Checker (ঐচ্ছিক)
================================================================================
  a) (ঐচ্ছিক) sms_config — এটির panel UI নেই, Firebase console দিয়েই লাগাতে হয়:
       Build → Realtime Database → + (নতুন node):
       app_settings  →  sms_config  →
         { "enabled": true,
           "providers": {
             "bkash": { "senders": ["BKash","16247"], "keywords": [],
                        "trxPattern": "(TRX[\\s]*ID[\\s:]*)([A-Z0-9]{10})",
                        "amountPattern": "(\\d{1,10}(?:\\.\\d{1,2})?)\\s*(?:BDT|Tk)",
                        "minAmount": 1, "maxAmount": 1000000 },
             "nagad":  { "senders": ["Nagad"], "minAmount": 1, "maxAmount": 1000000 },
             "rocket": { "senders": ["Rocket"], "minAmount": 1, "maxAmount": 1000000 },
             "bank":   { "senders": [], "keywords": ["transfer"], "minAmount": 1, "maxAmount": 1000000 },
             "other":  { "senders": [], "keywords": [], "minAmount": 1, "maxAmount": 1000000 } } }
  b) APK বিল্ডে ডেস্কটপ লাগে (Android Studio)। ফোনে না দিলে—Admin Panel-এর
     SMS Checker ট্যাবের ডেটা watch করতে পারেন, auto-verification বন্ধ রাখুন।
     (চাইলে GitHub Actions দিয়ে online APK build বানিয়ে দিতে পারি — বললেই
     .github/workflows/android-build.yml যোগ করব)

================================================================================
৭. টেস্ট চেকলিস্ট
================================================================================
  [ ] https://winning-tour-web.vercel.app             → User App খোলে
  [ ] https://winning-tour-web.vercel.app/admin       → Login পেজ
  [ ] OWNER1 login হয়
  [ ] User App-এ deposit submit → Admin → Deposits-এ PENDING
  [ ] Pending deposit approve → user-এর deposit balance বাড়ে
  [ ] (SMS হলে) SMS Checker-এ transaction দেখা যায়
  [ ] ফোন ব্রাউজারে https://winning-tour-web.vercel.app/admin ফ্রেশ (Ctrl+Shift+R)

================================================================================
৮. কমন সমস্যা
================================================================================
  Q: /admin/auth/login 500
  A: Vercel env FIREBASE_SERVICE_ACCOUNT_B64 + FIREBASE_DB_URL আছে? env add-এ
     base64-র মাঝে line-break/স্পেস ঢুকেনি তো? (echo -n দিয়ে যুক্ত হয়)
  Q: User App login হয় না
  A: Firebase Authentication এ Email/Password enabled? (ধাপ ১-b)
  Q: Rules পেস্ট করা হয়নি
  A: Realtime Database → Rules → পুরো JSON → Publish
  Q: APK "Connection failed"
  A: ServerUrl = https://winning-tour-web.vercel.app (শেষে / নেই), Device ID+Token সঠিক,
     devices status CONNECTED

================================================================================
  প্রোডাকশন টিপস: Password recovery → Admin → Security Center → code (১০ মিনিট)
  সমস্ত টাকার হিসাব wallet_ledger (append-only) এ — audit/রিপোর্টের ভিত্তি
================================================================================