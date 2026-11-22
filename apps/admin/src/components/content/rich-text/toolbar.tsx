"use client";

import * as React from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Undo2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
  RICH_TEXT_MARK,
  RICH_TEXT_NODE,
  RICH_TEXT_PROFILES,
  type RichTextProfile,
} from "@idcr/content";
import { cn } from "@idcr/ui";
import { Button } from "@src/components/ui/button";

export interface RichTextToolbarProps {
  readonly editor: Editor;
  readonly profile: RichTextProfile;
  readonly readOnly?: boolean;
  readonly onOpenLinkDialog: () => void;
  /** Optional slot rendered before Undo/Redo (`ICR-200` sermon audio/PDF buttons). */
  readonly toolbarExtras?: (editor: Editor) => React.ReactNode;
}

/**
 * Fixed sticky toolbar driven by TipTap v3's `useEditorState`
 * (`shouldRerenderOnTransaction` defaults to `false` in v3 — `F` §2.6, `H` #6).
 */
export function RichTextToolbar({
  editor,
  profile,
  readOnly = false,
  onOpenLinkDialog,
  toolbarExtras,
}: RichTextToolbarProps) {
  const t = useTranslations("content.richText");
  const spec = RICH_TEXT_PROFILES[profile];
  const nodes = new Set<string>(spec.nodes);
  const marks = new Set<string>(spec.marks);

  const allowHeading = nodes.has(RICH_TEXT_NODE.heading);
  const allowBulletList = nodes.has(RICH_TEXT_NODE.bulletList);
  const allowOrderedList = nodes.has(RICH_TEXT_NODE.orderedList);
  const allowBlockquote = nodes.has(RICH_TEXT_NODE.blockquote);
  const allowLink = marks.has(RICH_TEXT_MARK.link);

  const state = useEditorState({
    editor,
    selector: (ctx) => ({
      isBold: ctx.editor.isActive("bold"),
      isItalic: ctx.editor.isActive("italic"),
      isLink: ctx.editor.isActive("link"),
      isBulletList: ctx.editor.isActive("bulletList"),
      isOrderedList: ctx.editor.isActive("orderedList"),
      isBlockquote: ctx.editor.isActive("blockquote"),
      blockStyle: ctx.editor.isActive("heading", { level: 2 })
        ? "h2"
        : ctx.editor.isActive("heading", { level: 3 })
          ? "h3"
          : "paragraph",
      canUndo: ctx.editor.can().undo(),
      canRedo: ctx.editor.can().redo(),
    }),
  });

  const handleStyleChange = (value: string) => {
    if (value === "h2") {
      editor.chain().focus().setHeading({ level: 2 }).run();
    } else if (value === "h3") {
      editor.chain().focus().setHeading({ level: 3 }).run();
    } else {
      editor.chain().focus().setParagraph().run();
    }
  };

  return (
    <div
      role="toolbar"
      aria-label={t("toolbarLabel")}
      className="sticky top-14 z-10 flex items-center gap-1 overflow-x-auto border-b border-border bg-muted/60 px-2 py-1.5 backdrop-blur-sm"
    >
      {allowHeading && (
        <select
          aria-label={t("styleLabel")}
          disabled={readOnly}
          value={state.blockStyle}
          onChange={(e) => handleStyleChange(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
        >
          <option value="paragraph">{t("styles.paragraph")}</option>
          <option value="h2">{t("styles.h2")}</option>
          <option value="h3">{t("styles.h3")}</option>
        </select>
      )}

      <ToolbarButton
        label={t("bold")}
        active={state.isBold}
        disabled={readOnly}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="size-4" aria-hidden="true" />
      </ToolbarButton>

      <ToolbarButton
        label={t("italic")}
        active={state.isItalic}
        disabled={readOnly}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="size-4" aria-hidden="true" />
      </ToolbarButton>

      {allowBulletList && (
        <ToolbarButton
          label={t("bulletList")}
          active={state.isBulletList}
          disabled={readOnly}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="size-4" aria-hidden="true" />
        </ToolbarButton>
      )}

      {allowOrderedList && (
        <ToolbarButton
          label={t("orderedList")}
          active={state.isOrderedList}
          disabled={readOnly}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="size-4" aria-hidden="true" />
        </ToolbarButton>
      )}

      {allowBlockquote && (
        <ToolbarButton
          label={t("blockquote")}
          active={state.isBlockquote}
          disabled={readOnly}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote className="size-4" aria-hidden="true" />
        </ToolbarButton>
      )}

      {allowLink && (
        <ToolbarButton
          label={t("link")}
          active={state.isLink}
          disabled={readOnly}
          onClick={onOpenLinkDialog}
        >
          <Link2 className="size-4" aria-hidden="true" />
        </ToolbarButton>
      )}

      {toolbarExtras && (
        <div className="flex items-center gap-1 border-l border-border pl-1">
          {toolbarExtras(editor)}
        </div>
      )}

      <div className="ml-auto flex items-center gap-1 border-l border-border pl-1">
        <ToolbarButton
          label={t("undo")}
          active={false}
          disabled={readOnly || !state.canUndo}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 className="size-4" aria-hidden="true" />
        </ToolbarButton>

        <ToolbarButton
          label={t("redo")}
          active={false}
          disabled={readOnly || !state.canRedo}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 className="size-4" aria-hidden="true" />
        </ToolbarButton>
      </div>
    </div>
  );
}

function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  readonly label: string;
  readonly active: boolean;
  readonly disabled: boolean;
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        "size-8 shrink-0",
        active && "bg-accent text-accent-foreground",
      )}
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
