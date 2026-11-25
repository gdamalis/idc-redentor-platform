import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import BibleVerse from "./BibleVerse";

describe("BibleVerse", () => {
  it("renders a single verse cleanly when toVerse is null (never '1-null')", () => {
    render(
      <BibleVerse
        book="Juan"
        chapter="3"
        fromVerse="16"
        toVerse={null}
        verseContent="Porque de tal manera amó Dios al mundo."
      />,
    );

    const cite = screen.getByText("Juan 3:16");
    expect(cite).toBeDefined();
    expect(cite.textContent).not.toContain("null");
  });

  it("renders a single verse when toVerse equals fromVerse (string or number)", () => {
    render(
      <BibleVerse
        book="Salmos"
        chapter={23}
        fromVerse={1}
        toVerse={1}
        verseContent="Jehová es mi pastor."
      />,
    );

    expect(screen.getByText("Salmos 23:1")).toBeDefined();
  });

  it("renders a verse range when toVerse differs from fromVerse", () => {
    render(
      <BibleVerse
        book="Efesios"
        chapter="2"
        fromVerse="8"
        toVerse="9"
        verseContent="Porque por gracia sois salvos."
      />,
    );

    expect(screen.getByText("Efesios 2:8-9")).toBeDefined();
  });
});
