// ICR-71 (T12) step 2 of 3 (CMA): copy values into the new naming fields and republish.
//   - menuGroup: internalName <- internalTitle (3 entries)
//   - seo: internalName <- name (5 entries)
//   - navigationMenu: machineName = "main-menu" (1 entry; matches the getter lookup switch)
// Idempotent: skips entries whose target field is already set. Run after 08, before 08c.
// Usage: node scripts/contentful/migrations/08b-standardize-naming.mjs [--dry-run]
import { createClient } from "contentful-management";

const client = createClient(
  { accessToken: process.env.CONTENTFUL_MANAGEMENT_ACCESS_TOKEN },
  { type: "plain" },
);
const spaceId = process.env.CONTENTFUL_SPACE_ID;
const environmentId = process.env.CONTENTFUL_ENVIRONMENT ?? "agent-sandbox";
const DRY = process.argv.includes("--dry-run");
if (environmentId === "master") throw new Error("Refusing to run against the master alias.");

const pick = (o) => (o ? (o["es-AR"] ?? o["en-US"] ?? Object.values(o)[0]) : undefined);
const LOCALE = "es-AR";

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

// copy field `from` -> `to` (non-localized) for every entry of contentType, or set a literal value
async function fill(contentType, to, fromOrValue, isLiteral = false) {
  for (const e of await getAll(contentType)) {
    if (e.fields[to] && pick(e.fields[to])) {
      console.log(`[skip]   ${contentType}:${e.sys.id} ${to} already set (${pick(e.fields[to])})`);
      continue;
    }
    const value = isLiteral ? fromOrValue : pick(e.fields[fromOrValue]);
    if (value === undefined) {
      console.log(`[warn]   ${contentType}:${e.sys.id} no source value for ${to}`);
      continue;
    }
    console.log(`[set]    ${contentType}:${e.sys.id} ${to} = ${JSON.stringify(value)}`);
    if (!DRY) {
      const fresh = await client.entry.get({ spaceId, environmentId, entryId: e.sys.id });
      fresh.fields[to] = { [LOCALE]: value };
      const updated = await client.entry.update({ spaceId, environmentId, entryId: e.sys.id }, fresh);
      await client.entry.publish({ spaceId, environmentId, entryId: e.sys.id }, updated);
    }
  }
}

async function run() {
  console.log(`== 08b standardize naming values in ${environmentId}${DRY ? " (DRY-RUN)" : ""} ==`);
  await fill("menuGroup", "internalName", "internalTitle");
  await fill("seo", "internalName", "name");
  await fill("navigationMenu", "machineName", "main-menu", true);
  console.log(DRY ? "\nDRY-RUN complete — nothing written." : "\nDone.");
}

run().catch((e) => { console.error("ERR", e.message); process.exit(1); });
