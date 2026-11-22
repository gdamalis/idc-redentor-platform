"use client";

import * as React from "react";
import {
  EditorContent,
  ReactNodeViewRenderer,
  useEditor,
  useEditorState,
  type Editor,
  type ReactNodeViewProps,
} from "@tiptap/react";
import { useTranslations } from "next-intl";
import {
  RICH_TEXT_MARK,
  RICH_TEXT_PROFILES,
  type RichTextDoc,
  type RichTextProfile,
} from "@idcr/content";
import {
  EmbeddedMedia,
  TIPTAP_EDITOR_DEFAULTS,
  createRichTextExtensions,
} from "@idcr/content/tiptap";
import { cn } from "@idcr/ui";
import { Button } from "@src/components/ui/button";
import { Notice } from "@src/components/ui/notice";
import { LinkDialog } from "./link-dialog";
import { isLossyRichTextLoad } from "./lossy-check";
import { sanitizePastedHtml } from "./paste-cleaner";
import { ShiftEnterParagraph } from "./shift-enter-extension";
import { RichTextToolbar } from "./toolbar";

const EMPTY_DOC: RichTextDoc = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export interface RichTextEditorProps {
  readonly profile: RichTextProfile;
  readonly value?: RichTextDoc;
  readonly onChange: (doc: RichTextDoc) => void;
  readonly readOnly?: boolean;
  readonly placeholder?: string;
  readonly minHeightClassName?: string;
  /** Optional sermon toolbar buttons rendered before Undo/Redo (`ICR-200`). */
  readonly toolbarExtras?: (editor: Editor) => React.ReactNode;
  /** Optional React NodeView for `embeddedMedia` in `sermon` profile (`ICR-200`). */
  readonly embeddedMediaNodeView?: React.ComponentType<
    ReactNodeViewProps<HTMLElement>
  >;
  /** Fires if loading `value` dropped unsupported nodes/marks (`H` #1, Edge case #11). */
  readonly onLossyLoad?: (isLossy: boolean) => void;
  readonly className?: string;
}

/**
 * Shared TipTap `~3.34.0` rich-text editor (`F-editor-ux-decisions.md` §2.6, §7 #9).
 * Uses `createRichTextExtensions(profile)` from `@idcr/content/tiptap` as the
 * single schema source of truth shared with Zod validation and the renderer.
 */
export function RichTextEditor({
  profile,
  value,
  onChange,
  readOnly = false,
  minHeightClassName = "min-h-40",
  toolbarExtras,
  embeddedMediaNodeView,
  onLossyLoad,
  className,
}: RichTextEditorProps) {
  const t = useTranslations("content.richText");
  const [pastedImageWarning, setPastedImageWarning] = React.useState(false);
  const [isLossy, setIsLossy] = React.useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = React.useState(false);
  const isInternalUpdateRef = React.useRef(false);
  const initialValueRef = React.useRef(value);
  const onChangeRef = React.useRef(onChange);
  React.useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const allowLink = (
    RICH_TEXT_PROFILES[profile].marks as readonly string[]
  ).includes(RICH_TEXT_MARK.link);

  const extensions = React.useMemo(() => {
    const base = createRichTextExtensions(profile);
    if (profile === "sermon" && embeddedMediaNodeView) {
      const filtered = base.filter((ext) => ext.name !== "embeddedMedia");
      return [
        ...filtered,
        EmbeddedMedia.extend({
          addNodeView() {
            return ReactNodeViewRenderer(embeddedMediaNodeView);
          },
        }),
        ShiftEnterParagraph,
      ];
    }
    return [...base, ShiftEnterParagraph];
  }, [embeddedMediaNodeView, profile]);

  const editor = useEditor({
    extensions,
    content: value ?? EMPTY_DOC,
    editable: !readOnly,
    immediatelyRender: TIPTAP_EDITOR_DEFAULTS.immediatelyRender,
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm dark:prose-invert max-w-none px-3 py-2.5 focus:outline-none",
          minHeightClassName,
        ),
      },
      transformPastedHTML: (html) => {
        const result = sanitizePastedHtml(html, profile);
        if (result.rejectedImage) {
          setPastedImageWarning(true);
        }
        return result.html;
      },
      handlePaste: (_view, event) => {
        const files = event.clipboardData?.files;
        if (files && files.length > 0) {
          for (let i = 0; i < files.length; i += 1) {
            if (files[i]?.type.startsWith("image/")) {
              setPastedImageWarning(true);
              return true;
            }
          }
        }
        return false;
      },
      handleDrop: (_view, event) => {
        const files = event.dataTransfer?.files;
        if (files && files.length > 0) {
          for (let i = 0; i < files.length; i += 1) {
            if (files[i]?.type.startsWith("image/")) {
              setPastedImageWarning(true);
              return true;
            }
          }
        }
        return false;
      },
    },
    onUpdate: ({ editor: current }) => {
      isInternalUpdateRef.current = true;
      onChangeRef.current(current.getJSON() as RichTextDoc);
    },
  });

  // Sync editable state if readOnly toggles
  React.useEffect(() => {
    if (!editor) return;
    editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  // Detect lossy parse on initial load (Edge case #11)
  React.useEffect(() => {
    if (!editor) return;
    const lossy = isLossyRichTextLoad(
      initialValueRef.current,
      editor.getJSON() as RichTextDoc,
      profile,
    );
    setIsLossy(lossy);
    onLossyLoad?.(lossy);
  }, [editor, onLossyLoad, profile]);

  // Sync external value resets (e.g. "Copiar del español", Recovery restore, Discard)
  React.useEffect(() => {
    if (!editor) return;
    if (isInternalUpdateRef.current) {
      isInternalUpdateRef.current = false;
      return;
    }
    const nextContent = value ?? EMPTY_DOC;
    const currentJson = JSON.stringify(editor.getJSON());
    const nextJson = JSON.stringify(nextContent);
    if (currentJson !== nextJson) {
      editor.commands.setContent(nextContent, { emitUpdate: false });
    }
  }, [editor, value]);

  if (!editor) {
    return (
      <div
        className={cn(
          "rounded-md border border-input bg-background shadow-sm",
          minHeightClassName,
          className,
        )}
      />
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {isLossy && (
        <Notice variant="warning" data-testid="rich-text-lossy-notice">
          {t("lossyNotice")}
        </Notice>
      )}

      {pastedImageWarning && (
        <Notice variant="warning" data-testid="rich-text-image-warning">
          {t("pastedImage")}
        </Notice>
      )}

      <div
        className={cn(
          "rounded-md border border-input bg-background shadow-sm focus-within:border-ring focus-within:inset-ring-1 focus-within:inset-ring-ring",
          readOnly && "opacity-75",
        )}
      >
        <RichTextToolbar
          editor={editor}
          profile={profile}
          readOnly={readOnly}
          onOpenLinkDialog={() => setLinkDialogOpen(true)}
          toolbarExtras={toolbarExtras}
        />

        {allowLink && (
          <ActiveLinkBar
            editor={editor}
            readOnly={readOnly}
            onEdit={() => setLinkDialogOpen(true)}
          />
        )}

        <EditorContent editor={editor} />
      </div>

      {allowLink && (
        <LinkDialog
          open={linkDialogOpen}
          onOpenChange={setLinkDialogOpen}
          initialHref={
            (editor.getAttributes("link").href as string | undefined) ?? ""
          }
          isEditing={editor.isActive("link")}
          needsLinkText={!editor.isActive("link") && editor.state.selection.empty}
          onSave={(href, text) => {
            if (text && editor.state.selection.empty) {
              editor
                .chain()
                .focus()
                .insertContent({
                  type: "text",
                  text,
                  marks: [{ type: "link", attrs: { href } }],
                })
                .run();
            } else {
              editor
                .chain()
                .focus()
                .extendMarkRange("link")
                .setLink({ href })
                .run();
            }
          }}
          onRemove={() => {
            editor.chain().focus().extendMarkRange("link").unsetLink().run();
          }}
        />
      )}
    </div>
  );
}

function ActiveLinkBar({
  editor,
  readOnly,
  onEdit,
}: {
  readonly editor: Editor;
  readonly readOnly: boolean;
  readonly onEdit: () => void;
}) {
  const t = useTranslations("content.richText.linkBar");
  const activeHref = useEditorState({
    editor,
    selector: (ctx) =>
      ctx.editor.isActive("link")
        ? ((ctx.editor.getAttributes("link").href as string | undefined) ?? null)
        : null,
  });

  if (!activeHref) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-1.5 text-xs">
      <span className="truncate font-mono text-muted-foreground">
        {activeHref}
      </span>
      {!readOnly && (
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={onEdit}
          >
            {t("edit")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-destructive hover:text-destructive"
            onClick={() =>
              editor.chain().focus().extendMarkRange("link").unsetLink().run()
            }
          >
            {t("remove")}
          </Button>
        </div>
      )}
    </div>
  );
}
