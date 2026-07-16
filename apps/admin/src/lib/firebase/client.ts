import { getApp, getApps, initializeApp } from "firebase/app";
import type { FirebaseApp, FirebaseOptions } from "firebase/app";
import { getAuth } from "firebase/auth";
import type { Auth } from "firebase/auth";
import { z } from "zod";

/**
 * Zod schema over the six browser-safe `NEXT_PUBLIC_FIREBASE_*` vars. Parsed
 * lazily (see `getFirebaseClientApp` below) — NEVER at module import — so
 * importing this file with no env set (e.g. during `pnpm build` before
 * ICR-141 wires real Firebase project values) cannot throw.
 */
const firebaseClientConfigSchema = z.object({
  apiKey: z.string().min(1, "NEXT_PUBLIC_FIREBASE_API_KEY is not defined"),
  authDomain: z.string().min(1, "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN is not defined"),
  projectId: z.string().min(1, "NEXT_PUBLIC_FIREBASE_PROJECT_ID is not defined"),
  storageBucket: z.string().min(1, "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is not defined"),
  messagingSenderId: z.string().min(1, "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID is not defined"),
  appId: z.string().min(1, "NEXT_PUBLIC_FIREBASE_APP_ID is not defined"),
});

function parseFirebaseClientConfig(): FirebaseOptions {
  return firebaseClientConfigSchema.parse({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  }) satisfies FirebaseOptions;
}

/**
 * Lazy getter for the browser Firebase app. `getApps()` doubles as the
 * memoization: once `initializeApp` has registered the default app, every
 * later call short-circuits to `getApp()` and never re-parses env. Nothing
 * runs at import time — only when a caller actually invokes this function.
 */
export function getFirebaseClientApp(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(parseFirebaseClientConfig());
}

/**
 * Lazy Auth getter. No auth logic lives here (that's CP2/ICR-125+) — this is
 * just the SDK handle, built lazily off `getFirebaseClientApp()`.
 */
export function getFirebaseAuth(): Auth {
  return getAuth(getFirebaseClientApp());
}
