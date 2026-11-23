import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PermissionKey } from "@src/lib/rbac/permissions";

const mockRequireActionPermission = vi.fn();
const mockRevalidatePath = vi.fn();
const mockCreateGuardedTopic = vi.fn();
const mockSaveGuardedTopicDraft = vi.fn();
const mockValidateTopicBeforePublish = vi.fn();
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
  createGuardedTopic: (...args: unknown[]) => mockCreateGuardedTopic(...args),
  saveGuardedTopicDraft: (...args: unknown[]) =>
    mockSaveGuardedTopicDraft(...args),
  validateTopicBeforePublish: (...args: unknown[]) =>
    mockValidateTopicBeforePublish(...args),
}));

vi.mock("@src/app/[locale]/(app)/content/actions", () => ({
  preparePublishAction: (...args: unknown[]) =>
    mockPreparePublishAction(...args),
  confirmPublishAction: (...args: unknown[]) =>
    mockConfirmPublishAction(...args),
}));

import {
  confirmTopicPublishAction,
  createTopicAction,
  prepareTopicPublishAction,
  saveTopicDraftAction,
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

describe("topics/actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses crafted protected flag toggle via saveTopicDraftAction", async () => {
    allow(["content:read", "content:write", "content:publish"]);
    mockSaveGuardedTopicDraft.mockResolvedValue({
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:publish-protected",
    });

    const res = await saveTopicDraftAction({
      collection: "topics",
      docId: "64b000000000000000000020",
      patch: { protected: false },
      expectedRevision: 1,
    });
    expect(res).toEqual({
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:publish-protected",
    });
  });

  it("refuses reserved route slug in createTopicAction", async () => {
    allow(["content:read", "content:write"]);
    mockCreateGuardedTopic.mockResolvedValue({
      ok: false,
      reason: "invalid",
      fieldErrors: { "slug.es-AR": ["reserved-route-slug"] },
    });

    const res = await createTopicAction({
      collection: "topics",
      draft: { name: { "es-AR": "Blog" }, slug: { "es-AR": "blog" } },
    });
    expect(res).toEqual({
      ok: false,
      reason: "invalid",
      fieldErrors: { "slug.es-AR": ["reserved-route-slug"] },
    });
  });

  it("blocks prepareTopicPublishAction & confirmTopicPublishAction on protected refusal", async () => {
    allow(["content:read", "content:write", "content:publish"]);
    mockValidateTopicBeforePublish.mockResolvedValue({
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:publish-protected",
    });

    const prep = await prepareTopicPublishAction({
      collection: "topics",
      docId: "64b000000000000000000020",
      expectedRevision: 2,
    });
    expect(prep).toEqual({
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:publish-protected",
    });
    expect(mockPreparePublishAction).not.toHaveBeenCalled();

    const conf = await confirmTopicPublishAction({
      collection: "topics",
      docId: "64b000000000000000000020",
      expectedRevision: 2,
    });
    expect(conf).toEqual({
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:publish-protected",
    });
    expect(mockConfirmPublishAction).not.toHaveBeenCalled();
  });
});
