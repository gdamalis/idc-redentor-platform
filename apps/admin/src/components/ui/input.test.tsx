import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { createRef } from "react";

import { Input } from "./input";

describe("Input", () => {
  it("renders the base classes, including a focus ring CONTAINED inside the field (inset-ring), not an outer box-shadow ring", () => {
    render(<Input aria-label="email" />);
    const input = screen.getByRole("textbox");

    expect(input.className).toContain("border border-input");
    expect(input.className).toContain("shadow-sm");
    expect(input.className).toContain("focus-visible:inset-ring-1");
    expect(input.className).toContain("focus-visible:inset-ring-ring");
    expect(input.className).toContain("focus-visible:border-ring");
    expect(input.className).toContain("focus-visible:outline-none");
    // The old outer ring utility must be fully gone, not merely superseded.
    expect(input.className).not.toMatch(/focus-visible:ring-1\b/);
  });

  it("merges a caller-supplied className without dropping the base classes", () => {
    render(<Input aria-label="email" className="mt-4" />);
    const input = screen.getByRole("textbox");

    expect(input.className).toContain("mt-4");
    expect(input.className).toContain("rounded-md");
  });

  it("forwards a ref to the underlying <input> element", () => {
    const ref = createRef<HTMLInputElement>();
    render(<Input aria-label="email" ref={ref} />);

    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });

  it("forwards standard input props (type, disabled, value)", () => {
    render(<Input aria-label="password" type="password" disabled value="secret" onChange={() => {}} />);
    const input = screen.getByLabelText("password") as HTMLInputElement;

    expect(input.type).toBe("password");
    expect(input.disabled).toBe(true);
    expect(input.value).toBe("secret");
  });
});
