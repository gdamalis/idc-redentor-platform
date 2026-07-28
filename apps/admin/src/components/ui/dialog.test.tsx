import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { Dialog, DialogContent, DialogTitle } from "./dialog";

/**
 * ICR-128 P2 fix regression coverage: the close (X) button's accessible name
 * used to be hardcoded English (`"Close"`) inside this SHARED primitive, so
 * `es-AR` screen-reader users heard an untranslated control. `closeLabel` is
 * now a required prop — no default — so every consumer must pass a
 * translated string (see `invite-dialog.tsx` -> `common.close`).
 */
describe("DialogContent", () => {
  it("exposes the caller-supplied closeLabel as the close button's accessible name", () => {
    render(
      <Dialog defaultOpen>
        <DialogContent closeLabel="Cerrar">
          <DialogTitle>Título</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.getByRole("button", { name: "Cerrar" })).toBeInTheDocument();
  });
});
