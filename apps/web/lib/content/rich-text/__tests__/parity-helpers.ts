import { render } from "@testing-library/react";
import { createElement, Fragment, type ReactNode } from "react";

/**
 * Normalizes serialized HTML for DOM parity comparisons without masking real
 * structural, tag, class, or attribute differences:
 * - Parses the rendered HTML into a detached DOM container.
 * - Collapses runs of ASCII whitespace (`[ \t\r\n]+`) inside text nodes to a single space
 *   (matching HTML whitespace collapsing after Contentful `\n` -> TipTap `" "`).
 * - Leaves element tags, nesting, attribute names/values, and class lists intact.
 */
export function normalizeHtmlForParity(html: string): string {
  const container = document.createElement("div");
  container.innerHTML = html;

  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent ?? "";
        child.textContent = text.replace(/[ \t\r\n]+/g, " ");
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        walk(child);
      }
    }
  };

  walk(container);
  return container.innerHTML.trim();
}

export function renderToNormalizedHtml(element: ReactNode): string {
  const { container, unmount } = render(createElement(Fragment, null, element));
  const normalized = normalizeHtmlForParity(container.innerHTML);
  unmount();
  return normalized;
}
