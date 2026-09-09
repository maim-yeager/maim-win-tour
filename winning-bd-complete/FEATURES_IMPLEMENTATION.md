# WINNING BD - New Features Implementation Guide

## 📋 Features to Add/Fix

### 1️⃣ Existing Gallery System Check ✅
**Status:** The existing gallery system in admin panel (`admin/index.html`) uses:
- Direct image URL input in settings
- Media gallery storage at Firebase `media_gallery` path
- Backend API at `/admin/media` (GET/POST/DELETE)

**For Banner & Category:** 
- Admin adds images via URL → stored in Firebase
- User app displays images from URLs
- System is already modular and working

**No changes needed** - existing system is optimal.

---

### 2️⃣ Google Sign-In Integration

#### HTML Changes (Add to Login Page)

**Location:** `index.html` - find `id="login-page"` section

**Add this before email input:**

```html
<button type="button" id="google-signin-btn" 
        onclick="signInWithGoogle()"
        style="width:100%;padding:14px;margin-bottom:20px;background:#fff;border:2px solid #e0e0e0;
                border-radius:8px;cursor:pointer;font-weight:700;color:#333;
                display:flex;align-items:center;justify-content:center;gap:10px;
                transition:all 0.3s;">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
    Sign in with Google
</button>

<div style="display:flex;align-items:center;gap:10px;margin:20px 0;opacity:0.6;">
    <div style="flex:1;height:1px;background:var(--border);"></div>
    <span style="font-size:0.85rem;">or continue with email</span>
    <div style="flex:1;height:1px;background:var(--border);"></div>
</div>
```

#### JavaScript Function (Add before `</script>` tag)

```javascript
// ========== GOOGLE SIGN-IN ==========
window.signInWithGoogle = async function() {
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({
            prompt: 'select_account'
        });
        
        const result = await auth.signInWithPopup(provider);
        const user = result.user;
        
        // Check if user exists in database
        const userRef = ref(db, 'users/' + user.uid);
        const userSnap = await get(userRef);
        
        if (!userSnap.exists()) {
            // New user - create profile
            await set(userRef, {
                username: user.displayName || user.email.split('@')[0],
                email: user.email,
                phone: user.phoneNumber || '',
                profilePicture: user.photoURL || '',
                deposit: 0,
                winning: 0,
                created: serverTimestamp()
            });
        } else {
            // Update profile picture if exists
            const userData = userSnap.val();
            if (user.photoURL && !userData.profilePicture) {
                await update(userRef, {
                    profilePicture: user.photoURL
                });
            }
        }
        
        showToast('Google sign-in successful!', 'success');
        document.getElementById('auth-container').style.visibility = 'hidden';
        
    } catch (error) {
        let message = 'Google sign-in failed.';
        if (error.code === 'auth/popup-blocked') {
            message = 'Popup blocked. Please enable popups.';
        } else if (error.code === 'auth/popup-closed-by-user') {
            message = 'Sign-in cancelled.';
        }
        showToast(message, 'error');
    }
};
```

---

### 3️⃣ User Profile Picture Upload

#### HTML Changes (Update Edit Profile Section)

**Location:** `index.html` - find `id="edit-profile-view"`

**Replace the entire section with:**

```html
<section id="edit-profile-view" class="app-section">
    <div style="padding: 20px;">
        <div class="back-nav" onclick="navigateBack('profile')" style="margin: 0 0 20px 0;">
            <i class="fas fa-arrow-left"></i>
            <span>EDIT PROFILE</span>
        </div>
        
        <div style="background: var(--bg-primary); border-radius: var(--radius-lg); padding: 30px; box-shadow: var(--shadow-neumorphic-sm);">
            <!-- Profile Picture Upload -->
            <div style="margin-bottom: 30px;">
                <label style="font-weight: 900; font-size: 0.9rem; display: block; margin-bottom: 15px; color: var(--text-dark);">
                    <i class="fas fa-image"></i> Profile Picture
                </label>
                <div style="position: relative; width: 120px; margin: 0 auto 15px;">
                    <img id="preview-profile-pic" src="https://cdn-icons-png.flaticon.com/512/149/149071.png" 
                         style="width: 120px; height: 120px; border-radius: 50%; border: 3px solid var(--primary); object-fit: cover; box-shadow: var(--shadow-neumorphic-sm);">
                </div>
                
                <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                    <input type="file" id="profile-pic-upload" accept="image/*" style="display: none;">
                    <button onclick="document.getElementById('profile-pic-upload').click()" 
                            class="primary-btn" style="flex: 1; font-size: 0.9rem;">
                        <i class="fas fa-camera"></i> Upload from Device
                    </button>
                    <button onclick="showProfilePictureGallery()" 
                            class="primary-btn" style="flex: 1; font-size: 0.9rem;">
                        <i class="fas fa-images"></i> From Gallery
                    </button>
                </div>
                <div id="profile-pic-msg" class="form-msg" style="font-size: 0.85rem;"></div>
            </div>
            
            <hr style="opacity: 0.2; margin: 20px 0;">
            
            <!-- Name Field -->
            <label style="font-weight: 900; font-size: 0.9rem; display: block; margin-bottom: 10px; color: var(--text-dark);">
                <i class="fas fa-user"></i> Full Name
            </label>
            <input type="text" id="edit-name" class="auth-input" placeholder="Enter your full name" style="margin-bottom: 20px;">
            
            <button class="primary-btn" onclick="saveProfile()" style="width: 100%;">
                <i class="fas fa-save"></i> UPDATE PROFILE
            </button>
        </div>
    </div>
</section>
```

#### JavaScript Functions (Add before `</script>` tag)

```javascript
// ========== PROFILE PICTURE MANAGEMENT ==========
let userProfilePictureData = null;

document.addEventListener('DOMContentLoaded', function() {
    const profilePicInput = document.getElementById('profile-pic-upload');
    if (profilePicInput) {
        profilePicInput.addEventListener('change', handleProfilePicUpload);
    }
});

function handleProfilePicUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    // Validate file
    if (!file.type.startsWith('image/')) {
        showToast('Please select an image file', 'error');
        return;
    }
    
    if (file.size > 5 * 1024 * 1024) { // 5MB limit
        showToast('Image size must be less than 5MB', 'error');
        return;
    }
    
    // Convert to data URL
    const reader = new FileReader();
    reader.onload = function(event) {
        userProfilePictureData = event.target.result;
        const preview = document.getElementById('preview-profile-pic');
        preview.src = userProfilePictureData;
        
        const msg = document.getElementById('profile-pic-msg');
        if (msg) {
            msg.textContent = '✓ Image ready to upload (click UPDATE PROFILE to save)';
            msg.className = 'form-msg ok';
        }
    };
    reader.readAsDataURL(file);
}

function showProfilePictureGallery() {
    if (!currentUser) {
        showAuthScreen();
        return;
    }
    
    const galleryHTML = `
        <div style="max-height: 60vh; overflow-y: auto;">
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 12px; padding: 20px;">
                <div onclick="setProfilePictureFromUrl('https://cdn-icons-png.flaticon.com/512/149/149071.png')" 
                     style="cursor: pointer; border-radius: 10px; overflow: hidden; border: 2px solid var(--border); transition: all 0.3s;">
                    <img src="https://cdn-icons-png.flaticon.com/512/149/149071.png" style="width: 100%; height: 100px; object-fit: cover;">
                </div>
                <div onclick="setProfilePictureFromUrl('https://api.dicebear.com/7.x/avataaars/svg?seed=' + currentUser.uid)" 
                     style="cursor: pointer; border-radius: 10px; overflow: hidden; border: 2px solid var(--border); transition: all 0.3s;">
                    <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=default" style="width: 100%; height: 100px; object-fit: cover;">
                </div>
            </div>
            <div id="media-gallery-section" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 12px; padding: 20px;"></div>
        </div>
    `;
    
    openModal(
        '<div class="modal-head"><h3><i class="fas fa-images"></i> Select Profile Picture</h3><button class="icon-btn" onclick="closeExitModal()"><i class="fas fa-xmark"></i></button></div>' +
        '<div class="modal-body">' + galleryHTML + '</div>',
        loadProfileGallery
    );
}

function loadProfileGallery() {
    const container = document.getElementById('media-gallery-section');
    if (!container) return;
    
    try {
        db().ref('media_gallery').once('value', function(snapshot) {
            if (!snapshot.exists()) {
                container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 20px; color: var(--text-light);">No gallery items</div>';
                return;
            }
            
            const items = [];
            snapshot.forEach(child => {
                items.push({ url: child.val().url, label: child.val().label });
            });
            
            container.innerHTML = items.map(item => `
                <div onclick="setProfilePictureFromUrl('${item.url}')" 
                     style="cursor: pointer; border-radius: 10px; overflow: hidden; border: 2px solid var(--border); transition: all 0.3s; position: relative;" 
                     onmouseover="this.style.borderColor='var(--primary)'" 
                     onmouseout="this.style.borderColor='var(--border)'">
                    <img src="${item.url}" style="width: 100%; height: 100px; object-fit: cover;">
                    <div style="position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.5); color: #fff; font-size: 10px; padding: 4px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.label}</div>
                </div>
            `).join('');
        });
    } catch (e) {
        console.error('Error loading gallery:', e);
    }
}

function setProfilePictureFromUrl(url) {
    userProfilePictureData = url;
    const preview = document.getElementById('preview-profile-pic');
    preview.src = url;
    closeExitModal();
    
    const msg = document.getElementById('profile-pic-msg');
    if (msg) {
        msg.textContent = '✓ Image ready to upload (click UPDATE PROFILE to save)';
        msg.className = 'form-msg ok';
    }
}

// Enhanced saveProfile function
const originalSaveProfile = window.saveProfile;
window.saveProfile = async function() {
    if (!currentUser) {
        showAuthScreen();
        return;
    }
    
    const name = document.getElementById('edit-name').value.trim();
    if (!name) {
        showToast('Please enter your name', 'error');
        return;
    }
    
    try {
        const updates = {
            username: name
        };
        
        // If profile picture was selected, add it to updates
        if (userProfilePictureData && userProfilePictureData !== (currentUserData && currentUserData.profilePicture)) {
            updates.profilePicture = userProfilePictureData;
        }
        
        await update(ref(db, 'users/' + currentUser.uid), updates);
        await firebaseUpdateProfile(currentUser, { displayName: name });
        
        // Update UI
        const avatarEl = document.getElementById('profile-avatar');
        if (avatarEl && updates.profilePicture) {
            avatarEl.src = updates.profilePicture;
        }
        
        showToast('Profile updated successfully!', 'success');
        setTimeout(() => navigateBack('profile'), 1500);
    } catch (error) {
        showToast(error.message, 'error');
    }
};
```

---

### 4️⃣ WhatsApp & Telegram FAB Animation

#### CSS Changes (Add to `<style>` section)

**Find existing FAB CSS** (around line 735-790) **and replace with:**

```css
/* ===== FLOATING ACTION BUTTONS (FAB) - ANIMATED ===== */
.fab-whatsapp, .fab-telegram {
    position: fixed;
    right: 20px;
    bottom: 80px;
    width: 60px;
    height: 60px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    font-size: 28px;
    z-index: 39;
    
    /* Default hidden state */
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transform: translateX(120px) scale(0.5);
    transition: opacity 0.4s cubic-bezier(0.34, 1.56, 0.64, 1),
                visibility 0.4s ease,
                transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.fab-whatsapp {
    background: #25D366;
    bottom: 100px;
}

.fab-telegram {
    background: #0088cc;
    bottom: 35px;
}

/* VISIBLE STATE - when .show-fab class added to home section */
.app-section.active.show-fab .fab-whatsapp,
.app-section.active.show-fab .fab-telegram {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
    transform: translateX(0) scale(1);
}

/* Staggered animation for Telegram (slightly delayed) */
.fab-telegram {
    transition-delay: 0.05s, 0.05s, 0.08s;
}

.fab-whatsapp:hover, .fab-telegram:hover {
    box-shadow: 0 6px 20px rgba(0,0,0,0.25);
    transform: translateX(0) scale(1.1);
}

.fab-whatsapp:active, .fab-telegram:active {
    transform: translateX(0) scale(0.95);
}

.fab-whatsapp i {
    color: white;
    pointer-events: none;
}

.fab-telegram img {
    width: 36px;
    height: 36px;
    filter: brightness(0) invert(1);
    pointer-events: none;
}

/* Auto-hide animation when timer runs out */
.fab-whatsapp.hiding,
.fab-telegram.hiding {
    opacity: 0;
    visibility: hidden;
    transform: translateX(120px) scale(0.5);
}
```

#### JavaScript Functions (Add before `</script>` tag)

```javascript
// ========== FAB ANIMATION SYSTEM ==========
let fabShowTimer = null;
let fabAutoHideTimer = null;
const FAB_AUTO_HIDE_DELAY = 4000; // 4 seconds

function setupFABInteraction() {
    const homeSection = document.getElementById('home-view');
    if (!homeSection) return;
    
    // Show FABs when clicking home section
    homeSection.addEventListener('pointerdown', function(e) {
        // Don't trigger if clicking on existing FAB buttons
        if (e.target.closest('.fab-whatsapp') || e.target.closest('.fab-telegram')) {
            return;
        }
        
        showFABButtons();
    });
}

function showFABButtons() {
    const homeSection = document.getElementById('home-view');
    const whatsappBtn = document.querySelector('.fab-whatsapp');
    const telegramBtn = document.querySelector('.fab-telegram');
    
    if (!homeSection || !whatsappBtn || !telegramBtn) return;
    
    // Remove hiding class
    whatsappBtn.classList.remove('hiding');
    telegramBtn.classList.remove('hiding');
    
    // Add show-fab class to trigger animation
    homeSection.classList.add('show-fab');
    
    // Clear existing timers
    if (fabShowTimer) clearTimeout(fabShowTimer);
    if (fabAutoHideTimer) clearTimeout(fabAutoHideTimer);
    
    // Auto-hide after 4 seconds of no interaction
    fabAutoHideTimer = setTimeout(() => {
        hideFABButtons();
    }, FAB_AUTO_HIDE_DELAY);
    
    // Cancel auto-hide on button hover
    whatsappBtn.addEventListener('mouseenter', () => {
        if (fabAutoHideTimer) clearTimeout(fabAutoHideTimer);
    });
    
    whatsappBtn.addEventListener('mouseleave', () => {
        fabAutoHideTimer = setTimeout(() => {
            hideFABButtons();
        }, FAB_AUTO_HIDE_DELAY);
    });
    
    telegramBtn.addEventListener('mouseenter', () => {
        if (fabAutoHideTimer) clearTimeout(fabAutoHideTimer);
    });
    
    telegramBtn.addEventListener('mouseleave', () => {
        fabAutoHideTimer = setTimeout(() => {
            hideFABButtons();
        }, FAB_AUTO_HIDE_DELAY);
    });
}

function hideFABButtons() {
    const homeSection = document.getElementById('home-view');
    const whatsappBtn = document.querySelector('.fab-whatsapp');
    const telegramBtn = document.querySelector('.fab-telegram');
    
    if (!homeSection || !whatsappBtn || !telegramBtn) return;
    
    // Add hiding class for animation
    whatsappBtn.classList.add('hiding');
    telegramBtn.classList.add('hiding');
    
    // Remove show-fab class
    homeSection.classList.remove('show-fab');
    
    // Clear timers
    if (fabAutoHideTimer) clearTimeout(fabAutoHideTimer);
}

function hideFABOnPageChange() {
    const homeSection = document.getElementById('home-view');
    if (homeSection) {
        homeSection.classList.remove('show-fab');
    }
    const whatsappBtn = document.querySelector('.fab-whatsapp');
    const telegramBtn = document.querySelector('.fab-telegram');
    if (whatsappBtn) whatsappBtn.classList.add('hiding');
    if (telegramBtn) telegramBtn.classList.add('hiding');
}

// Initialize on app load
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(setupFABInteraction, 500);
});

// Hook into existing navigation to hide FABs on page change
const originalNavigateTo = window.navigateTo;
window.navigateTo = function(page, data, isInitial) {
    hideFABOnPageChange();
    return originalNavigateTo.apply(this, arguments);
};

const originalNavigateBack = window.navigateBack;
window.navigateBack = function(fallback) {
    if (document.getElementById('home-view') && document.getElementById('home-view').classList.contains('active')) {
        // Re-enable FABs if returning to home
        setupFABInteraction();
    } else {
        hideFABOnPageChange();
    }
    return originalNavigateBack.apply(this, arguments);
};
```

---

## 📝 Implementation Checklist

- [ ] **Google Sign-In Button**
  - [ ] Add button HTML to login page
  - [ ] Add `signInWithGoogle()` function
  - [ ] Test Google login flow
  - [ ] Verify user created in Firebase
  - [ ] Test with existing email users

- [ ] **Profile Picture Upload**
  - [ ] Update edit-profile HTML
  - [ ] Add file upload handler
  - [ ] Add gallery selection UI
  - [ ] Test image upload
  - [ ] Verify picture displays in profile
  - [ ] Test gallery selection

- [ ] **FAB Animation**
  - [ ] Replace FAB CSS with new animation rules
  - [ ] Add FAB JavaScript functions
  - [ ] Test show animation on home click
  - [ ] Test auto-hide after 4 seconds
  - [ ] Test FAB links still work
  - [ ] Test hide on page change
  - [ ] Test mobile touch interaction

- [ ] **General Testing**
  - [ ] No existing features broken
  - [ ] All buttons responsive
  - [ ] Console has no errors
  - [ ] Mobile-friendly
  - [ ] Smooth animations

---

## 🚀 Deployment Steps

1. Download the updated zip
2. Extract to your Termux project folder
3. Run `npm install`
4. Deploy with `vercel --prod`
5. Test all new features

**Expected results:**
- ✅ Google login button visible
- ✅ Profile picture can be uploaded
- ✅ Gallery images can be selected for profile
- ✅ FABs hidden by default, show on home click
- ✅ FABs auto-hide after 4 seconds
- ✅ Smooth cubic-bezier animations
- ✅ All existing features work perfectly

---

**Version:** 2.1  
**Status:** Ready for implementation ✅
