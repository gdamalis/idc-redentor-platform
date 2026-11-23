// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../..");
const CLIENT_PATH = path.join(
  REPO_ROOT,
  ".claude/scripts/predica/predica-ingest-client.mjs",
);
const SAMPLE_FIXTURE_PATH = path.join(
  REPO_ROOT,
  ".claude/scripts/predica/__fixtures__/sample-sermon.json",
);

interface ClientModule {
  validateAdminUrl: (
    rawUrl: string,
    isTest: boolean,
  ) => { ok: true; origin: string } | { ok: false; error: string };
  resolveTarget: (options?: {
    test?: boolean;
    adminUrl?: string;
  }) =>
    | {
        ok: true;
        targetKey: "prod" | "staging";
        isTest: boolean;
        adminBaseUrl: string;
        tokenEnvVar: string;
        headerTarget: "production" | "staging";
      }
    | { ok: false; error: string };
  resolveIngestToken: (
    target: {
      isTest: boolean;
      adminBaseUrl: string;
      tokenEnvVar: string;
    },
    options?: {
      tokenFile?: string;
      env?: Record<string, string | undefined>;
      repoRoot?: string;
      envFiles?: string[];
    },
  ) => { ok: true; token: string; source: string } | { ok: false; error: string };
  runUploadMedia: (
    ctx: {
      target: { adminBaseUrl: string; headerTarget: string };
      token: string;
      fetchFn?: typeof fetch;
      blobUploadFn?: (...args: unknown[]) => Promise<unknown>;
    },
    opts: Record<string, unknown>,
  ) => Promise<{ exitCode: number; output: Record<string, unknown> }>;
  runIngest: (
    ctx: {
      target: { adminBaseUrl: string; headerTarget: string };
      token: string;
      fetchFn?: typeof fetch;
    },
    opts: Record<string, unknown>,
  ) => Promise<{ exitCode: number; output: Record<string, unknown> }>;
}

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "predica-cli-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

const nodeRequire = createRequire(import.meta.url);

async function loadClient(): Promise<ClientModule> {
  return nodeRequire(CLIENT_PATH) as ClientModule;
}

describe("predica-ingest-client.mjs", () => {
  it("resolves production by default and staging with --test, enforcing R2 URL & prod-host guards", async () => {
    const client = await loadClient();

    expect(client.resolveTarget({})).toMatchObject({
      ok: true,
      targetKey: "prod",
      adminBaseUrl: "https://ministerio.idcredentor.org",
      tokenEnvVar: "PREDICA_INGEST_TOKEN_PROD",
      headerTarget: "production",
    });

    expect(client.resolveTarget({ test: true })).toMatchObject({
      ok: true,
      targetKey: "staging",
      adminBaseUrl: "https://staging.ministerio.idcredentor.org",
      tokenEnvVar: "PREDICA_INGEST_TOKEN_STAGING",
      headerTarget: "staging",
    });

    // R2: refuse production admin hosts under --test (case-insensitive, trailing dot stripped)
    expect(
      client.validateAdminUrl("https://MINISTERIO.IDCREDENTOR.ORG.", true).ok,
    ).toBe(false);
    expect(
      client.validateAdminUrl("https://idc-redentor-admin.vercel.app/", true).ok,
    ).toBe(false);

    // R2: refuse plaintext http for non-localhost, allow localhost/127.0.0.1 for local tests
    expect(
      client.validateAdminUrl("http://staging.ministerio.idcredentor.org", true).ok,
    ).toBe(false);
    expect(client.validateAdminUrl("http://localhost:3001", true)).toEqual({
      ok: true,
      origin: "http://localhost:3001",
    });
    expect(client.validateAdminUrl("http://127.0.0.1:3001", true)).toEqual({
      ok: true,
      origin: "http://127.0.0.1:3001",
    });
  });

  it("stops cleanly with clear message and zero requests when PREDICA_INGEST_TOKEN_PROD is absent (AC6)", async () => {
    const client = await loadClient();
    const dir = makeTempDir();
    // Even if a shared .env.local has bare PREDICA_INGEST_TOKEN or staging token, prod refuses it!
    writeFileSync(
      path.join(dir, ".env.local"),
      'PREDICA_INGEST_TOKEN="wrong-bare"\nPREDICA_INGEST_TOKEN_STAGING="staging-only"\n',
    );

    const target = client.resolveTarget({});
    expect(target.ok).toBe(true);
    if (!target.ok) return;

    const tokenRes = client.resolveIngestToken(target, {
      env: {},
      repoRoot: dir,
      envFiles: [".env.local"],
    });
    expect(tokenRes.ok).toBe(false);
    if (!tokenRes.ok) {
      expect(tokenRes.error).toContain("PREDICA_INGEST_TOKEN_PROD");
      expect(tokenRes.error).toContain("https://ministerio.idcredentor.org");
    }

    // Explicit --token-file reads bare PREDICA_INGEST_TOKEN cleanly (matches ops 0600 env files)
    const tokenFile = path.join(dir, "staging.env");
    writeFileSync(tokenFile, 'PREDICA_INGEST_TOKEN="from-file-secret"\n');
    const stagingTarget = client.resolveTarget({ test: true });
    expect(stagingTarget.ok).toBe(true);
    if (!stagingTarget.ok) return;

    expect(
      client.resolveIngestToken(stagingTarget, { tokenFile, env: {} }),
    ).toEqual({
      ok: true,
      token: "from-file-secret",
      source: tokenFile,
    });
  });

  it("reuses duplicate SHA-256 media without uploading and passes multipart=true for audio uploads", async () => {
    const client = await loadClient();
    const dir = makeTempDir();
    const audioPath = path.join(dir, "audio.mp3");
    writeFileSync(audioPath, Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00]));

    const blobUploadFn = vi.fn().mockResolvedValue({
      pathname: "media/65f1a2b3c4d5e6f7a8b9c001/audio.mp3",
      url: "https://store.public.blob.vercel-storage.com/media/65f1a2b3c4d5e6f7a8b9c001/audio.mp3",
    });

    // Case 1: duplicate -> zero blob upload
    const dupFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          status: "duplicate",
          media: {
            _id: "65f1a2b3c4d5e6f7a8b9c099",
            pathname: "media/65f1a2b3c4d5e6f7a8b9c099/audio.mp3",
            url: "https://store.public.blob.vercel-storage.com/media/65f1a2b3c4d5e6f7a8b9c099/audio.mp3",
            contentType: "audio/mpeg",
            size: 7,
          },
        }),
        { status: 200 },
      ),
    );

    const dupRes = await client.runUploadMedia(
      {
        target: {
          adminBaseUrl: "https://staging.ministerio.idcredentor.org",
          headerTarget: "staging",
        },
        token: "secret-tok",
        fetchFn: dupFetch,
        blobUploadFn,
      },
      { file: audioPath, contentType: "audio/mpeg", titleEs: "Audio" },
    );
    expect(dupRes.exitCode).toBe(0);
    expect(dupRes.output.reused).toBe(true);
    expect(blobUploadFn).not.toHaveBeenCalled();

    // Case 2: fresh upload -> prepare -> direct-to-Blob upload(multipart:true) -> confirm
    const freshFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            status: "ready",
            mediaId: "65f1a2b3c4d5e6f7a8b9c001",
            pathname: "media/65f1a2b3c4d5e6f7a8b9c001/audio.mp3",
            normalizedContentType: "audio/mpeg",
            maxBytes: 200 * 1024 * 1024,
            multipart: true,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            media: {
              _id: "65f1a2b3c4d5e6f7a8b9c001",
              pathname: "media/65f1a2b3c4d5e6f7a8b9c001/audio.mp3",
              url: "https://store.public.blob.vercel-storage.com/media/65f1a2b3c4d5e6f7a8b9c001/audio.mp3",
              contentType: "audio/mpeg",
              size: 7,
            },
          }),
          { status: 201 },
        ),
      );

    const freshRes = await client.runUploadMedia(
      {
        target: {
          adminBaseUrl: "https://staging.ministerio.idcredentor.org",
          headerTarget: "staging",
        },
        token: "secret-tok",
        fetchFn: freshFetch,
        blobUploadFn,
      },
      {
        file: audioPath,
        contentType: "audio/mpeg",
        titleEs: "Audio",
        durationSeconds: 1800,
      },
    );
    expect(freshRes.exitCode).toBe(0);
    expect(freshRes.output.reused).toBe(false);
    expect(blobUploadFn).toHaveBeenCalledWith(
      "media/65f1a2b3c4d5e6f7a8b9c001/audio.mp3",
      expect.anything(),
      expect.objectContaining({
        access: "public",
        handleUploadUrl:
          "https://staging.ministerio.idcredentor.org/api/predica/media/upload",
        multipart: true,
        headers: {
          Authorization: "Bearer secret-tok",
          "X-Predica-Target": "staging",
        },
      }),
    );
  });

  it("returns exit code 4 on 409 conflict during ingest (Edge Case #1)", async () => {
    const client = await loadClient();
    const conflictFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          reason: "conflict",
          humanEdited: true,
          updatedBy: "human-1",
          updatedByLabel: "Pastor Gabriel",
          updatedAt: "2026-11-23T04:00:00.000Z",
          currentRevision: 4,
        }),
        { status: 409 },
      ),
    );

    const res = await client.runIngest(
      {
        target: {
          adminBaseUrl: "https://staging.ministerio.idcredentor.org",
          headerTarget: "staging",
        },
        token: "secret-tok",
        fetchFn: conflictFetch,
      },
      {
        sermonPath: SAMPLE_FIXTURE_PATH,
        mode: "update",
        docId: "65f1a2b3c4d5e6f7a8b9c001",
        expectedRevision: 3,
      },
    );

    expect(res.exitCode).toBe(4);
    expect(res.output.reason).toBe("conflict");
  });
});
