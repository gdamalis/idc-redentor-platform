import { buildPageMetadata } from "@lib/metadata";
import { Metadata } from "next";

export async function generateMetadata({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({
    machineName: "seo-who-is-jesus",
    locale,
    path: "who-is-jesus",
  });
}

export default function WhoIsJesusPage() {
  return (
    <div>WhoIsJesusPage</div>
  )
}
