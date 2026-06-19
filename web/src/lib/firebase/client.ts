"use client";

import type { FirebaseApp } from "firebase/app";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let appPromise: Promise<FirebaseApp> | null = null;

export function isFirebaseConfigured() {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId &&
      firebaseConfig.appId,
  );
}

export async function getFirebaseApp() {
  if (!isFirebaseConfigured()) {
    return null;
  }

  appPromise ??= import("firebase/app").then(({ getApps, initializeApp }) => {
    const existing = getApps()[0];
    return existing ?? initializeApp(firebaseConfig);
  });

  return appPromise;
}

export async function getFirebaseAuth() {
  const app = await getFirebaseApp();
  if (!app) return null;
  const { getAuth } = await import("firebase/auth");
  return getAuth(app);
}

export async function ensureFirebaseUser() {
  const auth = await getFirebaseAuth();
  if (!auth) return null;

  if (auth.currentUser) {
    return auth.currentUser;
  }

  const authMode = process.env.NEXT_PUBLIC_FIREBASE_AUTH_MODE ?? "anonymous";
  if (authMode !== "anonymous") {
    return null;
  }

  const { signInAnonymously } = await import("firebase/auth");
  const credential = await signInAnonymously(auth);
  return credential.user;
}

export async function getFirebaseDb() {
  const app = await getFirebaseApp();
  if (!app) return null;
  const { getFirestore } = await import("firebase/firestore");
  return getFirestore(app);
}
