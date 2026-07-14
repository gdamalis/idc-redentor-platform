import { connect } from "./database.service";

interface LikesDocument {
  slug: string;
  count: number;
  visitors: string[];
  updatedAt: Date;
}

export interface Likes {
  readonly count: number;
  readonly hasLiked: boolean;
}

interface LikesOk extends Likes {
  readonly ok: true;
}

interface LikesUnavailable {
  readonly ok: false;
  readonly reason: "db-unavailable";
}

export type LikesOutcome = LikesOk | LikesUnavailable;

const DB_UNAVAILABLE: LikesUnavailable = {
  ok: false,
  reason: "db-unavailable",
};

export async function getLikes(
  slug: string,
  visitorId?: string,
): Promise<LikesOutcome> {
  const client = await connect();
  if (!client) {
    return DB_UNAVAILABLE;
  }

  try {
    const db = client.db("website");
    const collection = db.collection<LikesDocument>("likes");

    const doc = await collection.findOne({ slug });

    return {
      ok: true,
      count: doc?.count ?? 0,
      hasLiked: visitorId
        ? (doc?.visitors?.includes(visitorId) ?? false)
        : false,
    };
  } catch (error) {
    console.error("Error fetching likes:", error);
    return DB_UNAVAILABLE;
  }
}

export async function toggleLike(
  slug: string,
  visitorId: string,
): Promise<LikesOutcome> {
  const client = await connect();
  if (!client) {
    return DB_UNAVAILABLE;
  }

  try {
    const db = client.db("website");
    const collection = db.collection<LikesDocument>("likes");

    const existing = await collection.findOne({ slug });
    const alreadyLiked = existing?.visitors?.includes(visitorId) ?? false;

    if (alreadyLiked) {
      // Remove like
      await collection.updateOne(
        { slug },
        {
          $pull: { visitors: visitorId },
          $inc: { count: -1 },
          $set: { updatedAt: new Date() },
        },
      );
    } else {
      // Add like (upsert for first-time likes on this post)
      await collection.updateOne(
        { slug },
        {
          $addToSet: { visitors: visitorId },
          $inc: { count: 1 },
          $set: { updatedAt: new Date() },
          $setOnInsert: { slug },
        },
        { upsert: true },
      );
    }

    return {
      ok: true,
      count: Math.max((existing?.count ?? 0) + (alreadyLiked ? -1 : 1), 0),
      hasLiked: !alreadyLiked,
    };
  } catch (error) {
    console.error("Error toggling like:", error);
    return DB_UNAVAILABLE;
  }
}
