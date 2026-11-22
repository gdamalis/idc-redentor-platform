import { renderFixedListPage } from "../shell-helpers";

export default async function SeoListPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return renderFixedListPage({
    locale,
    collection: "seo_entries",
    fixedType: "seoEntry",
    baseHref: "/content/seo",
    titleKey: "types.seo",
  });
}
