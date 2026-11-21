import Link from "@tiptap/extension-link";
import { isAllowedHref } from "../rich-text/href";

/**
 * Custom Link mark replacing StarterKit v3's bundled Link.
 *
 * - Keeps ONLY `href` in stored JSON (strips `target`, `rel`, `class` so TipTap never stamps
 *   `target="_blank" rel="noopener noreferrer nofollow"` into content; each page decides).
 * - Mirrors `isAllowedHref` in `isAllowedUri`.
 * - Editor defaults built for ICR-197: `openOnClick: false`, `defaultProtocol: "https"`,
 *   `autolink: true`, `linkOnPaste: true`.
 */
export const CustomLink = Link.extend({
  addAttributes() {
    return {
      href: {
        default: null,
        parseHTML: (element) => {
          const href = element.getAttribute("href");
          return isAllowedHref(href) ? href : null;
        },
      },
    };
  },
}).configure({
  openOnClick: false,
  autolink: true,
  linkOnPaste: true,
  defaultProtocol: "https",
  protocols: ["http", "https", "mailto"],
  HTMLAttributes: {},
  isAllowedUri: (url) => isAllowedHref(url),
});
