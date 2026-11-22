import { renderFixedListPage } from "../shell-helpers";

export default async function BeliefCollectionsListPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return renderFixedListPage({
    locale,
    collection: "belief_collections",
    fixedType: "beliefCollection",
    baseHref: "/content/belief-collections",
    titleKey: "types.beliefCollections",
  });
}
