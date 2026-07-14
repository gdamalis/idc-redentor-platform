// ICR-146 (13b): backfill `sermon.audioLanguages` + `sermon.interpreter`, and remove the
// now-redundant hand-written interpreter blockquote from the 2026-07-12 sermon (prose -> data).
//
// SAFETY INVARIANTS (all four matter):
//  1. Refuses the `master` ALIAS by name. Write the concrete env (staging | production), never the
//     alias — the alias is repointed by humans at cutover.
//  2. PUBLISH-SAFE. Republishes ONLY entries that were ALREADY published; NEVER publishes a draft.
//     Publishing a draft here would ship unreviewed content to the live site — including the
//     2026-07-12 sermon, which is deliberately awaiting human review. And a draft-only update does
//     NOT change an entry's published version, so an already-published entry MUST be republished or
//     the CDA keeps serving the old data.
//  3. IDEMPOTENT. Skips entries that already carry a non-empty `audioLanguages`; skips a blockquote
//     that is already gone. Safe to re-run.
//  4. CONTENT-MATCHED node removal. The interpreter note is found by matching its TEXT, never by
//     index — an index-based delete would silently destroy a legitimate closing blockquote if the
//     entry is edited before cutover.
//
// Every sermon is enumerated (not a hardcoded id list) so a sermon published between now and cutover
// still gets its default. Only the known bilingual sermon deviates from the ["es-AR"] default.
//
// Usage:
//   node scripts/contentful/migrations/13b-backfill-sermon-audio.mjs --dry-run
//   CONTENTFUL_ENVIRONMENT=production node scripts/contentful/migrations/13b-backfill-sermon-audio.mjs
import { createClient } from "contentful-management";

const client = createClient(
  { accessToken: process.env.CONTENTFUL_MANAGEMENT_ACCESS_TOKEN },
  { type: "plain" },
);

const spaceId = process.env.CONTENTFUL_SPACE_ID;
const environmentId = process.env.CONTENTFUL_ENVIRONMENT ?? "staging";
const DRY = process.argv.includes("--dry-run");

if (environmentId === "master" || environmentId.startsWith("master-")) {
  throw new Error(
    "Refusing to run against the `master` alias. Target the concrete environment (staging | production).",
  );
}

/** Contentful stores NON-LOCALIZED field values under the default-locale key. */
const DEFAULT_LOCALE = "es-AR";
const SPANISH_ONLY = ["es-AR"];
const BILINGUAL = ["es-AR", "en-US"];

/** 2026-07-12 — Doug Wagner preached in English; Jonathan Hanegan interpreted live into Spanish. */
const BILINGUAL_SERMON_ID = "4Tp4Qg3SGEIEIJn09w5OjW";
const INTERPRETER_AUTHOR_ID = "32VynQChlpA00VsRMtNGJu"; // Jonathan Hanegan (author entry)

/**
 * True for the hand-written interpreter note that this migration replaces with data.
 * Requires BOTH the interpreter's name AND interpretation wording, so an unrelated
 * closing blockquote can never match.
 */
function isInterpreterNote(node) {
  if (node?.nodeType !== "blockquote") return false;
  const text = JSON.stringify(node);
  return text.includes("Jonathan Hanegan") && /interpret/i.test(text);
}

/** Removes the trailing interpreter note from a rich-text document, if present. */
function stripInterpreterNote(doc) {
  if (!doc?.content?.length) return { doc, removed: false };
  const last = doc.content[doc.content.length - 1];
  if (!isInterpreterNote(last)) return { doc, removed: false };
  return { doc: { ...doc, content: doc.content.slice(0, -1) }, removed: true };
}

async function getAllSermons() {
  const out = [];
  let skip = 0;
  for (;;) {
    const page = await client.entry.getMany({
      spaceId,
      environmentId,
      query: { content_type: "sermon", limit: 100, skip },
    });
    out.push(...page.items);
    if (skip + 100 >= page.total) break;
    skip += 100;
  }
  return out;
}

async function run() {
  console.log(
    `== 13b backfill sermon audioLanguages/interpreter in "${environmentId}"${DRY ? " (DRY-RUN — nothing will be written)" : ""} ==`,
  );

  const sermons = await getAllSermons();
  console.log(`Found ${sermons.length} sermon entries.\n`);

  let changed = 0;
  let republished = 0;
  let skipped = 0;

  for (const entry of sermons) {
    const id = entry.sys.id;
    const slug = entry.fields.slug?.[DEFAULT_LOCALE] ?? "(no slug)";
    // Capture BEFORE any update: entry.update() bumps sys.version but leaves
    // publishedVersion alone, so this stays a correct "was it live?" answer.
    const wasPublished = entry.sys.publishedVersion != null;
    const isBilingual = id === BILINGUAL_SERMON_ID;

    const existing = entry.fields.audioLanguages?.[DEFAULT_LOCALE];
    const hasAudioLanguages = Array.isArray(existing) && existing.length > 0;

    const fields = { ...entry.fields };
    const actions = [];

    if (!hasAudioLanguages) {
      fields.audioLanguages = {
        [DEFAULT_LOCALE]: isBilingual ? BILINGUAL : SPANISH_ONLY,
      };
      actions.push(
        `audioLanguages = [${fields.audioLanguages[DEFAULT_LOCALE].join(", ")}]`,
      );
    }

    if (isBilingual && !entry.fields.interpreter?.[DEFAULT_LOCALE]) {
      fields.interpreter = {
        [DEFAULT_LOCALE]: {
          sys: { type: "Link", linkType: "Entry", id: INTERPRETER_AUTHOR_ID },
        },
      };
      actions.push("interpreter = Jonathan Hanegan");
    }

    if (isBilingual && entry.fields.content) {
      const nextContent = {};
      let removedAny = false;
      for (const [locale, doc] of Object.entries(entry.fields.content)) {
        const { doc: stripped, removed } = stripInterpreterNote(doc);
        nextContent[locale] = stripped;
        if (removed) removedAny = true;
      }
      if (removedAny) {
        fields.content = nextContent;
        actions.push(
          "removed the interpreter blockquote (now expressed as data)",
        );
      }
    }

    if (actions.length === 0) {
      skipped++;
      console.log(`  – ${slug} (${id}): already backfilled, skipping`);
      continue;
    }

    console.log(`  ${DRY ? "WOULD UPDATE" : "UPDATING"} ${slug} (${id})`);
    for (const action of actions) console.log(`      · ${action}`);
    console.log(
      wasPublished
        ? `      · published entry → WILL REPUBLISH`
        : `      · draft entry → leaving as a DRAFT (never published by this script)`,
    );

    if (DRY) {
      changed++;
      if (wasPublished) republished++;
      continue;
    }

    const updated = await client.entry.update(
      { spaceId, environmentId, entryId: id },
      { ...entry, fields },
    );
    changed++;

    if (wasPublished) {
      await client.entry.publish(
        { spaceId, environmentId, entryId: id },
        updated,
      );
      republished++;
    }
  }

  console.log(
    `\n${DRY ? "PLAN" : "DONE"}: ${changed} updated, ${republished} republished, ${skipped} already done.`,
  );
  if (!DRY && republished > 0) {
    console.log(
      "Remember: POST /api/revalidate to flush the `site-content` cache tag.",
    );
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
