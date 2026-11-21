import { LIMITS } from "../limits";

/**
 * The one link-address rule (XSS boundary for rich text), shared by the Zod document schema and
 * TipTap's `isAllowedUri`. Allowed: `https://…`, `http://…`, `mailto:…`, and site paths that start
 * with a single `/`. Everything else is refused: `javascript:`, `data:`, `vbscript:`, `tel:`,
 * protocol-relative `//host`, bare relative paths, and anything with whitespace or control
 * characters (which browsers strip, turning `java\tscript:` into `javascript:`).
 */
export function isAllowedHref(href: unknown): href is string {
  if (typeof href !== "string") return false;
  if (href.length === 0 || href.length > LIMITS.hrefMax) return false;
  for (let i = 0; i < href.length; i += 1) {
    const code = href.charCodeAt(i);
    // ASCII control chars, space, DEL, and the backslash browsers treat as "/".
    if (code <= 0x20 || code === 0x7f || code === 0x5c) return false;
    // Unicode whitespace / invisible separators.
    if (code === 0xa0 || code === 0x1680 || (code >= 0x2000 && code <= 0x200f))
      return false;
    if (
      code === 0x2028 ||
      code === 0x2029 ||
      code === 0x202f ||
      code === 0x205f
    )
      return false;
    if (code === 0x3000 || code === 0xfeff) return false;
  }
  if (href[0] === "/") return href.length === 1 || href[1] !== "/";
  const lower = href.toLowerCase();
  if (lower.startsWith("https://")) return href.length > "https://".length;
  if (lower.startsWith("http://")) return href.length > "http://".length;
  if (lower.startsWith("mailto:")) return href.length > "mailto:".length;
  return false;
}
