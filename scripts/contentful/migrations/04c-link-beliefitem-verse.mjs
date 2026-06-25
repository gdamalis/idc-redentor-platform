// ICR-68 (T9) step 3 of 3: link each beliefItem.bibleVerse (now a Link) to its structured bibleVerse
// entry created in step 04 (internalName `<machineName>-verse`). Publishes the updated beliefItems.
// Idempotent: skips beliefItems already linked, and those with no matching `<machineName>-verse`
// entry (the 3 Value items have no verse). Usage: node .../04c-link-beliefitem-verse.mjs [--dry-run]
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
  console.log(`== 04c link beliefItem.bibleVerse -> structured entry in ${environmentId}${DRY ? " (DRY-RUN)" : ""} ==`);
  const verseByName = new Map(
    (await getAll("bibleVerse")).map((e) => [pick(e.fields.internalName), e.sys.id]),
  );

  for (const b of await getAll("beliefItem")) {
    const mn = pick(b.fields.machineName);
    const verseId = verseByName.get(`${mn}-verse`);
    const already = b.fields.bibleVerse && pick(b.fields.bibleVerse);
    if (!verseId) { console.log(`[none]  ${mn}: no structured verse (ok for Value items)`); continue; }
    if (already && already.sys && already.sys.id === verseId) { console.log(`[skip]  ${mn}: already linked`); continue; }
    console.log(`[link]  ${mn}.bibleVerse -> ${verseId}`);
    if (!DRY) {
      const fresh = await client.entry.get({ spaceId, environmentId, entryId: b.sys.id });
      fresh.fields.bibleVerse = { "es-AR": { sys: { type: "Link", linkType: "Entry", id: verseId } } };
      const updated = await client.entry.update({ spaceId, environmentId, entryId: b.sys.id }, fresh);
      await client.entry.publish({ spaceId, environmentId, entryId: b.sys.id }, updated);
    }
  }
  console.log(DRY ? "\nDRY-RUN complete — nothing written." : "\nDone.");
}

run().catch((e) => { console.error("ERR", e.message); process.exit(1); });
