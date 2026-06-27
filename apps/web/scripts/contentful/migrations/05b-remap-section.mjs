// ICR-75 (T8) step 2 of 3: CMA remap of the 4 promo entries into `section` entries with a `layout`.
// Same machineName preserved (getters look up by machineName), all field values copied verbatim across
// locales, then the old component entries are deleted. Idempotent: a section is matched/reused by
// machineName. None of the 4 entries are referenced by other entries, so no link repointing is needed.
// Usage: node scripts/contentful/migrations/05b-remap-section.mjs [--dry-run]
import { createClient } from "contentful-management";

const client = createClient(
  { accessToken: process.env.CONTENTFUL_MANAGEMENT_ACCESS_TOKEN },
  { type: "plain" },
);
const spaceId = process.env.CONTENTFUL_SPACE_ID;
const environmentId = process.env.CONTENTFUL_ENVIRONMENT ?? "agent-sandbox";
const DRY = process.argv.includes("--dry-run");
if (environmentId === "master") throw new Error("Refusing to run against the master alias.");

// sourceType -> { layout, fieldMap: { sourceField: sectionField } }  (internalName + machineName always copied)
const MAP = {
  componentHeroBanner: {
    layout: "hero",
    fieldMap: { headline: "headline", subHeadline: "subHeadline", bodyText: "body", ctaText: "ctaText", targetPage: "targetPage", image: "image" },
  },
  componentCta: {
    layout: "cta",
    fieldMap: { headline: "headline", subline: "body", ctaText: "ctaText", targetPage: "targetPage", urlParameters: "urlParameters" },
  },
  componentTextBlock: {
    layout: "textBlock",
    fieldMap: { headline: "headline", subtitle: "subHeadline", body: "body", images: "images" },
  },
};
const pick = (o) => (o ? (o["es-AR"] ?? o["en-US"] ?? Object.values(o)[0]) : undefined);

async function getAll(contentType) {
  const out = [];
  let skip = 0;
  for (;;) {
    const r = await client.entry.getMany({
      spaceId, environmentId,
      query: { content_type: contentType, limit: 100, skip },
    });
    out.push(...r.items);
    if (skip + 100 >= r.total) break;
    skip += 100;
  }
  return out;
}

async function run() {
  console.log(`== 05b remap promo blocks -> section in ${environmentId}${DRY ? " (DRY-RUN)" : ""} ==`);
  const sectionByMachine = new Set((await getAll("section")).map((e) => pick(e.fields.machineName)));

  for (const [sourceType, cfg] of Object.entries(MAP)) {
    for (const e of await getAll(sourceType)) {
      const mn = pick(e.fields.machineName);
      const fields = { layout: { "es-AR": cfg.layout } };
      if (e.fields.internalName) fields.internalName = e.fields.internalName;
      if (e.fields.machineName) fields.machineName = e.fields.machineName;
      const mapped = [];
      for (const [src, dst] of Object.entries(cfg.fieldMap)) {
        if (e.fields[src] !== undefined) { fields[dst] = e.fields[src]; mapped.push(`${src}->${dst}`); }
      }
      if (sectionByMachine.has(mn)) {
        console.log(`[reuse]  ${mn} (section exists)`);
      } else {
        console.log(`[create] section ${mn} layout=${cfg.layout} {${mapped.join(", ")}}`);
        if (!DRY) {
          const created = await client.entry.create(
            { spaceId, environmentId, contentTypeId: "section" }, { fields },
          );
          await client.entry.publish({ spaceId, environmentId, entryId: created.sys.id }, created);
          sectionByMachine.add(mn);
          console.log(`         -> ${created.sys.id}`);
        }
      }
      // delete the old component entry
      console.log(`[delete] ${sourceType}:${e.sys.id} (${mn})`);
      if (!DRY) {
        if (e.sys.publishedVersion) await client.entry.unpublish({ spaceId, environmentId, entryId: e.sys.id });
        await client.entry.delete({ spaceId, environmentId, entryId: e.sys.id });
      }
    }
  }
  console.log(DRY ? "\nDRY-RUN complete — nothing written." : "\nDone.");
}

run().catch((e) => { console.error("ERR", e.message); process.exit(1); });
