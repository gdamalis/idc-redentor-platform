// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runPdfWorkerTickMock = vi.fn();

vi.mock("@src/service/content/sermons/pdf-worker.service", () => ({
  runPdfWorkerTick: (...args: unknown[]) => runPdfWorkerTickMock(...args),
}));

import { GET, dynamic, maxDuration, runtime } from "./route";

describe("GET /api/content/pdf-worker", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret-value";
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalSecret;
    }
  });

  it("exports Node runtime, force-dynamic, and maxDuration = 60", () => {
    expect(runtime).toBe("nodejs");
    expect(dynamic).toBe("force-dynamic");
    expect(maxDuration).toBe(60);
  });

  it("fails closed with 401 and no-store when CRON_SECRET is unset or wrong", async () => {
    delete process.env.CRON_SECRET;
    const resUnset = await GET(
      new Request("https://admin.example/api/content/pdf-worker", {
        headers: { authorization: "Bearer undefined" },
      }),
    );
    expect(resUnset.status).toBe(401);
    expect(resUnset.headers.get("cache-control")).toBe("no-store");

    process.env.CRON_SECRET = "real-secret";
    const resWrong = await GET(
      new Request("https://admin.example/api/content/pdf-worker", {
        headers: { authorization: "Bearer wrong-secret" },
      }),
    );
    expect(resWrong.status).toBe(401);
    expect(resWrong.headers.get("cache-control")).toBe("no-store");
    expect(runPdfWorkerTickMock).not.toHaveBeenCalled();
  });

  it("runs one worker tick and returns 200 JSON with no-store on valid Bearer secret", async () => {
    runPdfWorkerTickMock.mockResolvedValue({
      processed: 1,
      rendered: ["65f000000000000000000001"],
      skipped: [],
      failed: [],
      deferred: 0,
    });

    const res = await GET(
      new Request("https://admin.example/api/content/pdf-worker", {
        headers: { authorization: "Bearer test-cron-secret-value" },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      processed: 1,
      rendered: ["65f000000000000000000001"],
      skipped: [],
      failed: [],
      deferred: 0,
    });
    expect(runPdfWorkerTickMock).toHaveBeenCalledTimes(1);
  });
});
