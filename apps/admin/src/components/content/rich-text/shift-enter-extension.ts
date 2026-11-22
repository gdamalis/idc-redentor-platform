import { Extension, type Editor } from "@tiptap/react";

/**
 * Splits into a new list item (when inside a list in a profile with `listItem`)
 * or into a new paragraph, never inserting a `hardBreak` node.
 */
export function runShiftEnterAsParagraph(editor: Editor): boolean {
  if (editor.schema.nodes.listItem && editor.isActive("listItem")) {
    if (editor.commands.splitListItem("listItem")) {
      return true;
    }
  }
  return editor.commands.splitBlock();
}

/**
 * UI-only keyboard behavior (`F-editor-ux-decisions.md` §2.6, `ICR-197` Edge
 * case #5): Shift+Enter creates a new paragraph instead of inserting a
 * `hardBreak` node (which is disallowed in every profile).
 */
export const ShiftEnterParagraph = Extension.create({
  name: "shiftEnterParagraph",

  addKeyboardShortcuts() {
    return {
      "Shift-Enter": () => runShiftEnterAsParagraph(this.editor),
    };
  },
});
