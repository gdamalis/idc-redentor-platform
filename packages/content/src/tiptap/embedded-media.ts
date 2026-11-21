import { Node } from "@tiptap/core";

/**
 * Atomic block node for audio/PDF embeds inside sermon content (`sermon` profile only).
 * Holds `{ mediaId }` only; the renderer (ICR-202) resolves the media record and dispatches
 * by contentType (`audio/*` or `application/pdf`).
 */
export const EmbeddedMedia = Node.create({
  name: "embeddedMedia",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      mediaId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-media-id"),
        renderHTML: (attributes) =>
          attributes.mediaId ? { "data-media-id": String(attributes.mediaId) } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-embedded-media]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-embedded-media": "" }];
  },
});
