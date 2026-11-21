import { describe, expect, it } from "vitest";
import { z } from "zod";

// Zod 4 regression net (ICR-194): the subscribe route validates with exactly this chain.
// Zod 4 replaced the built-in email pattern; addresses accepted under Zod 3 must still pass.
const emailSchema = z.string().trim().email();

describe("subscribe email validation under zod 4", () => {
  it.each([
    "ana@example.com",
    "ana.maria@example.com",
    "ana+news@example.com",
    "ana_maria-1@example.com",
    "user123@mail.example.com.ar",
    "pastor@iglesia-redentor.org",
    "someone@example.museum",
    "someone@example.photography",
    "UPPER@EXAMPLE.COM",
    "  padded@example.com  ",
  ])("accepts %s", (email) => {
    expect(emailSchema.safeParse(email).success).toBe(true);
  });

  it.each(["", "plainaddress", "@example.com", "ana@", "ana@@example.com", "ana example@x.com"])(
    "rejects %j",
    (email) => {
      expect(emailSchema.safeParse(email).success).toBe(false);
    },
  );
});
