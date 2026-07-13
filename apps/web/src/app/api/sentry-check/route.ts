// TEMPORARY (ICR-117): proves a server-side error reaches Sentry from the Vercel
// preview. Removed before merge — see the plan's Task 5.
export const dynamic = "force-dynamic";

export async function GET() {
  throw new Error("ICR-117 Sentry verification: deliberate server error");
}
