import {
  del,
  head,
  list,
  put,
  type HeadBlobResult,
  type ListBlobResult,
  type PutBlobResult,
} from "@vercel/blob";
import {
  handleUpload,
  type HandleUploadBody,
  type HandleUploadOptions,
} from "@vercel/blob/client";

export const STORAGE_CLASS = {
  publicMedia: "public-media",
  privateFinance: "private-finance",
} as const;

export type StorageClass = (typeof STORAGE_CLASS)[keyof typeof STORAGE_CLASS];

export type StorageTokenEnvVar =
  | "BLOB_READ_WRITE_TOKEN"
  | "FINANCE_BLOB_READ_WRITE_TOKEN";

export interface StorageStoreConfig {
  readonly storageClass: StorageClass;
  readonly access: "public" | "private";
  readonly tokenEnvVar: StorageTokenEnvVar;
}

/**
 * Access is configured per Vercel Blob store (not per upload). Each access class
 * resolves its own explicit read-write token env var so future private finance
 * attachments (`ICR-177`) coexist cleanly alongside the public media store (`ICR-196`).
 */
export const STORAGE_CONFIG: Readonly<Record<StorageClass, StorageStoreConfig>> =
  {
    [STORAGE_CLASS.publicMedia]: {
      storageClass: STORAGE_CLASS.publicMedia,
      access: "public",
      tokenEnvVar: "BLOB_READ_WRITE_TOKEN",
    },
    [STORAGE_CLASS.privateFinance]: {
      storageClass: STORAGE_CLASS.privateFinance,
      access: "private",
      tokenEnvVar: "FINANCE_BLOB_READ_WRITE_TOKEN",
    },
  };

export type StorageEnv = Partial<Record<StorageTokenEnvVar, string | undefined>>;

export interface BlobSdkDeps {
  readonly put: typeof put;
  readonly head: typeof head;
  readonly del: typeof del;
  readonly list: typeof list;
  readonly handleUpload: typeof handleUpload;
  readonly env: StorageEnv;
}

export const defaultBlobSdkDeps: BlobSdkDeps = {
  put,
  head,
  del,
  list,
  handleUpload,
  env: process.env,
};

export type ResolveStoreTokenResult =
  | {
      readonly ok: true;
      readonly token: string;
      readonly config: StorageStoreConfig;
    }
  | {
      readonly ok: false;
      readonly reason: "storage-not-configured";
      readonly envVar: StorageTokenEnvVar;
    };

/** Lazily resolves the store token for `storageClass`, failing closed when unset/blank. */
export function resolveStoreToken(
  storageClass: StorageClass,
  env: StorageEnv = process.env,
): ResolveStoreTokenResult {
  const config = STORAGE_CONFIG[storageClass];
  const token = env[config.tokenEnvVar]?.trim();
  if (!token) {
    return {
      ok: false,
      reason: "storage-not-configured",
      envVar: config.tokenEnvVar,
    };
  }
  return { ok: true, token, config };
}

export type StorageOpResult<T> =
  | ({ readonly ok: true } & T)
  | { readonly ok: false; readonly reason: "storage-not-configured" }
  | { readonly ok: false; readonly reason: "not-found" }
  | { readonly ok: false; readonly reason: "error"; readonly message: string };

export async function handleClientUpload(
  input: {
    readonly storageClass: StorageClass;
    readonly body: HandleUploadBody;
    readonly request: Request;
    readonly onBeforeGenerateToken: HandleUploadOptions["onBeforeGenerateToken"];
  },
  deps: BlobSdkDeps = defaultBlobSdkDeps,
): Promise<
  | {
      readonly ok: true;
      readonly response: Awaited<ReturnType<typeof handleUpload>>;
    }
  | { readonly ok: false; readonly reason: "storage-not-configured" }
> {
  const resolved = resolveStoreToken(input.storageClass, deps.env);
  if (!resolved.ok) {
    return { ok: false, reason: "storage-not-configured" };
  }

  // `onUploadCompleted` is intentionally a no-op: Vercel Blob callbacks cannot
  // reach localhost and fail behind Vercel Deployment Protection on previews.
  // The browser invokes a permission-gated Server Action (`confirmMediaUpload`)
  // that confirms the blob via `head()` before writing to MongoDB.
  const response = await deps.handleUpload({
    token: resolved.token,
    body: input.body,
    request: input.request,
    onBeforeGenerateToken: input.onBeforeGenerateToken,
    onUploadCompleted: async () => {
      // Deliberate no-op — see comment above.
    },
  });

  return { ok: true, response };
}

export async function putBlob(
  storageClass: StorageClass,
  pathname: string,
  body: Buffer | Uint8Array | Blob | string,
  options: {
    readonly contentType: string;
    readonly multipart?: boolean;
  },
  deps: BlobSdkDeps = defaultBlobSdkDeps,
): Promise<StorageOpResult<{ readonly blob: PutBlobResult }>> {
  const resolved = resolveStoreToken(storageClass, deps.env);
  if (!resolved.ok) {
    return { ok: false, reason: "storage-not-configured" };
  }

  try {
    const putBody =
      body instanceof Uint8Array && !Buffer.isBuffer(body)
        ? Buffer.from(body)
        : body;
    const blob = await deps.put(pathname, putBody, {
      access: resolved.config.access,
      token: resolved.token,
      contentType: options.contentType,
      multipart: options.multipart ?? false,
      addRandomSuffix: false,
      allowOverwrite: false,
    });
    return { ok: true, blob };
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      message: err instanceof Error ? err.message : "Blob upload failed",
    };
  }
}

export async function headBlob(
  storageClass: StorageClass,
  urlOrPathname: string,
  deps: BlobSdkDeps = defaultBlobSdkDeps,
): Promise<StorageOpResult<{ readonly blob: HeadBlobResult }>> {
  const resolved = resolveStoreToken(storageClass, deps.env);
  if (!resolved.ok) {
    return { ok: false, reason: "storage-not-configured" };
  }

  try {
    const blob = await deps.head(urlOrPathname, { token: resolved.token });
    return { ok: true, blob };
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "BlobNotFoundError") {
      return { ok: false, reason: "not-found" };
    }
    return {
      ok: false,
      reason: "error",
      message: err instanceof Error ? err.message : "Blob head failed",
    };
  }
}

export async function delBlob(
  storageClass: StorageClass,
  urlOrPathname: string | string[],
  deps: BlobSdkDeps = defaultBlobSdkDeps,
): Promise<
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "storage-not-configured" }
  | { readonly ok: false; readonly reason: "error"; readonly message: string }
> {
  const resolved = resolveStoreToken(storageClass, deps.env);
  if (!resolved.ok) {
    return { ok: false, reason: "storage-not-configured" };
  }

  try {
    await deps.del(urlOrPathname, { token: resolved.token });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      message: err instanceof Error ? err.message : "Blob delete failed",
    };
  }
}

export async function listBlobs(
  storageClass: StorageClass,
  options: {
    readonly prefix?: string;
    readonly cursor?: string;
    readonly limit?: number;
  } = {},
  deps: BlobSdkDeps = defaultBlobSdkDeps,
): Promise<StorageOpResult<{ readonly result: ListBlobResult }>> {
  const resolved = resolveStoreToken(storageClass, deps.env);
  if (!resolved.ok) {
    return { ok: false, reason: "storage-not-configured" };
  }

  try {
    const result = await deps.list({
      token: resolved.token,
      ...(options.prefix !== undefined && { prefix: options.prefix }),
      ...(options.cursor !== undefined && { cursor: options.cursor }),
      ...(options.limit !== undefined && { limit: options.limit }),
    });
    return { ok: true, result };
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      message: err instanceof Error ? err.message : "Blob list failed",
    };
  }
}
