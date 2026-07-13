"use client";

// TEMPORARY (ICR-117): proves a browser-side error reaches Sentry through the
// /monitoring tunnel. Removed before merge — see the plan's Task 5.
export default function SentryExamplePage() {
  return (
    <main style={{ padding: "4rem", display: "grid", gap: "1rem" }}>
      <h1>ICR-117 Sentry verification</h1>
      <button
        type="button"
        onClick={() => {
          throw new Error(
            "ICR-117 Sentry verification: deliberate client error",
          );
        }}
      >
        Throw client error
      </button>
    </main>
  );
}
