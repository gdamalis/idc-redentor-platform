import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PermissionKey } from "@src/lib/rbac/permissions";

const mockRequireActionPermission = vi.fn();
const mockRevalidatePath = vi.fn();
const mockCreateGuardedPost = vi.fn();
const mockSaveGuardedPostDraft = vi.fn();
const mockValidatePostBeforePublish = vi.fn();
const mockPreparePublishAction = vi.fn();
const mockConfirmPublishAction = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

vi.mock("@src/lib/rbac/require-action-permission", () => ({
  requireActionPermission: (...args: unknown[]) =>
    mockRequireActionPermission(...args),
}));

vi.mock("@src/service/content/editorial/editorial-guards.service", () => ({
  createGuardedPost: (...args: unknown[]) => mockCreateGuardedPost(...args),
  saveGuardedPostDraft: (...args: unknown[]) =>
    mockSaveGuardedPostDraft(...args),
  validatePostBeforePublish: (...args: unknown[]) =>
    mockValidatePostBeforePublish(...args),
}));

vi.mock("@src/app/[locale]/(app)/content/actions", () => ({
  preparePublishAction: (...args: unknown[]) =>
    mockPreparePublishAction(...args),
  confirmPublishAction: (...args: unknown[]) =>
    mockConfirmPublishAction(...args),
}));

import {
  confirmPostPublishAction,
  createPostAction,
  preparePostPublishAction,
  savePostDraftAction,
} from "./actions";

function allow(perms: readonly PermissionKey[]) {
  mockRequireActionPermission.mockResolvedValue({
    ok: true,
    user: {
      _id: new ObjectId("64b000000000000000000001"),
      email: "editor@example.org",
      displayName: "Editor Demo",
    },
    permissions: new Set(perms),
  });
}

describe("posts/actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses createPostAction when caller lacks content:write", async () => {
    mockRequireActionPermission.mockResolvedValue({
      ok: false,
      reason: "forbidden",
    });
    const res = await createPostAction({
      collection: "posts",
      draft: { title: { "es-AR": "Hola" } },
    });
    expect(res).toEqual({
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:write",
    });
    expect(mockCreateGuardedPost).not.toHaveBeenCalled();
  });

  it("blocks invalid category in savePostDraftAction", async () => {
    allow(["content:read", "content:write"]);
    mockSaveGuardedPostDraft.mockResolvedValue({
      ok: false,
      reason: "invalid",
      fieldErrors: { category: ["invalid-category"] },
    });
    const res = await savePostDraftAction({
      collection: "posts",
      docId: "64b000000000000000000010",
      patch: { category: "Invalid" },
      expectedRevision: 1,
    });
    expect(res).toEqual({
      ok: false,
      reason: "invalid",
      fieldErrors: { category: ["invalid-category"] },
    });
  });

  it("runs guard before delegating preparePostPublishAction and hardcodes collection posts", async () => {
    allow(["content:read", "content:write", "content:publish"]);
    mockValidatePostBeforePublish.mockResolvedValue(null);
    mockPreparePublishAction.mockResolvedValue({
      ok: true,
      doc: { _id: "64b000000000000000000010", draft: { title: { "es-AR": "Ok" } }, revision: 2 },
      status: "draft",
      isFirstPublish: true,
      isPublishEmailsEnabled: false,
      willCascade: [],
    });

    const res = await preparePostPublishAction({
      collection: "topics", // spoofed collection must be ignored
      docId: "64b000000000000000000010",
      expectedRevision: 1,
    });
    expect(res.ok).toBe(true);
    expect(mockPreparePublishAction).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "posts" }),
    );
  });

  it("short-circuits confirmPostPublishAction if cross-snapshot slug conflict is detected", async () => {
    allow(["content:read", "content:write", "content:publish"]);
    mockValidatePostBeforePublish.mockResolvedValue({
      ok: false,
      reason: "duplicate-key",
      field: "slug",
      fieldErrors: { slug: ["duplicate-key"] },
    });

    const res = await confirmPostPublishAction({
      collection: "posts",
      docId: "64b000000000000000000010",
      expectedRevision: 2,
      notify: true,
    });
    expect(res).toEqual({
      ok: false,
      reason: "duplicate-key",
      field: "slug",
      fieldErrors: { slug: ["duplicate-key"] },
    });
    expect(mockConfirmPublishAction).not.toHaveBeenCalled();
  });
});
