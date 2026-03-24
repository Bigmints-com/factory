---
name: Add Firebase Auth
description: Integrate Firebase Authentication with email/password and Google OAuth sign-in flows.
category: auth
tags:
  - firebase
  - auth
  - google
  - login
  - signup
  - authentication
trigger: firebase|auth|login|signup|google.*(sign|auth)
enabled: true
---

## Instructions

When adding Firebase Authentication:

1. Install `firebase` and create `lib/firebase.ts` with config
2. Create an `AuthProvider` context with `onAuthStateChanged` listener
3. Implement `signInWithEmailAndPassword`, `createUserWithEmailAndPassword`, `signInWithPopup` (Google)
4. Create `useAuth()` hook that exposes `user`, `loading`, `signIn`, `signUp`, `signOut`
5. Add route protection with an `AuthGuard` component
6. Store user profile in Firestore `users` collection on first sign-up
7. Handle auth errors with user-friendly toast messages
