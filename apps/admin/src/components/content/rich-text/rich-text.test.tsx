import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { Editor } from "@tiptap/react";
import {
  RICH_TEXT_SCHEMAS,
  validateRichText,
  type RichTextDoc,
  type RichTextProfile,
} from "@idcr/content";
import { createRichTextExtensions } from "@idcr/content/tiptap";
import { loadMessages } from "@src/i18n/load-messages";
import { LinkDialog, normalizeUserHref } from "./link-dialog";
import { isLossyRichTextLoad } from "./lossy-check";
import { sanitizePastedHtml } from "./paste-cleaner";
import { RichTextEditor } from "./rich-text-editor";
import {
  ShiftEnterParagraph,
  runShiftEnterAsParagraph,
} from "./shift-enter-extension";

const esMessages = loadMessages("es-AR");

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="es-AR" messages={esMessages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const GOOGLE_DOCS_PASTE = `
<b style="font-weight:normal;" id="docs-internal-guid-1234">
  <h1 style="font-family:Arial;color:#111;">Título principal</h1>
  <p style="line-height:1.5;"><span style="font-weight:400;">Texto normal&nbsp;con </span><span style="font-weight:700;">negrita real</span><span style="font-style:italic;"> y cursiva</span> y <a href="https://www.idcredentor.org/comunidad">un enlace</a>.</p>
  <h4 style="color:red;">Subtítulo nivel cuatro</h4>
  <ul><li><p>Primer punto</p></li><li><p>Segundo punto</p></li></ul>
</b>
`;

const WORD_PASTE = `
<style>.MsoNormal { font-family: Calibri; }</style>
<p class="MsoNormal"><u>Subrayado</u> y <s>tachado</s><o:p></o:p></p>
<div class="msocomtxt">Comentario de Word</div>
<table><tr><td>Celda uno</td><td>Celda dos</td></tr></table>
<p><img src="https://evil.example/photo.jpg" alt="x" />Texto después<br/>segunda línea</p>
<p><a href="javascript:alert(1)">Malicioso</a></p>
`;

function parseSanitizedThroughTipTap(
  rawHtml: string,
  profile: RichTextProfile,
): { doc: RichTextDoc; rejectedImage: boolean } {
  const { html, rejectedImage } = sanitizePastedHtml(rawHtml, profile);
  const editor = new Editor({
    extensions: [...createRichTextExtensions(profile), ShiftEnterParagraph],
    content: html,
  });
  const doc = editor.getJSON() as RichTextDoc;
  editor.destroy();
  return { doc, rejectedImage };
}

describe("Paste cleaner & TipTap profile schema validation (AC8)", () => {
  it("unwraps Google Docs normal-weight <b> so body text is NOT bold, maps h1->h2 & h4->h3 in article", () => {
    const { doc, rejectedImage } = parseSanitizedThroughTipTap(
      GOOGLE_DOCS_PASTE,
      "article",
    );

    expect(rejectedImage).toBe(false);
    expect(validateRichText(doc, "article")).toEqual([]);
    expect(RICH_TEXT_SCHEMAS.article.safeParse(doc).success).toBe(true);

    // Check heading mapping
    expect(doc.content[0]).toMatchObject({ type: "heading", attrs: { level: 2 } });
    expect(doc.content[2]).toMatchObject({ type: "heading", attrs: { level: 3 } });

    // Check Google Docs normal-weight text is NOT marked bold, while weight:700 IS bold
    const pNode = doc.content[1];
    expect(pNode?.type).toBe("paragraph");
    if (pNode?.type === "paragraph" && pNode.content) {
      const normalRun = pNode.content.find(
        (n) => n.type === "text" && n.text.includes("Texto normal"),
      );
      expect(normalRun?.type === "text" && normalRun.marks).toBeFalsy();
      expect(normalRun?.type === "text" && normalRun.text).not.toContain("\u00a0");

      const boldRun = pNode.content.find(
        (n) => n.type === "text" && n.text.includes("negrita real"),
      );
      expect(
        boldRun?.type === "text" &&
          boldRun.marks?.some((m) => m.type === "bold"),
      ).toBe(true);
    }
  });

  it("strips headings, lists, and links when pasting Google Docs into inline profile", () => {
    const { doc } = parseSanitizedThroughTipTap(GOOGLE_DOCS_PASTE, "inline");
    expect(validateRichText(doc, "inline")).toEqual([]);
    expect(RICH_TEXT_SCHEMAS.inline.safeParse(doc).success).toBe(true);
    expect(doc.content.every((n) => n.type === "paragraph")).toBe(true);
  });

  it("strips Word styles, comments, underline/strike, javascript: links, flattens tables, splits <br>, and flags <img>", () => {
    const { doc, rejectedImage } = parseSanitizedThroughTipTap(
      WORD_PASTE,
      "article",
    );

    expect(rejectedImage).toBe(true);
    expect(validateRichText(doc, "article")).toEqual([]);
    const serialized = JSON.stringify(doc);
    expect(serialized).not.toContain("Comentario de Word");
    expect(serialized).not.toContain("javascript:");
    expect(serialized).not.toContain("hardBreak");
    expect(serialized).toContain("Celda uno");
    expect(serialized).toContain("Celda dos");
    expect(serialized).toContain("segunda línea");
  });

  it("refuses out-of-profile documents on schema validation", () => {
    const headingDoc: RichTextDoc = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "No permitido en inline" }],
        },
      ],
    };
    expect(validateRichText(headingDoc, "inline").length).toBeGreaterThan(0);
    expect(RICH_TEXT_SCHEMAS.inline.safeParse(headingDoc).success).toBe(false);
  });

  it("creates a new paragraph on Shift+Enter with zero hardBreak nodes (inline & article)", () => {
    const editor = new Editor({
      extensions: [...createRichTextExtensions("inline"), ShiftEnterParagraph],
      content: "<p>Hola mundo</p>",
    });
    editor.commands.setTextSelection(5);
    expect(runShiftEnterAsParagraph(editor)).toBe(true);
    const doc = editor.getJSON() as RichTextDoc;
    expect(doc.content).toHaveLength(2);
    expect(JSON.stringify(doc)).not.toContain("hardBreak");
    expect(validateRichText(doc, "inline")).toEqual([]);
    editor.destroy();
  });
});

describe("LinkDialog & normalizeUserHref (Edge case #2)", () => {
  it("normalizes bare domains, emails, and rejects unsafe schemes", () => {
    expect(normalizeUserHref("idcredentor.org/blog")).toBe(
      "https://idcredentor.org/blog",
    );
    expect(normalizeUserHref("hola@idcredentor.org")).toBe(
      "mailto:hola@idcredentor.org",
    );
    expect(normalizeUserHref("/comunidad")).toBe("/comunidad");
    expect(normalizeUserHref("javascript:alert(1)")).toBeNull();
    expect(normalizeUserHref("//evil.com")).toBeNull();
  });

  it("pressing Enter inside LinkDialog NEVER submits an outer parent <form>", async () => {
    const user = userEvent.setup();
    const onParentSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    const onSave = vi.fn();

    renderWithIntl(
      <form onSubmit={onParentSubmit}>
        <LinkDialog
          open
          onOpenChange={() => {}}
          initialHref=""
          isEditing={false}
          needsLinkText={false}
          onSave={onSave}
        />
      </form>,
    );

    const input = screen.getByLabelText("Dirección del enlace");
    await user.type(input, "idcredentor.org{Enter}");

    expect(onSave).toHaveBeenCalledWith("https://idcredentor.org", undefined);
    expect(onParentSubmit).not.toHaveBeenCalled();
  });
});

describe("RichTextEditor component & lossy-load detection", () => {
  it("renders only profile-allowed toolbar controls", async () => {
    const { rerender } = renderWithIntl(
      <RichTextEditor profile="inline" onChange={() => {}} />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Negrita" })).toBeDefined();
    });
    expect(screen.queryByRole("button", { name: "Enlace" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Estilo de párrafo" })).toBeNull();

    rerender(
      <NextIntlClientProvider locale="es-AR" messages={esMessages}>
        <RichTextEditor
          profile="sermon"
          onChange={() => {}}
          toolbarExtras={() => (
            <button type="button">Insertar audio</button>
          )}
        />
      </NextIntlClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Insertar audio" })).toBeDefined();
    });
  });

  it("round-trips a valid article corpus body without loss and detects lossy loads", () => {
    const validArticle: RichTextDoc = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Introducción" }],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Texto " },
            { type: "text", text: "importante", marks: [{ type: "bold" }] },
            {
              type: "text",
              text: " enlace",
              marks: [{ type: "link", attrs: { href: "/comunidad" } }],
            },
          ],
        },
        {
          type: "blockquote",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Cita destacada" }],
            },
          ],
        },
      ],
    };

    const editor = new Editor({
      extensions: createRichTextExtensions("article"),
      content: validArticle,
    });
    const roundTripped = editor.getJSON() as RichTextDoc;
    editor.destroy();

    expect(isLossyRichTextLoad(validArticle, roundTripped, "article")).toBe(false);
    expect(validateRichText(roundTripped, "article")).toEqual([]);

    // Unsupported node in inline profile triggers lossy-load detection
    expect(isLossyRichTextLoad(validArticle, roundTripped, "inline")).toBe(true);
  });

  it("emits only plain Object.prototype objects (never Object.create(null) attrs) for React 19 Flight Server Actions", async () => {
    const onChange = vi.fn<(doc: RichTextDoc) => void>();
    let capturedEditor: Editor | null = null;

    renderWithIntl(
      <RichTextEditor
        profile="sermon"
        onChange={onChange}
        toolbarExtras={(ed) => {
          capturedEditor = ed;
          return null;
        }}
      />,
    );

    await waitFor(() => {
      expect(capturedEditor).not.toBeNull();
    });

    onChange.mockClear();

    act(() => {
      capturedEditor!.commands.setContent(
        {
          type: "doc",
          content: [
            {
              type: "heading",
              attrs: { level: 2 },
              content: [{ type: "text", text: "Título" }],
            },
            {
              type: "orderedList",
              attrs: { start: 1 },
              content: [
                {
                  type: "listItem",
                  content: [
                    {
                      type: "paragraph",
                      content: [
                        {
                          type: "text",
                          text: "Enlace",
                          marks: [
                            { type: "link", attrs: { href: "/comunidad" } },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              type: "embeddedMedia",
              attrs: {
                mediaId: "000000000000000000000001",
                display: "image",
              },
            },
          ],
        },
        { emitUpdate: true },
      );
    });

    expect(onChange).toHaveBeenCalled();
    const emitted = onChange.mock.calls.at(-1)?.[0];
    expect(emitted).toBeDefined();
    expect(validateRichText(emitted!, "sermon")).toEqual([]);
    expect(emitted!.content.map((node) => node.type)).toEqual(
      expect.arrayContaining(["heading", "orderedList", "embeddedMedia"]),
    );

    const assertPlainObjects = (value: unknown, path = "$"): void => {
      if (value === null || typeof value !== "object") return;
      if (Array.isArray(value)) {
        value.forEach((item, index) =>
          assertPlainObjects(item, `${path}[${index}]`),
        );
        return;
      }
      expect(
        Object.getPrototypeOf(value),
        `Expected Object.prototype at ${path}`,
      ).toBe(Object.prototype);
      for (const [key, nested] of Object.entries(value)) {
        assertPlainObjects(nested, `${path}.${key}`);
      }
    };

    assertPlainObjects(emitted);
  });

  it("does not re-trigger false-positive lossy-load warnings when edited and re-rendered with an inline onLossyLoad callback", async () => {
    const initialDoc: RichTextDoc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Inicial" }] },
      ],
    };
    const onLossyCalls: boolean[] = [];
    let capturedEditor: Editor | null = null;

    function ControlledHarness() {
      const [doc, setDoc] = React.useState<RichTextDoc>(initialDoc);
      return (
        <RichTextEditor
          profile="inline"
          value={doc}
          onChange={setDoc}
          onLossyLoad={(lossy) => {
            onLossyCalls.push(lossy);
          }}
          toolbarExtras={(ed) => {
            capturedEditor = ed;
            return null;
          }}
        />
      );
    }

    renderWithIntl(<ControlledHarness />);

    await waitFor(() => {
      expect(capturedEditor).not.toBeNull();
    });
    expect(onLossyCalls).toEqual([false]);
    expect(screen.queryByTestId("rich-text-lossy-notice")).toBeNull();

    act(() => {
      capturedEditor!.commands.setContent(
        {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Inicial editado" }],
            },
          ],
        },
        { emitUpdate: true },
      );
    });

    expect(onLossyCalls).toEqual([false]);
    expect(screen.queryByTestId("rich-text-lossy-notice")).toBeNull();
  });
});
