import type { Collection } from "mongodb";

import { connect } from "../database.service";

export type ClaimResult = "claimed" | "already-sent" | "error";

type BroadcastLogStatus = "sending" | "sent" | "failed";

interface BroadcastLogDocument {
  broadcastId: string;
  status: BroadcastLogStatus;
  campaignId?: string;
  reason?: string;
  createdAt: Date;
  updatedAt: Date;
  sentAt?: Date;
}

const DB_NAME = "website";
const COLLECTION = "broadcast_log";

let indexEnsured: Promise<unknown> | null = null;

function ensureBroadcastIndex(col: Collection<BroadcastLogDocument>): Promise<unknown> {
  if (!indexEnsured) {
    indexEnsured = col
      .createIndex({ broadcastId: 1 }, { unique: true })
      .catch((error: unknown) => {
        indexEnsured = null; // allow a retry on the next claim
        throw error;
      });
  }
  return indexEnsured;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: number }).code === 11000
  );
}

function logError(op: string, broadcastId: string, error: unknown): void {
  console.error(
    `[broadcast] ${op} failed for ${broadcastId}:`,
    error instanceof Error ? error.message : String(error),
  );
}

/**
 * Insert-first claim. A *sent* doc fails the `status != sent` filter, so the
 * upsert attempts an insert and the unique index throws E11000 → "already-sent".
 * A "failed"/"sending" doc matches → re-claimed (retryable). No doc → upsert claims it.
 */
export async function claimBroadcast(broadcastId: string): Promise<ClaimResult> {
  const client = await connect();
  if (!client) return "error";
  try {
    const col = client.db(DB_NAME).collection<BroadcastLogDocument>(COLLECTION);
    await ensureBroadcastIndex(col);
    const now = new Date();
    await col.updateOne(
      { broadcastId, status: { $ne: "sent" } },
      {
        $set: { status: "sending", updatedAt: now },
        $setOnInsert: { broadcastId, createdAt: now },
      },
      { upsert: true },
    );
    return "claimed";
  } catch (error) {
    if (isDuplicateKeyError(error)) return "already-sent";
    logError("claim", broadcastId, error);
    return "error";
  }
}

export async function markSent(broadcastId: string, campaignId: string): Promise<void> {
  const client = await connect();
  if (!client) return;
  try {
    const col = client.db(DB_NAME).collection<BroadcastLogDocument>(COLLECTION);
    const now = new Date();
    await col.updateOne(
      { broadcastId },
      { $set: { status: "sent", campaignId, sentAt: now, updatedAt: now } },
    );
  } catch (error) {
    logError("markSent", broadcastId, error);
  }
}

export async function markFailed(broadcastId: string, reason: string): Promise<void> {
  const client = await connect();
  if (!client) return;
  try {
    const col = client.db(DB_NAME).collection<BroadcastLogDocument>(COLLECTION);
    await col.updateOne(
      { broadcastId },
      { $set: { status: "failed", reason, updatedAt: new Date() } },
    );
  } catch (error) {
    logError("markFailed", broadcastId, error);
  }
}
