// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { MONGODB_OPTIONS } from "../src/service/database.service";
import {
  POOL_OPTIONS,
  createPoolTracker,
  isNonProdWebsiteDb,
} from "./check-mongo-pool.mjs";

describe("isNonProdWebsiteDb", () => {
  it.each(["website-staging", "website-test", "website-qa", "website-e2e"])(
    "allows %s",
    (name) => {
      expect(isNonProdWebsiteDb(name)).toBe(true);
    },
  );

  it.each(["website", "test", "admin", "", "website-prod", "website-staging2"])(
    "refuses %j",
    (name) => {
      expect(isNonProdWebsiteDb(name)).toBe(false);
    },
  );
});

describe("createPoolTracker", () => {
  it("counts created connections and tracks peaks, counting down on close", () => {
    const tracker = createPoolTracker();
    [
      "connectionCreated",
      "connectionCreated",
      "connectionCheckedOut",
      "connectionCheckedOut",
      "connectionCheckedIn",
      "connectionClosed",
      "connectionCreated",
      "connectionCheckedOut",
    ].forEach((name) => tracker.record(name));

    expect(tracker.summary()).toEqual({
      created: 3,
      peakOpen: 2,
      peakCheckedOut: 2,
    });
  });

  it("ignores unknown events", () => {
    const tracker = createPoolTracker();
    tracker.record("somethingElse");
    expect(tracker.summary()).toEqual({
      created: 0,
      peakOpen: 0,
      peakCheckedOut: 0,
    });
  });
});

describe("POOL_OPTIONS", () => {
  it("stays in sync with the app's MONGODB_OPTIONS", () => {
    expect({
      maxPoolSize: MONGODB_OPTIONS.maxPoolSize,
      maxIdleTimeMS: MONGODB_OPTIONS.maxIdleTimeMS,
    }).toEqual(POOL_OPTIONS);
  });
});
