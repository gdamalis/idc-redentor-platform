import { draftMode } from "next/headers";

export async function GET() {
  const draftModeCall = await draftMode();
  draftModeCall.disable();
  
  return new Response("Draft mode is disabled");
}
