import type { RichTextDoc } from "@idcr/content";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  articlePreset,
  contactFormAgreementPreset,
  createSermonPreset,
  infoCommunityPreset,
  renderRichText,
  sectionDescriptionPreset,
} from "../index";
import { renderToNormalizedHtml } from "./parity-helpers";

vi.mock("@src/i18n/routing", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: ReactNode;
    className?: string;
    target?: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe("Allowlisted renderer security & fail-closed boundary (AC6)", () => {
  it("renders nothing for unknown or disallowed nodes (zero raw HTML, zero debug text)", () => {
    const hostileDoc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Safe" }] },
        { type: "table", content: [{ type: "paragraph", content: [{ type: "text", text: "SecretTable" }] }] },
        { type: "codeBlock", content: [{ type: "text", text: "<script>alert(1)</script>" }] },
        { type: "horizontalRule" },
        { type: "image", attrs: { src: "https://evil.example/x.png" } },
        { type: "postLink", attrs: { postId: "abc" }, content: [{ type: "text", text: "DebugLink" }] },
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "BadH1" }] },
        { type: "heading", attrs: { level: 4 }, content: [{ type: "text", text: "BadH4" }] },
        { type: "unknownWidget", attrs: { html: "<img src=x onerror=alert(1)>" } },
        { type: "embeddedMedia", attrs: { mediaId: "should-not-render-in-article" } },
      ],
    } as unknown as RichTextDoc;

    const html = renderToNormalizedHtml(
      renderRichText({ doc: hostileDoc, media: {} }, articlePreset),
    );

    expect(html).toContain("Safe");
    expect(html).not.toContain("SecretTable");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<hr");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("DebugLink");
    expect(html).not.toContain("BadH1");
    expect(html).not.toContain("BadH4");
    expect(html).not.toContain("type:");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("should-not-render-in-article");
  });

  it("drops headings, blockquotes, lists, and embeds when rendered with a paragraph-only inline preset", () => {
    const docWithDisallowedBlocks = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Allowed" }] },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "DroppedHeading" }] },
        {
          type: "blockquote",
          content: [{ type: "paragraph", content: [{ type: "text", text: "DroppedQuote" }] }],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "DroppedList" }] }],
            },
          ],
        },
      ],
    } as unknown as RichTextDoc;

    for (const preset of [sectionDescriptionPreset, infoCommunityPreset]) {
      const html = renderToNormalizedHtml(
        renderRichText({ doc: docWithDisallowedBlocks, media: {} }, preset),
      );
      expect(html).toContain("Allowed");
      expect(html).not.toContain("DroppedHeading");
      expect(html).not.toContain("DroppedQuote");
      expect(html).not.toContain("DroppedList");
      expect(html).not.toContain("<h2");
      expect(html).not.toContain("<blockquote");
      expect(html).not.toContain("<ul");
    }
  });

  it("renders nothing for disallowed marks and script-capable or disallowed link hrefs", () => {
    const badHrefs = [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "java\tscript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "tel:+5491112345678",
      "//evil.example/phish",
    ];

    const hostileInlineDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "KeepMe" },
            { type: "text", text: "BadUnderline", marks: [{ type: "underline" }] },
            { type: "text", text: "BadStrike", marks: [{ type: "strike" }] },
            { type: "text", text: "BadCode", marks: [{ type: "code" }] },
            { type: "text", text: "BadCustom", marks: [{ type: "textStyle" }] },
            ...badHrefs.map((href, idx) => ({
              type: "text",
              text: `BadHref${idx}`,
              marks: [{ type: "link", attrs: { href } }],
            })),
          ],
        },
      ],
    } as unknown as RichTextDoc;

    for (const preset of [
      articlePreset,
      createSermonPreset(),
      contactFormAgreementPreset,
    ]) {
      const html = renderToNormalizedHtml(
        renderRichText({ doc: hostileInlineDoc, media: {} }, preset),
      );
      expect(html).toContain("KeepMe");
      expect(html).not.toContain("BadUnderline");
      expect(html).not.toContain("BadStrike");
      expect(html).not.toContain("BadCode");
      expect(html).not.toContain("BadCustom");
      expect(html).not.toContain("<a ");
      expect(html).not.toContain("javascript:");
      expect(html).not.toContain("data:");
      expect(html).not.toContain("vbscript:");
      expect(html).not.toContain("BadHref");
    }

    // Link mark inside inline profile (which forbids links) renders nothing
    const linkInInlineDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Ok" },
            {
              type: "text",
              text: "NoLinkHere",
              marks: [{ type: "link", attrs: { href: "https://example.org" } }],
            },
          ],
        },
      ],
    } as unknown as RichTextDoc;
    const inlineHtml = renderToNormalizedHtml(
      renderRichText({ doc: linkInInlineDoc, media: {} }, sectionDescriptionPreset),
    );
    expect(inlineHtml).toContain("Ok");
    expect(inlineHtml).not.toContain("NoLinkHere");
    expect(inlineHtml).not.toContain("<a");
  });

  it("escapes literal HTML strings inside text nodes instead of injecting raw HTML", () => {
    const xssTextDoc: RichTextDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: '<img src="x" onerror="alert(1)">' }],
        },
      ],
    };

    const html = renderToNormalizedHtml(
      renderRichText({ doc: xssTextDoc, media: {} }, articlePreset),
    );
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});
