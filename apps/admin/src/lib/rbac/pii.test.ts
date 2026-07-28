import { describe, expect, it } from "vitest";
import { omitPii } from "./pii";
import { resolvePermissions } from "./resolve";

const withPii = resolvePermissions([{ permissions: ["people:pii"] }]);
const without = resolvePermissions([{ permissions: ["people:read"] }]);
const person = {
  id: "p1",
  firstName: "Ana",
  phone: "+5411",
  email: "ana@x.co",
};

describe("omitPii", () => {
  it("returns the record untouched with people:pii", () => {
    expect(omitPii(person, withPii)).toEqual(person);
  });

  it("OMITS phone/email entirely without the permission — not empty strings", () => {
    const result = omitPii(person, without);
    expect(result).not.toHaveProperty("phone");
    expect(result).not.toHaveProperty("email");
    expect(result).toMatchObject({ id: "p1", firstName: "Ana" });
  });

  it("does not mutate its input", () => {
    omitPii(person, without);
    expect(person.phone).toBe("+5411");
    expect(person.email).toBe("ana@x.co");
  });

  it("is safe on a record with no PII fields set", () => {
    expect(omitPii({ id: "p2", firstName: "Beto" }, without)).toEqual({
      id: "p2",
      firstName: "Beto",
    });
  });

  it("omits only phone when email is absent but phone is present", () => {
    const result = omitPii({ id: "p3", firstName: "Cata", phone: "+5412" }, without);
    expect(result).not.toHaveProperty("phone");
    expect(result).toEqual({ id: "p3", firstName: "Cata" });
  });
});
