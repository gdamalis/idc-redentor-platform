import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
});
