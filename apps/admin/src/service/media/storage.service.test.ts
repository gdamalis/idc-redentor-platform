import { describe, expect, it, vi } from "vitest";
import {
  STORAGE_CLASS,
  delBlob,
  handleClientUpload,
  headBlob,
  listBlobs,
  putBlob,
  resolveStoreToken,
  type BlobSdkDeps,
} from "./storage.service";

function makeDeps(env: Record<string, string | undefined> = {}): BlobSdkDeps {
  return {
    put: vi.fn(),
    head: vi.fn(),
    del: vi.fn(),
    list: vi.fn(),
    handleUpload: vi.fn(),
    env: env as NodeJS.ProcessEnv,
  };
}

describe("storage.service (multi-store Vercel Blob wrapper)", () => {
  it("resolves distinct env vars per storage class and fails closed when unset", () => {
    expect(resolveStoreToken(STORAGE_CLASS.publicMedia, {})).toEqual({
      ok: false,
      reason: "storage-not-configured",
      envVar: "BLOB_READ_WRITE_TOKEN",
    });

    expect(
      resolveStoreToken(STORAGE_CLASS.privateFinance, {
        BLOB_READ_WRITE_TOKEN: "public-only-token",
      }),
    ).toEqual({
      ok: false,
      reason: "storage-not-configured",
      envVar: "FINANCE_BLOB_READ_WRITE_TOKEN",
    });

    const pub = resolveStoreToken(STORAGE_CLASS.publicMedia, {
      BLOB_READ_WRITE_TOKEN: "  pub-token  ",
    });
    expect(pub.ok).toBe(true);
    if (pub.ok) {
      expect(pub.token).toBe("pub-token");
      expect(pub.config.access).toBe("public");
    }

    const fin = resolveStoreToken(STORAGE_CLASS.privateFinance, {
      FINANCE_BLOB_READ_WRITE_TOKEN: "fin-token",
    });
    expect(fin.ok).toBe(true);
    if (fin.ok) {
      expect(fin.token).toBe("fin-token");
      expect(fin.config.access).toBe("private");
    }
  });

  it("passes explicit token, access class, and never-overwrite flags to putBlob", async () => {
    const deps = makeDeps({
      BLOB_READ_WRITE_TOKEN: "pub-rw",
      FINANCE_BLOB_READ_WRITE_TOKEN: "fin-rw",
    });
    vi.mocked(deps.put).mockResolvedValue({
      url: "https://store.public.blob.vercel-storage.com/media/1/a.pdf",
      downloadUrl: "https://store.public.blob.vercel-storage.com/media/1/a.pdf?download=1",
      pathname: "media/1/a.pdf",
      contentType: "application/pdf",
      contentDisposition: 'inline; filename="a.pdf"',
      etag: "etag-1",
    });

    const res = await putBlob(
      STORAGE_CLASS.publicMedia,
      "media/1/a.pdf",
      Buffer.from("pdf"),
      { contentType: "application/pdf", multipart: false },
      deps,
    );
    expect(res.ok).toBe(true);
    expect(deps.put).toHaveBeenCalledWith(
      "media/1/a.pdf",
      expect.any(Buffer),
      expect.objectContaining({
        access: "public",
        token: "pub-rw",
        contentType: "application/pdf",
        multipart: false,
        addRandomSuffix: false,
        allowOverwrite: false,
      }),
    );

    await putBlob(
      STORAGE_CLASS.privateFinance,
      "finance/inv.pdf",
      Buffer.from("inv"),
      { contentType: "application/pdf" },
      deps,
    );
    expect(deps.put).toHaveBeenLastCalledWith(
      "finance/inv.pdf",
      expect.any(Buffer),
      expect.objectContaining({
        access: "private",
        token: "fin-rw",
        addRandomSuffix: false,
        allowOverwrite: false,
      }),
    );
  });

  it("delegates headBlob, delBlob, listBlobs, and handleClientUpload with explicit token and no-op onUploadCompleted", async () => {
    const deps = makeDeps({ BLOB_READ_WRITE_TOKEN: "pub-rw" });
    vi.mocked(deps.head).mockResolvedValue({
      size: 1024,
      uploadedAt: new Date(),
      pathname: "media/1/a.jpg",
      contentType: "image/jpeg",
      contentDisposition: "inline",
      url: "https://store.public.blob.vercel-storage.com/media/1/a.jpg",
      downloadUrl: "https://store.public.blob.vercel-storage.com/media/1/a.jpg",
      cacheControl: "public, max-age=2592000",
      etag: "e1",
    });
    vi.mocked(deps.del).mockResolvedValue(undefined);
    vi.mocked(deps.list).mockResolvedValue({
      blobs: [],
      hasMore: false,
      cursor: undefined,
    });
    vi.mocked(deps.handleUpload).mockResolvedValue({
      type: "blob.generate-client-token",
      clientToken: "tok",
    });

    const headRes = await headBlob(
      STORAGE_CLASS.publicMedia,
      "https://store.public.blob.vercel-storage.com/media/1/a.jpg",
      deps,
    );
    expect(headRes.ok).toBe(true);
    expect(deps.head).toHaveBeenCalledWith(
      "https://store.public.blob.vercel-storage.com/media/1/a.jpg",
      { token: "pub-rw" },
    );

    const delRes = await delBlob(STORAGE_CLASS.publicMedia, "media/1/a.jpg", deps);
    expect(delRes).toEqual({ ok: true });
    expect(deps.del).toHaveBeenCalledWith("media/1/a.jpg", { token: "pub-rw" });

    const listRes = await listBlobs(
      STORAGE_CLASS.publicMedia,
      { prefix: "media/" },
      deps,
    );
    expect(listRes.ok).toBe(true);
    expect(deps.list).toHaveBeenCalledWith({
      token: "pub-rw",
      prefix: "media/",
    });

    const req = new Request("http://localhost:3001/api/media/upload", {
      method: "POST",
    });
    const uploadRes = await handleClientUpload(
      {
        storageClass: STORAGE_CLASS.publicMedia,
        body: {
          type: "blob.generate-client-token",
          payload: { pathname: "media/1/a.jpg", multipart: false, clientPayload: null },
        },
        request: req,
        onBeforeGenerateToken: async () => ({}),
      },
      deps,
    );
    expect(uploadRes.ok).toBe(true);
    expect(deps.handleUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        token: "pub-rw",
        onUploadCompleted: expect.any(Function),
      }),
    );
  });

  it("maps BlobNotFoundError from headBlob to not-found", async () => {
    const deps = makeDeps({ BLOB_READ_WRITE_TOKEN: "pub-rw" });
    const err = new Error("missing");
    err.name = "BlobNotFoundError";
    vi.mocked(deps.head).mockRejectedValue(err);

    const res = await headBlob(STORAGE_CLASS.publicMedia, "media/1/missing.jpg", deps);
    expect(res).toEqual({ ok: false, reason: "not-found" });
  });
});
