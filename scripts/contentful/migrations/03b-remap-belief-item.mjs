// ICR-67 (T7) step 2 of 3: CMA entry remap (contentful-migration can't create entries / repoint links).
// For each credo -> beliefItem(kind=Creed); each valueItem -> beliefItem(kind=Value), copying all
// fields verbatim across locales; publish. Then repoint contentCollection.contentItems (order
// preserved) from old ids -> new beliefItem ids. Then delete the old credo/valueItem entries.
//
// Idempotent: a beliefItem is matched/reused by machineName; collections already pointing at
// beliefItem ids are left unchanged; already-deleted old entries are simply absent.
// Usage:  node scripts/contentful/migrations/03b-remap-belief-item.mjs [--dry-run]
import { createClient } from "contentful-management";

const client = createClient(
  { accessToken: process.env.CONTENTFUL_MANAGEMENT_ACCESS_TOKEN },
  { type: "plain" },
);
const spaceId = process.env.CONTENTFUL_SPACE_ID;
const environmentId = process.env.CONTENTFUL_ENVIRONMENT ?? "staging";
const DRY = process.argv.includes("--dry-run");
if (environmentId === "master") {
  throw new Error("Refusing to run against the master alias.");
}

const COPY_FIELDS = ["internalName", "title", "description", "bibleVerse", "image", "machineName"];
const SOURCES = [["credo", "Creed"], ["valueItem", "Value"]];
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
  console.log(`== 03b remap credo/valueItem -> beliefItem in ${environmentId}${DRY ? " (DRY-RUN)" : ""} ==`);

  // 1. existing beliefItems (idempotency by machineName)
  const beliefByMachine = new Map(
    (await getAll("beliefItem")).map((e) => [pick(e.fields.machineName), e.sys.id]),
  );

  // 2. create (or reuse) a beliefItem per old entry; build oldId -> beliefId map
  const idMap = new Map();
  for (const [type, kind] of SOURCES) {
    for (const e of await getAll(type)) {
      const mn = pick(e.fields.machineName);
      if (beliefByMachine.has(mn)) {
        idMap.set(e.sys.id, beliefByMachine.get(mn));
        console.log(`[reuse]  ${mn} -> ${beliefByMachine.get(mn)}`);
        continue;
      }
      const fields = {};
      for (const f of COPY_FIELDS) if (e.fields[f] !== undefined) fields[f] = e.fields[f];
      fields.kind = { "es-AR": kind };
      if (DRY) {
        idMap.set(e.sys.id, `<new:${mn}>`);
        console.log(`[create] ${mn} (kind=${kind}) from ${type}:${e.sys.id}`);
      } else {
        const created = await client.entry.create(
          { spaceId, environmentId, contentTypeId: "beliefItem" },
          { fields },
        );
        await client.entry.publish(
          { spaceId, environmentId, entryId: created.sys.id }, created,
        );
        idMap.set(e.sys.id, created.sys.id);
        beliefByMachine.set(mn, created.sys.id);
        console.log(`[create] ${mn} (kind=${kind}) -> ${created.sys.id}`);
      }
    }
  }

  // 3. repoint contentCollection.contentItems (preserve order, all locales)
  for (const c of await getAll("contentCollection")) {
    const ci = c.fields.contentItems;
    if (!ci) continue;
    const newField = {};
    let changed = false;
    for (const [loc, arr] of Object.entries(ci)) {
      newField[loc] = (arr || []).map((link) => {
        const nid = idMap.get(link.sys.id) ?? link.sys.id;
        if (nid !== link.sys.id) changed = true;
        return { sys: { type: "Link", linkType: "Entry", id: nid } };
      });
    }
    const mn = pick(c.fields.machineName);
    if (!changed) { console.log(`[coll]   ${mn}: unchanged`); continue; }
    console.log(`[coll]   ${mn}: repoint -> [${pick(newField).map((l) => l.sys.id).join(", ")}]`);
    if (!DRY) {
      const fresh = await client.entry.get({ spaceId, environmentId, entryId: c.sys.id });
      fresh.fields.contentItems = newField;
      const updated = await client.entry.update({ spaceId, environmentId, entryId: c.sys.id }, fresh);
      await client.entry.publish({ spaceId, environmentId, entryId: c.sys.id }, updated);
    }
  }

  // 4. delete the old credo/valueItem entries (now unreferenced)
  for (const [type] of SOURCES) {
    for (const e of await getAll(type)) {
      console.log(`[delete] ${type}:${e.sys.id} (${pick(e.fields.machineName)})`);
      if (!DRY) {
        if (e.sys.publishedVersion) {
          await client.entry.unpublish({ spaceId, environmentId, entryId: e.sys.id });
        }
        await client.entry.delete({ spaceId, environmentId, entryId: e.sys.id });
      }
    }
  }

  console.log(DRY ? "\nDRY-RUN complete — nothing written." : "\nRemap complete.");
}

run().catch((e) => { console.error("ERR", e.message); process.exit(1); });
