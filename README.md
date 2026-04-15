# Lazem Finance Portal — Setup Guide

## Stack
- **React + Vite** — Frontend
- **Firebase** — Auth + Firestore database
- **Vercel** — Hosting + auto-deploy

---

## Step 1 — Create Firebase Project

1. Go to https://console.firebase.google.com
2. Click "Add project" → name it `lazem-finance` → Create
3. **Enable Authentication:**
   - Left menu → Build → Authentication → Get Started
   - Sign-in method → Enable **Email/Password**
4. **Enable Firestore:**
   - Left menu → Build → Firestore Database → Create database
   - Choose "Start in production mode" → Select region (e.g. `europe-west1`)
5. **Get your config:**
   - Project Settings (gear icon) → General → Your apps → Add web app
   - Copy the firebaseConfig values

---

## Step 2 — Configure Environment Variables

Copy `.env.example` to `.env.local` and fill in your Firebase values:

```
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=lazem-finance.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=lazem-finance
VITE_FIREBASE_STORAGE_BUCKET=lazem-finance.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
```

---

## Step 3 — Apply Firestore Security Rules

1. Firebase Console → Firestore → Rules tab
2. Replace content with contents of `firestore.rules`
3. Click Publish

---

## Step 4 — Create First Admin Account

1. Run locally: `npm install && npm run dev`
2. Open http://localhost:5173
3. Register with your admin email
4. In Firebase Console → Firestore → users collection → find your doc
5. Edit the `role` field → change to `"admin"`
6. Log back in — you now have full Admin access

---

## Step 5 — Deploy to Vercel

1. Push to GitHub:
```
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/lazem-finance.git
git push -u origin main
```
2. Go to https://vercel.com → New Project → Import from GitHub
3. Add all VITE_ environment variables
4. Click Deploy

---

## Step 6 — Add Authorized Domain in Firebase

Firebase Console → Authentication → Settings → Authorized domains
→ Add your Vercel URL: `lazem-finance.vercel.app`

---

## Project Structure

```
src/
├── firebase/
│   ├── config.js          # Firebase init
│   └── firestore.js       # Firestore helpers & listeners
├── context/
│   ├── AuthContext.jsx    # Firebase Auth + user profile
│   └── DataContext.jsx    # All Firestore data + mutations
├── utils/
│   └── constants.js       # ROLE_CONFIG, DEPARTMENTS, colors
├── AppCore.jsx            # Main app (all views & components)
├── App.jsx                # Root component
└── main.jsx               # Entry point with providers
firestore.rules            # Security rules
vercel.json                # Vercel config
.env.example               # Env vars template
```

## Firestore Collections

| Collection | Description |
|---|---|
| users | User profiles (name, email, role) |
| recurring | Recurring payments |
| onetime | One-time requests |
| entitlements | Entitlement requests |
| auditLog | Audit trail |
| notifications | In-app notifications |
| config/permissions | Role permissions |
| config/departments | Department assignments |
