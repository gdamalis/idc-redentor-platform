import type { PermissionKey } from "./permissions";

/**
 * Only the two fields this ticket's `people:pii` scope covers (spec §11 Q1) —
 * phone and email. The index signature is load-bearing, not decorative: it's
 * what keeps TypeScript's excess-property check from rejecting an object
 * literal call site (e.g. `omitPii({ id, firstName }, granted)`) — without
 * it, TS checks the literal against `PiiFields` itself before inferring `T`,
 * and any property other than `phone`/`email` would be "excess". Every real
 * caller passes a full DTO (a real `T`, not a fresh literal), so in practice
 * this only affects how literal argument shapes type-check in tests.
 */
export interface PiiFields {
  readonly phone?: unknown;
  readonly email?: unknown;
  readonly [key: string]: unknown;
}

/**
 * FIELD OMISSION, not masking: without `people:pii`, `phone`/`email` are
 * absent from the returned object entirely — never rewritten to `""` or
 * `null`. A masked-but-present field still tells a caller a value exists
 * (and its shape); an absent key tells them nothing. Never mutates `record`.
 *
 * **Scope note (spec §11 Q1):** this is the enforcement primitive and its
 * unit tests only — the People list/detail/print views that actually call
 * this on real DTOs ship in ICR-129. See `docs/architecture/admin-rbac.md`
 * § "The people:pii scope boundary".
 */
export function omitPii<T extends PiiFields>(
  record: T,
  granted: ReadonlySet<PermissionKey>,
): T | Omit<T, "phone" | "email"> {
  if (granted.has("people:pii")) return record;

  // A shallow copy, not the original — `record` is never mutated. `delete`
  // (rather than destructuring `phone`/`email` into unused bindings) sidesteps
  // an unused-variable lint warning for names that exist only to be dropped.
  // The local type drops `PiiFields`'s `readonly` on both — `delete` requires
  // an optional, mutable property (TS2704 on a readonly one).
  const rest: Omit<T, "phone" | "email"> & {
    phone?: unknown;
    email?: unknown;
  } = { ...record };
  delete rest.phone;
  delete rest.email;
  return rest;
}
