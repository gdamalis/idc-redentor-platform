export function normalizeEmail(value?: string | null): string {
  return (value ?? "").trim().toLowerCase();
}
