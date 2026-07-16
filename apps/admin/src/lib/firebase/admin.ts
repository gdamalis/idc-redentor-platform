import "server-only";

import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import type { App } from "firebase-admin/app";
import { z } from "zod";

/**
 * Zod schema over the three Admin SDK service-account vars. Parsed lazily
 * (see `getFirebaseAdminApp` below) — NEVER at module import — so importing
 * this file with no env set (e.g. during `pnpm build` before ICR-141 wires
 * real Firebase project values) cannot throw.
 */
const firebaseAdminConfigSchema = z.object({
  projectId: z.string().min(1, "FIREBASE_PROJECT_ID is not defined"),
  clientEmail: z.string().min(1, "FIREBASE_CLIENT_EMAIL is not defined"),
  privateKey: z.string().min(1, "FIREBASE_PRIVATE_KEY is not defined"),
});

function parseFirebaseAdminConfig() {
  return firebaseAdminConfigSchema.parse({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY,
  });
}

/**
 * Lazy getter for the server Admin SDK app. `getApps()` doubles as the
 * memoization: once `initializeApp` has registered the default app, every
 * later call short-circuits to `getApp()` and never re-parses env. Nothing
 * runs at import time — only when a caller actually invokes this function.
 *
 * `FIREBASE_PRIVATE_KEY` is stored escaped in every env store (Vercel, .env
 * files) — the literal `\n` sequences must become real newlines before the
 * SDK can parse the PEM block, hence the `.replace(...)` below.
 */
export function getFirebaseAdminApp(): App {
  if (getApps().length) return getApp();

  const { projectId, clientEmail, privateKey } = parseFirebaseAdminConfig();

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, "\n"),
    }),
  });
}
