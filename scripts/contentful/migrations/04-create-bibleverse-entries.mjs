// ICR-68 (T9) step 1 of 3: parse each Creed beliefItem's FREEFORM bibleVerse (RichText flattened to
// `"<text>" (<Book> <chapter>:<from>[-<to>])`) into a STRUCTURED bibleVerse entry (the type already
// used by contactForm + sermons). Creates one bibleVerse entry per Creed beliefItem, internalName
// `<machineName>-verse`, both locales. Does NOT yet link it (the beliefItem.bibleVerse field is still
// RichText — 04b swaps it to a Link, 04c links). Idempotent: skips if `<machineName>-verse` exists.
// bibleVersion is not rendered on the Creed page; set to es=RVR1960 / en=NIV (church convention).
// Usage: node scripts/contentful/migrations/04-create-bibleverse-entries.mjs [--dry-run]
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
const QUOTES = /^[\s"“”«»']+|[\s"“”«»']+$/g;

// "<text>" (<Book> <chapter>:<from>[-<to>])  ->  { content, book, chapter, from, to }
function parseVerse(flat) {
  if (!flat) return null;
  const m = flat.trim().match(/^(.*)\(([^()]+?)\s+(\d+):(\d+)(?:[-–](\d+))?\)\s*$/s);
  if (!m) return null;
  return {
    content: m[1].replace(QUOTES, "").trim(),
    book: m[2].trim(),
    chapter: m[3],
    from: m[4],
    to: m[5] ?? null,
  };
}
function flatten(node) {
  if (!node) return "";
  if (node.nodeType === "text") return node.value || "";
  if (Array.isArray(node.content)) return node.content.map(flatten).join("");
  return "";
}

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
  console.log(`== 04 create structured bibleVerse entries in ${environmentId}${DRY ? " (DRY-RUN)" : ""} ==`);
  const existing = new Set((await getAll("bibleVerse")).map((e) => pick(e.fields.internalName)));
  const beliefs = (await getAll("beliefItem")).filter((e) => e.fields.bibleVerse);

  for (const b of beliefs) {
    const mn = pick(b.fields.machineName);
    const internalName = `${mn}-verse`;
    const es = parseVerse(flatten(b.fields.bibleVerse["es-AR"]));
    const en = parseVerse(flatten(b.fields.bibleVerse["en-US"]));
    if (!es || !en) {
      console.log(`[WARN] could not parse verse for ${mn}: es=${!!es} en=${!!en}`);
      continue;
    }
    if (es.chapter !== en.chapter || es.from !== en.from || (es.to ?? "") !== (en.to ?? "")) {
      console.log(`[WARN] es/en reference numbers differ for ${mn}: ${JSON.stringify(es)} vs ${JSON.stringify(en)}`);
    }
    const fields = {
      internalName: { "es-AR": internalName },
      book: { "es-AR": es.book, "en-US": en.book },
      chapter: { "es-AR": es.chapter },
      fromVerse: { "es-AR": es.from },
      ...(es.to ? { toVerse: { "es-AR": es.to } } : {}),
      verseContent: { "es-AR": es.content, "en-US": en.content },
      bibleVersion: { "es-AR": "RVR1960", "en-US": "NIV" },
    };
    console.log(`\n[${existing.has(internalName) ? "skip" : "create"}] ${internalName}`);
    console.log(`   ref: ${es.book}/${en.book} ${es.chapter}:${es.from}${es.to ? "-" + es.to : ""}`);
    console.log(`   es: "${es.content.slice(0, 70)}..."`);
    console.log(`   en: "${en.content.slice(0, 70)}..."`);
    if (!DRY && !existing.has(internalName)) {
      const created = await client.entry.create(
        { spaceId, environmentId, contentTypeId: "bibleVerse" }, { fields },
      );
      await client.entry.publish({ spaceId, environmentId, entryId: created.sys.id }, created);
      console.log(`   -> created ${created.sys.id}`);
    }
  }
  console.log(DRY ? "\nDRY-RUN complete — nothing written." : "\nDone.");
}

run().catch((e) => { console.error("ERR", e.message); process.exit(1); });
