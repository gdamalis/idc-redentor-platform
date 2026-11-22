#!/usr/bin/env node
/**
 * Read-only (GET-only CDA) exporter for the frozen published production rich-text
 * fixture corpus (`apps/web/lib/content/rich-text/__fixtures__/production-corpus.json`).
 *
 * SAFETY (public repo — ICR-202 Q1 Option A):
 * - Uses Contentful Delivery API (`cdn.contentful.com`) ONLY: never reads or writes
 *   unpublished drafts (CPA/CMA are never called).
 * - Never exports author email addresses or credentials.
 * - Scrubs every `mailto:` link URI and any email address in text nodes to
 *   `contacto@example.org` BEFORE writing disk, then asserts zero non-placeholder
 *   email addresses exist in the serialized JSON.
 *
 * Usage:
 *   node --env-file=apps/web/.env.local apps/web/scripts/contentful/export-rich-text-corpus.mjs
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PLACEHOLDER_EMAIL = "contacto@example.org";
const LOCALES = ["es-AR", "en-US"];

const RICH_TEXT_SPECS = [
  { contentType: "sermon", field: "content", profile: "sermon" },
  { contentType: "blogPostPage", field: "content", profile: "article" },
  { contentType: "churchInfoTopic", field: "body", profile: "article" },
  { contentType: "section", field: "body", profile: "inline" },
  { contentType: "beliefItem", field: "description", profile: "inline" },
  { contentType: "contentCollection", field: "description", profile: "inline" },
  { contentType: "contactForm", field: "agreementNote", profile: "inlineLink" },
];

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

function scrubEmailsInText(text) {
  return text.replace(EMAIL_RE, PLACEHOLDER_EMAIL);
}

function scrubRichTextNode(node) {
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(scrubRichTextNode);

  const clone = { ...node };

  if (clone.nodeType === "text" && typeof clone.value === "string") {
    clone.value = scrubEmailsInText(clone.value);
  }

  if (
    clone.nodeType === "hyperlink" &&
    clone.data &&
    typeof clone.data === "object" &&
    typeof clone.data.uri === "string"
  ) {
    const uri = clone.data.uri;
    if (uri.toLowerCase().startsWith("mailto:")) {
      clone.data = { ...clone.data, uri: `mailto:${PLACEHOLDER_EMAIL}` };
    }
  }

  if (Array.isArray(clone.content)) {
    clone.content = clone.content.map(scrubRichTextNode);
  }

  return clone;
}

function collectEmbeddedAssetIds(doc) {
  const ids = new Set();
  const stack = [doc];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    if (node.nodeType === "embedded-asset-block") {
      const id = node.data?.target?.sys?.id;
      if (typeof id === "string" && id.length > 0) ids.add(id);
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) stack.push(child);
    }
  }
  return [...ids].sort();
}

function localizedField(fields, key, locale) {
  const map = fields?.[key];
  if (!map || typeof map !== "object") return undefined;
  return map[locale] ?? map["es-AR"];
}

async function fetchAllPublished(spaceId, env, token, resource) {
  const items = [];
  let skip = 0;
  const limit = 200;
  let total = Infinity;

  while (skip < total) {
    const url = new URL(
      `https://cdn.contentful.com/spaces/${spaceId}/environments/${env}/${resource}`,
    );
    url.searchParams.set("locale", "*");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("skip", String(skip));
    if (resource === "entries") {
      url.searchParams.set("include", "0");
    }

    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(
        `Contentful CDA GET /${resource} failed with status ${res.status}`,
      );
    }
    const payload = await res.json();
    total = payload.total ?? 0;
    items.push(...(payload.items ?? []));
    skip += payload.items?.length ?? limit;
    if (!payload.items || payload.items.length === 0) break;
  }

  return items;
}

function mapAssetForLocale(asset, locale) {
  const file =
    asset.fields?.file?.[locale] ?? asset.fields?.file?.["es-AR"] ?? {};
  const rawUrl = typeof file.url === "string" ? file.url : "";
  const url = rawUrl.startsWith("//") ? `https:${rawUrl}` : rawUrl;
  const title =
    asset.fields?.title?.[locale] ?? asset.fields?.title?.["es-AR"] ?? "";
  return {
    id: asset.sys.id,
    url,
    title,
    contentType: file.contentType ?? "",
    fileName: file.fileName ?? "",
    size: file.details?.size ?? 0,
    ...(file.details?.image?.width !== undefined
      ? { width: file.details.image.width }
      : {}),
    ...(file.details?.image?.height !== undefined
      ? { height: file.details.image.height }
      : {}),
  };
}

function assertZeroUnscrubbedEmails(serializedJson) {
  const matches = serializedJson.match(EMAIL_RE) ?? [];
  const leaked = [...new Set(matches.filter((m) => m !== PLACEHOLDER_EMAIL))];
  if (leaked.length > 0) {
    throw new Error(
      `Refusing to write fixture: found ${leaked.length} non-placeholder email(s)`,
    );
  }
}

async function main() {
  const spaceId = process.env.CONTENTFUL_SPACE_ID;
  const token = process.env.CONTENTFUL_ACCESS_TOKEN;
  const env = process.env.CONTENTFUL_ENVIRONMENT ?? "master";

  if (!spaceId || !token) {
    throw new Error(
      "CONTENTFUL_SPACE_ID and CONTENTFUL_ACCESS_TOKEN (CDA read-only) are required",
    );
  }

  const [entries, assets] = await Promise.all([
    fetchAllPublished(spaceId, env, token, "entries"),
    fetchAllPublished(spaceId, env, token, "assets"),
  ]);

  const entriesById = new Map(entries.map((e) => [e.sys.id, e]));
  const assetsById = new Map(assets.map((a) => [a.sys.id, a]));

  const documents = [];
  const sermons = [];

  for (const spec of RICH_TEXT_SPECS) {
    const matching = entries
      .filter((e) => e.sys?.contentType?.sys?.id === spec.contentType)
      .sort((a, b) => a.sys.id.localeCompare(b.sys.id));

    for (const entry of matching) {
      const slugOrName =
        localizedField(entry.fields, "slug", "es-AR") ??
        localizedField(entry.fields, "internalName", "es-AR") ??
        localizedField(entry.fields, "name", "es-AR") ??
        localizedField(entry.fields, "title", "es-AR") ??
        entry.sys.id;

      const metaName =
        localizedField(entry.fields, "name", "es-AR") ??
        localizedField(entry.fields, "internalName", "es-AR") ??
        undefined;
      const layout = localizedField(entry.fields, "layout", "es-AR");

      for (const locale of LOCALES) {
        const rawDoc = entry.fields?.[spec.field]?.[locale];
        if (!rawDoc || rawDoc.nodeType !== "document") continue;

        const scrubbedDoc = scrubRichTextNode(rawDoc);
        const embeddedAssetIds = collectEmbeddedAssetIds(scrubbedDoc);
        const embeddedAssets = {};
        for (const assetId of embeddedAssetIds) {
          const asset = assetsById.get(assetId);
          if (asset) {
            embeddedAssets[assetId] = mapAssetForLocale(asset, locale);
          }
        }

        documents.push({
          id: `${spec.contentType}:${slugOrName}:${locale}`,
          entryId: entry.sys.id,
          contentType: spec.contentType,
          field: spec.field,
          profile: spec.profile,
          locale,
          ...(metaName ? { name: metaName } : {}),
          ...(layout ? { layout } : {}),
          document: scrubbedDoc,
          ...(embeddedAssetIds.length > 0 ? { embeddedAssets } : {}),
        });
      }

      if (spec.contentType === "sermon") {
        const preacherRef = entry.fields?.preacher?.["es-AR"]?.sys?.id;
        const preacherEntry = preacherRef
          ? entriesById.get(preacherRef)
          : undefined;
        const preacherName =
          localizedField(preacherEntry?.fields, "name", "es-AR") ?? "";

        const additionalRefs = entry.fields?.additionalPreachers?.["es-AR"] ?? [];
        const additionalPreacherNames = additionalRefs
          .map((ref) => entriesById.get(ref?.sys?.id))
          .map((e) => localizedField(e?.fields, "name", "es-AR"))
          .filter((name) => typeof name === "string" && name.length > 0);

        const scriptureRefs = entry.fields?.scriptureReferences?.["es-AR"] ?? [];
        const scriptureByLocale = { "es-AR": [], "en-US": [] };
        for (const ref of scriptureRefs) {
          const verseEntry = entriesById.get(ref?.sys?.id);
          if (!verseEntry) continue;
          const chapter = Number(
            localizedField(verseEntry.fields, "chapter", "es-AR") ?? 0,
          );
          const fromVerse = Number(
            localizedField(verseEntry.fields, "fromVerse", "es-AR") ?? 0,
          );
          const rawTo = localizedField(verseEntry.fields, "toVerse", "es-AR");
          const toVerse =
            rawTo !== undefined && rawTo !== null && String(rawTo).length > 0
              ? Number(rawTo)
              : null;

          for (const locale of LOCALES) {
            scriptureByLocale[locale].push({
              book: localizedField(verseEntry.fields, "book", locale) ?? "",
              chapter,
              fromVerse,
              toVerse,
              verseContent:
                localizedField(verseEntry.fields, "verseContent", locale) ?? "",
              bibleVersion:
                localizedField(verseEntry.fields, "bibleVersion", locale) ?? "",
            });
          }
        }

        const sermonLocales = {};
        for (const locale of LOCALES) {
          const rawContent = entry.fields?.content?.[locale];
          sermonLocales[locale] = {
            title: localizedField(entry.fields, "title", locale) ?? "",
            content: rawContent ? scrubRichTextNode(rawContent) : null,
            scriptureReferences: scriptureByLocale[locale],
          };
        }

        sermons.push({
          entryId: entry.sys.id,
          slug: localizedField(entry.fields, "slug", "es-AR") ?? entry.sys.id,
          sermonDate: localizedField(entry.fields, "sermonDate", "es-AR") ?? "",
          preacherName,
          additionalPreacherNames,
          locales: sermonLocales,
        });
      }
    }
  }

  documents.sort((a, b) => a.id.localeCompare(b.id));
  sermons.sort((a, b) => a.slug.localeCompare(b.slug));

  const output = {
    source: "contentful-cda-published-only",
    scrubPolicy: "mailto-placeholder",
    placeholderEmail: PLACEHOLDER_EMAIL,
    documentCount: documents.length,
    sermonCount: sermons.length,
    documents,
    sermons,
  };

  const serialized = `${JSON.stringify(output, null, 2)}\n`;
  assertZeroUnscrubbedEmails(serialized);

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const outPath = path.resolve(
    scriptDir,
    "../../lib/content/rich-text/__fixtures__/production-corpus.json",
  );
  writeFileSync(outPath, serialized, "utf8");
  console.log(
    `Exported ${documents.length} published rich-text documents and ${sermons.length} published sermons to ${outPath}`,
  );
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
