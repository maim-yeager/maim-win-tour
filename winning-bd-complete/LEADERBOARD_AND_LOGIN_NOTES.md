# What changed in this update (Sept 9, 2026)

## 1. Leaderboard feature (new)

**Backend**
- `api/_routes/leaderboard.routes.js` (new file) — two endpoints:
  - `GET /leaderboard` — used by the User App. Requires a logged-in user
    (Firebase ID token). Returns:
    - `top`: ranked list of players (default 50, `?limit=`)
    - `me`: the calling user's own rank/earnings/wins (even if outside the top list)
    - `matches`: when `?q=<name>` is passed, players whose name matches — this is
      how a user searches their own name / a friend's name and sees their rank.
  - `GET /admin/leaderboard` — used by the Admin Panel (`users.view` permission
    required). Same ranking, with `?q=` search and `?limit=`.
- `api/_routes/matches.routes.js` — when an admin finalizes a match and pays
  out prizes, each winner's `users/{uid}` record now also gets:
  - `lb_earnings` — lifetime total prize money won (used as "income")
  - `lb_wins` — lifetime count of paid placements (used as "score")
  Both are atomic increments (`ServerValue.increment`), so this is safe even
  under concurrent finalizations. No backfill migration needed — new fields
  just start accumulating from the next finalized match onward. Players who
  already won matches before this update won't have historical earnings
  counted unless you backfill `lb_earnings`/`lb_wins` from `wallet_ledger`
  entries with `type: "Match Prize"` (ask if you want a one-off script for that).
- `api/_routes/index.js` — registers the new route file.

**User App (`index.html`)**
- New "Leaderboard" item in the Profile menu.
- New Leaderboard page: shows your own rank card at the top, a search box
  (search your own name or a friend's), and the ranked list with medal icons
  for top 3.

**Admin Panel (`admin/index.html`)**
- New "Leaderboard" item under the Players nav group.
- New page: searchable table of all ranked players (rank, name, user ID,
  wins, total earnings).

No new Firebase security rules were needed — both endpoints go through the
existing authenticated API layer, not direct client reads.

---

## 2. Admin login — what we found, and what to check on your end

Your own `CHANGES_SUMMARY.md` shows the Admin-ID case-sensitivity bug (the
one where `OWNER1` never matched because the credential was lowercased
before lookup) was **already fixed** in the copy you uploaded. That fix is
still correctly in place in `api/_routes/auth.routes.js` — we didn't find a
remaining code bug there.

Since we can't run your live deployment or see your Firebase project from
here, the most likely causes of "login click → error" are **setup/config**,
not code. Please check these in order:

1. **Has the OWNER account actually been created?**
   Login will fail for *any* credentials until you've run this once:
   ```bash
   FIREBASE_SERVICE_ACCOUNT_B64="<your base64 service account>" \
   FIREBASE_DB_URL="https://<your-project>-default-rtdb.<region>.firebasedatabase.app" \
   OWNER_ID="OWNER1" \
   OWNER_NAME="Your Name" \
   OWNER_EMAIL="you@example.com" \
   OWNER_PASSWORD="a-strong-password-12+chars" \
   npm run bootstrap:owner
   ```
   If it prints `Owner already exists`, you're fine — an OWNER1 record exists.

2. **Are `FIREBASE_DB_URL` and `FIREBASE_SERVICE_ACCOUNT_B64` set on Vercel**
   (not just locally)? Check with:
   ```bash
   vercel env ls
   ```
   If missing, every API call — including login — fails with a generic
   "Something went wrong" error, because `api/_lib/firebase.js` can't connect.

3. **Domain whitelist.** `domain-check.js` only allows
   `winning-tour-web.vercel.app`, `localhost`, and `127.0.0.1`. If your admin
   panel is on a *different* Vercel URL or a custom domain, the whole page
   gets replaced by a "এই এপসটা কি তোর নানার নাকি?" block screen — in that
   case you wouldn't even see the login form. If you *do* see the login form
   but get an error only after clicking, this isn't your issue.

4. **Open the browser console (F12) on the exact moment you click Login**
   and note the exact error text/status code. The admin panel already logs
   errors there (`[Admin Panel Error]`), and the login form shows the
   server's error message under the password field. That message (e.g.
   `INVALID_CREDENTIALS`, `SESSION_INVALID`, or a network error) tells us
   exactly which of the above it is. If you send that text, a next round can
   pinpoint it immediately instead of guessing.
