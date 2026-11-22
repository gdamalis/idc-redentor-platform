import { describe, expect, it } from "vitest";
import {
  computeEditorActionState,
  type EditorActionStateInput,
} from "./action-state";

const base: EditorActionStateInput = {
  collection: "posts",
  status: "draft",
  isNew: false,
  isDirty: false,
  isSaving: false,
  isPublishing: false,
  isProtected: false,
  hasPublishedCopy: false,
  canWrite: true,
  canPublish: true,
  canPublishProtected: true,
};

describe("computeEditorActionState (UX §2.2 matrix)", () => {
  it("disables Save when clean and enables Save when dirty", () => {
    expect(computeEditorActionState({ ...base, isDirty: false }).save.disabled).toBe(true);
    expect(computeEditorActionState({ ...base, isDirty: true }).save.disabled).toBe(false);
  });

  it("marks read-only users properly and disables Save and Publish", () => {
    const state = computeEditorActionState({
      ...base,
      isDirty: true,
      canWrite: false,
      canPublish: false,
      canPublishProtected: false,
    });
    expect(state.isReadOnly).toBe(true);
    expect(state.save.disabled).toBe(true);
    expect(state.publish.disabled).toBe(true);
    expect(state.publish.reason).toBe("no-publish-permission");
    expect(state.menu.visible).toBe(false);
  });

  it("lets write-only users save drafts while disabling Publish with reason", () => {
    const state = computeEditorActionState({
      ...base,
      isDirty: true,
      canWrite: true,
      canPublish: false,
      canPublishProtected: false,
    });
    expect(state.save.disabled).toBe(false);
    expect(state.publish.disabled).toBe(true);
    expect(state.publish.reason).toBe("no-publish-permission");
    expect(state.publish.showLock).toBe(false);
  });

  it("locks Publish and omits Unpublish/Delete on protected entries without content:publish-protected", () => {
    const state = computeEditorActionState({
      ...base,
      collection: "topics",
      status: "changed",
      hasPublishedCopy: true,
      isProtected: true,
      canWrite: true,
      canPublish: true,
      canPublishProtected: false,
    });
    expect(state.publish.disabled).toBe(true);
    expect(state.publish.reason).toBe("no-protected-permission");
    expect(state.publish.showLock).toBe(true);
    expect(state.menu.showDiscard).toBe(true);
    expect(state.menu.showUnpublish).toBe(false);
    expect(state.menu.showDelete).toBe(false);
  });

  it("omits Unpublish, Delete, and empty menu on clean fixed entries", () => {
    const cleanFixed = computeEditorActionState({
      ...base,
      collection: "sections",
      status: "published",
      hasPublishedCopy: true,
    });
    expect(cleanFixed.publish.labelKey).toBe("publishedDisabled");
    expect(cleanFixed.publish.disabled).toBe(true);
    expect(cleanFixed.menu.visible).toBe(false);
    expect(cleanFixed.menu.showDelete).toBe(false);
    expect(cleanFixed.menu.showUnpublish).toBe(false);

    const changedFixed = computeEditorActionState({
      ...base,
      collection: "sections",
      status: "changed",
      hasPublishedCopy: true,
    });
    expect(changedFixed.menu.visible).toBe(true);
    expect(changedFixed.menu.showDiscard).toBe(true);
    expect(changedFixed.menu.showDelete).toBe(false);
    expect(changedFixed.menu.showUnpublish).toBe(false);
  });

  it("greys Delete with must-unpublish on published editorial entries and enables it when unpublished", () => {
    const publishedPost = computeEditorActionState({
      ...base,
      collection: "posts",
      status: "published",
      hasPublishedCopy: true,
    });
    expect(publishedPost.menu.showUnpublish).toBe(true);
    expect(publishedPost.menu.showDelete).toBe(true);
    expect(publishedPost.menu.deleteDisabled).toBe(true);
    expect(publishedPost.menu.deleteDisabledReason).toBe("must-unpublish");

    const draftPost = computeEditorActionState({
      ...base,
      collection: "posts",
      status: "draft",
      hasPublishedCopy: false,
    });
    expect(draftPost.menu.showUnpublish).toBe(false);
    expect(draftPost.menu.showDelete).toBe(true);
    expect(draftPost.menu.deleteDisabled).toBe(false);
  });

  it("omits Preview and View-on-site for library types and disables Preview on untouched new entries", () => {
    const verse = computeEditorActionState({
      ...base,
      collection: "bible_verses",
      status: "published",
      hasPublishedCopy: true,
    });
    expect(verse.preview.visible).toBe(false);
    expect(verse.viewOnSite.visible).toBe(false);
    expect(verse.menu.showUnpublish).toBe(false);
    expect(verse.menu.showDelete).toBe(true);
    expect(verse.menu.deleteDisabled).toBe(false);

    const freshPost = computeEditorActionState({
      ...base,
      isNew: true,
      isDirty: false,
    });
    expect(freshPost.preview.visible).toBe(true);
    expect(freshPost.preview.disabled).toBe(true);
  });
});
