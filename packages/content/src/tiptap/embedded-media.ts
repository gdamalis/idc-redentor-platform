import { Node } from "@tiptap/core";

const MEDIA_ID_MAX = 128;

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
        parseHTML: (element) => {
          const id = element.getAttribute("data-media-id")?.trim();
          return id && id.length <= MEDIA_ID_MAX ? id : null;
        },
        renderHTML: (attributes) =>
          attributes.mediaId
            ? { "data-media-id": String(attributes.mediaId) }
            : {},
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-embedded-media]",
        getAttrs: (element) => {
          if (typeof element === "string") return false;
          const raw = element.getAttribute("data-media-id");
          if (!raw) return false;
          const id = raw.trim();
          if (id.length === 0 || id.length > MEDIA_ID_MAX) return false;
          return { mediaId: id };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-embedded-media": "" }];
  },
});
