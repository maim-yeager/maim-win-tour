# WINNING BD - Complete Deployment Guide
## All Latest Updates & Features

---

## 🎯 What's New in This Update

### 1. **Security: Domain Protection**
- ✅ App now blocks unauthorized domains
- ✅ Shows custom "এই এপসটা কি তোর নানার নাকি?" message on unauthorized access
- ✅ Only `winning-tour-web.vercel.app` is allowed (localhost OK for testing)
- ✅ Works on both User App and Admin Panel

### 2. **Admin Panel: Media Gallery**
- ✅ Add images via URL link
- ✅ Organize images with labels (Logo, Banner 1, etc.)
- ✅ Delete images from gallery
- ✅ New "Media Gallery" tab in Settings page
- ✅ Backend API for media management

### 3. **Bug Fixes**
- ✅ Admin ID login now works (was broken - case sensitivity issue fixed)
- ✅ Admin buttons now properly responsive
- ✅ Error logging added for debugging
- ✅ All sidebar navigation buttons functional

---

## 📱 Deploy on Mobile (Termux) - Step by Step

### **Step 1: Download & Extract**
```bash
# In Termux
cd ~
wget https://your-url-to-winningbdt-fixed.zip -O winning-fixed.zip
unzip -q winning-fixed.zip -d winning-tour-web
cd winning-tour-web
```

### **Step 2: Clean & Install**
```bash
npm install --quiet
```

### **Step 3: Set Environment Variables**

**Create/update `.env.local`:**
```bash
VERCEL_OIDC_TOKEN=your_token_here
FIREBASE_DB_URL=https://winningbdupdate-default-rtdb.asia-southeast1.firebasedatabase.app
FIREBASE_SERVICE_ACCOUNT_B64=your_base64_encoded_service_account
```

**Also set on Vercel cloud:**
```bash
vercel env add FIREBASE_DB_URL production
# Paste: https://winningbdupdate-default-rtdb.asia-southeast1.firebasedatabase.app

vercel env add FIREBASE_SERVICE_ACCOUNT_B64 production
# Paste your base64 encoded service account

# Do the same for preview environment
vercel env add FIREBASE_DB_URL preview
vercel env add FIREBASE_SERVICE_ACCOUNT_B64 preview
```

### **Step 4: Deploy**
```bash
vercel --prod
```

Wait for completion (2-3 minutes). Check status at: `https://vercel.com/your-account/winning-tour-web`

### **Step 5: Create Owner Account** (One-time setup)
```bash
FIREBASE_DB_URL="https://winningbdupdate-default-rtdb.asia-southeast1.firebasedatabase.app" \
FIREBASE_SERVICE_ACCOUNT_B64="your_base64_key" \
OWNER_ID="OWNER1" \
OWNER_NAME="আপনার নাম" \
OWNER_EMAIL="your@email.com" \
OWNER_PASSWORD="শক্তিশালী-পাসওয়ার্ড" \
npm run bootstrap:owner
```

**Save the Recovery Code shown!** ⚠️ Don't lose it.

---

## 🔧 Admin Panel Features

### **Login to Admin:**
- URL: `https://winning-tour-web.vercel.app/admin`
- Username: `OWNER1` (or your custom ADMIN ID)
- Password: What you set during bootstrap

### **Media Gallery (New):**
1. Go to **Settings** (⚙️ icon in sidebar)
2. Click **"Media Gallery"** tab
3. Paste image URL in the input field
4. Give it a label (e.g., "App Logo", "Banner 1")
5. Click **"Add image"** button
6. Images appear in grid below
7. Click **"Delete"** to remove

**Example URLs to use:**
```
https://i.ibb.co/whcG0rC6/image.png
https://example.com/my-image.jpg
https://via.placeholder.com/1200x600
```

### **Dashboard Features:**
- **Dashboard** - Overview & stats
- **Users** - Manage players
- **Wallet** - User balance management
- **Deposits/Withdrawals** - Process payments
- **Matches** - Create & manage tournaments
- **Categories** - Set up game types
- **Notifications** - Send in-app messages
- **Banners** - Manage app banners
- **SMS Checker** - Auto-verify payments
- **Admin Management** - Create other admins
- **Security Center** - Manage sessions & passwords

---

## 🛡️ Security Features

### **Domain Protection**
If someone tries to access:
- `localhost` ✅ Allowed (testing)
- `127.0.0.1` ✅ Allowed (testing)
- `winning-tour-web.vercel.app` ✅ Allowed (production)
- Any other domain ❌ Blocked with message

**Message shown:**
```
🎮 WINNING BD
Tournament Platform

এই এপসটা কি তোর নানার নাকি?

⚠️ Unauthorized domain detected
Domain: [user's domain]
```

---

## ⚠️ Important Notes

### **Admin ID Rules:**
- Must be UPPERCASE (e.g., `OWNER1`, `ADMIN1`)
- Only alphanumeric + underscore
- Cannot use lowercase or special characters

### **Firebase Database URL:**
Make sure you're using the **Asia Southeast 1 region**:
```
https://winningbdupdate-default-rtdb.asia-southeast1.firebasedatabase.app
```

NOT the old one:
```
https://winningbdupdate-default-rtdb.firebaseio.com  ❌ Wrong
```

### **Vercel Environment Variables:**
After setting vars on Vercel, **you MUST redeploy**:
```bash
vercel --prod
```

---

## 🚀 Troubleshooting

### **Admin buttons don't work?**
1. Open Console: Chrome menu → More tools → Developer tools
2. Try a button
3. Check for red error messages
4. If error: Make sure `FIREBASE_SERVICE_ACCOUNT_B64` is set

### **Login fails with OWNER1?**
- Check password carefully (case-sensitive)
- Make sure bootstrap was successful
- Try creating a NEW admin from OWNER account

### **Images not uploading in gallery?**
- Make sure URL is valid (starts with `http://` or `https://`)
- Try opening URL in browser first to verify it works
- Check Admin permissions: Settings > Admin Management > Your admin

### **"Unauthorized domain" message?**
This is INTENTIONAL for security! Only `winning-tour-web.vercel.app` should work in production.

---

## 📞 Quick Commands Reference

```bash
# Login to Vercel
vercel login

# Check deployment status
vercel projects

# View logs
vercel logs winning-tour-web

# Setup env vars
vercel env ls
vercel env add VARIABLE_NAME

# Redeploy
vercel --prod

# Delete deployment
vercel remove winning-tour-web

# Create owner (one-time)
npm run bootstrap:owner
```

---

## 🎯 Next Steps

1. ✅ Extract & deploy the fixed zip
2. ✅ Create OWNER account with bootstrap command
3. ✅ Login to `/admin` and verify all buttons work
4. ✅ Upload app logo/banner to Media Gallery
5. ✅ Create game categories & matches
6. ✅ Configure payment methods (bKash/Nagad/Rocket)
7. ✅ Test user app login at root URL

---

## 📧 Support

If you encounter issues:
1. Check console errors (F12 → Console)
2. Verify environment variables on Vercel
3. Make sure Firebase database rules are published
4. Check network requests (F12 → Network tab)

**Good luck! 🚀**
