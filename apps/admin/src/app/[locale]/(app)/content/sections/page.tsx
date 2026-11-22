import { renderFixedListPage } from "../shell-helpers";

export default async function SectionsListPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return renderFixedListPage({
    locale,
    collection: "sections",
    fixedType: "section",
    baseHref: "/content/sections",
    titleKey: "types.sections",
  });
}
