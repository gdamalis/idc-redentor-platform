import type { PermissionKey } from "@src/lib/rbac/permissions";
import type { ContentReferenceUsage } from "@src/lib/content/errors";

/**
 * Unified discriminated failure contract for `apps/admin/src/service/media/*`.
 * Business-rule refusals NEVER throw; callers branch on `result.ok` and `result.reason`.
 */
export type MediaFailure =
  | {
      readonly ok: false;
      readonly reason: "forbidden";
      readonly requiredPermission: PermissionKey;
    }
  | {
      readonly ok: false;
      readonly reason: "not-found";
    }
  | {
      readonly ok: false;
      readonly reason: "invalid";
      readonly fieldErrors: Record<string, string[]>;
    }
  | {
      readonly ok: false;
      readonly reason: "unsupported-type";
      readonly contentType: string;
    }
  | {
      readonly ok: false;
      readonly reason: "file-too-large";
      readonly maxBytes: number;
      readonly actualBytes: number;
    }
  | {
      readonly ok: false;
      readonly reason: "policy-violation";
      readonly detail: string;
    }
  | {
      readonly ok: false;
      readonly reason: "storage-not-configured";
    }
  | {
      readonly ok: false;
      readonly reason: "in-use";
      readonly usedBy: readonly ContentReferenceUsage[];
    };

export type MediaResult<TSuccess> =
  | ({ readonly ok: true } & TSuccess)
  | MediaFailure;
