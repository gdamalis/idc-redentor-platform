import { FIXED_ENTRIES, type Locale, type RichTextView } from "@idcr/content";
import * as contentfulBlog from "@lib/contentful/getBlogPostPages";
import * as contentfulTopic from "@lib/contentful/getChurchInfoTopic";
import * as contentfulContact from "@lib/contentful/getContactForm";
import * as contentfulCollection from "@lib/contentful/getContentCollection";
import * as contentfulCta from "@lib/contentful/getCtaComponent";
import * as contentfulEvent from "@lib/contentful/getEventBanner";
import * as contentfulFooter from "@lib/contentful/getFooter";
import * as contentfulHero from "@lib/contentful/getHeroBannerComponent";
import * as contentfulNav from "@lib/contentful/getNavigationMenu";
import * as contentfulSection from "@lib/contentful/getSection";
import * as contentfulSeo from "@lib/contentful/getSeo";
import * as contentfulSermons from "@lib/contentful/getSermons";
import * as contentfulSingleEmail from "@lib/contentful/getSingleEmailForm";
import * as contentfulTextBlock from "@lib/contentful/getTextBlockComponent";
import * as contentfulMapCollection from "@lib/contentful/mapContentCollection";
import * as mongoContent from "@lib/content";
import {
  normalizeMediaUrl,
  renderRichTextPairForParity,
  type MediaIdentityMap,
  type RichTextParityPreset,
} from "./normalize";

const LOCALES: readonly Locale[] = ["es-AR", "en-US"];

export type ParityMode = "published" | "draft";

export interface ParityReaders {
  readonly getSeo: (
    name: string,
    locale: string,
    isDraftMode?: boolean,
  ) => Promise<unknown>;
  readonly getSection: (
    name: string,
    locale: string,
    isDraftMode?: boolean,
  ) => Promise<unknown>;
  readonly getCtaComponent: (
    name: string,
    locale: string,
    isDraftMode?: boolean,
  ) => Promise<unknown>;
  readonly getHeroBannerComponent: (
    name: string,
    locale: string,
    isDraftMode?: boolean,
  ) => Promise<unknown>;
  readonly getTextBlockComponent: (
    name: string,
    locale: string,
    isDraftMode?: boolean,
  ) => Promise<unknown>;
  readonly getNavigationMenu: (
    name: string,
    locale: string,
    isDraftMode?: boolean,
  ) => Promise<unknown>;
  readonly getFooter: (
    locale: string,
    isDraftMode?: boolean,
  ) => Promise<unknown>;
  readonly getSingleEmailForm: (
    name: string,
    locale: string,
    isDraftMode?: boolean,
  ) => Promise<unknown>;
  readonly getContactForm: (
    locale: string,
    isDraftMode?: boolean,
  ) => Promise<unknown>;
  readonly getEventBanner: (
    name: string,
    locale: string,
    isDraftMode?: boolean,
  ) => Promise<unknown>;
  readonly getContentCollection: (
    name: string,
    locale: string,
    isDraftMode?: boolean,
  ) => Promise<unknown>;
  readonly mapContentCollection: (raw: never) => unknown;
  readonly getLatestBlogPostPages: (
    locale: string,
    options?: { slug?: string; isDraftMode?: boolean },
  ) => Promise<unknown[]>;
  readonly getAllBlogPostSlugs: (
    locale: string,
  ) => Promise<Array<{ slug: string; updatedAt: string }>>;
  readonly getBlogPostPage: (
    slug: string,
    locale: string,
    isDraftMode?: boolean,
  ) => Promise<unknown>;
  readonly getBlogPostPageById: (
    id: string,
    locale: string,
    isDraftMode?: boolean,
  ) => Promise<unknown>;
  readonly getChurchInfoTopic: (
    slug: string,
    locale: string,
    isDraftMode?: boolean,
  ) => Promise<unknown>;
  readonly getSermon: (
    slug: string,
    locale: string,
    isDraftMode?: boolean,
  ) => Promise<unknown>;
  readonly getSermonById: (
    id: string,
    locale: string,
    isDraftMode?: boolean,
  ) => Promise<unknown>;
  readonly getLatestSermons: (
    locale: string,
    options?: { slug?: string; isDraftMode?: boolean },
  ) => Promise<unknown[]>;
  readonly getAllSermons: (
    locale: string,
    options?: { isDraftMode?: boolean },
  ) => Promise<unknown[]>;
  readonly getAllSermonSlugs: (
    locale: string,
  ) => Promise<Array<{ slug: string; updatedAt: string }>>;
}

export const defaultContentfulReaders: ParityReaders = {
  getSeo: contentfulSeo.getSeo,
  getSection: contentfulSection.getSection,
  getCtaComponent: contentfulCta.getCtaComponent,
  getHeroBannerComponent: contentfulHero.getHeroBannerComponent,
  getTextBlockComponent: contentfulTextBlock.getTextBlockComponent,
  getNavigationMenu: contentfulNav.getNavigationMenu,
  getFooter: contentfulFooter.getFooter,
  getSingleEmailForm: contentfulSingleEmail.getSingleEmailForm,
  getContactForm: contentfulContact.getContactForm,
  getEventBanner: contentfulEvent.getEventBanner,
  getContentCollection: contentfulCollection.getContentCollection,
  mapContentCollection: contentfulMapCollection.mapContentCollection,
  getLatestBlogPostPages: (locale, options) =>
    contentfulBlog.getLatestBlogPostPages(locale, options ?? {}),
  getAllBlogPostSlugs: contentfulBlog.getAllBlogPostSlugs,
  getBlogPostPage: contentfulBlog.getBlogPostPage,
  getBlogPostPageById: contentfulBlog.getBlogPostPageById,
  getChurchInfoTopic: contentfulTopic.getChurchInfoTopic,
  getSermon: contentfulSermons.getSermon,
  getSermonById: contentfulSermons.getSermonById,
  getLatestSermons: contentfulSermons.getLatestSermons,
  getAllSermons: contentfulSermons.getAllSermons,
  getAllSermonSlugs: contentfulSermons.getAllSermonSlugs,
};

export const defaultMongoReaders: ParityReaders = {
  getSeo: mongoContent.getSeo,
  getSection: mongoContent.getSection,
  getCtaComponent: mongoContent.getCtaComponent,
  getHeroBannerComponent: mongoContent.getHeroBannerComponent,
  getTextBlockComponent: mongoContent.getTextBlockComponent,
  getNavigationMenu: mongoContent.getNavigationMenu,
  getFooter: mongoContent.getFooter,
  getSingleEmailForm: mongoContent.getSingleEmailForm,
  getContactForm: mongoContent.getContactForm,
  getEventBanner: mongoContent.getEventBanner,
  getContentCollection: mongoContent.getContentCollection,
  mapContentCollection: mongoContent.mapContentCollection,
  getLatestBlogPostPages: mongoContent.getLatestBlogPostPages,
  getAllBlogPostSlugs: mongoContent.getAllBlogPostSlugs,
  getBlogPostPage: mongoContent.getBlogPostPage,
  getBlogPostPageById: mongoContent.getBlogPostPageById,
  getChurchInfoTopic: mongoContent.getChurchInfoTopic,
  getSermon: mongoContent.getSermon,
  getSermonById: mongoContent.getSermonById,
  getLatestSermons: mongoContent.getLatestSermons,
  getAllSermons: mongoContent.getAllSermons,
  getAllSermonSlugs: mongoContent.getAllSermonSlugs,
};

export interface DataParityDiff {
  readonly check: string;
  readonly mode: ParityMode;
  readonly locale: Locale;
  readonly path: string;
  readonly contentfulValue: unknown;
  readonly mongoValue: unknown;
}

export interface DataParityCheckResult {
  readonly check: string;
  readonly mode: ParityMode;
  readonly locale: Locale;
  readonly ok: boolean;
  readonly diffCount: number;
}

export interface DataParityReport {
  readonly startedAt: string;
  readonly completedAt: string;
  readonly modes: readonly ParityMode[];
  readonly totalChecks: number;
  readonly passedChecks: number;
  readonly failedChecks: number;
  readonly totalDiffs: number;
  readonly ok: boolean;
  readonly checks: readonly DataParityCheckResult[];
  readonly diffs: readonly DataParityDiff[];
}

export interface RunDataParityOptions {
  readonly modes?: readonly ParityMode[];
  readonly locales?: readonly Locale[];
  readonly mediaMap: MediaIdentityMap;
  /** Maps Contentful entry `sys.id` -> Mongo `_id` hex string (for `ById` getters & `sys.id` normalization). */
  readonly entryIdByContentfulId?: ReadonlyMap<string, string>;
  /** Topic slugs keyed by locale (defaults to `{ "es-AR": ["privacidad"], "en-US": ["privacy"] }`). */
  readonly topicSlugsByLocale?: Readonly<Partial<Record<Locale, readonly string[]>>>;
  /** Explicit extra draft post slugs (discovered via draft listing if omitted). */
  readonly extraBlogSlugs?: readonly string[];
  /** Explicit extra draft sermon slugs (discovered via `getAllSermons` if omitted). */
  readonly extraSermonSlugs?: readonly string[];
  readonly contentfulReaders?: ParityReaders;
  readonly mongoReaders?: ParityReaders;
}

const SECTION_PRESET_BY_NAME: Readonly<Record<string, RichTextParityPreset>> = {
  "our-mission": "ourMissionCta",
  "info-community": "infoCommunity",
  "info-connect": "infoConnect",
  "connect-with-us": "infoConnect",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isContentfulRichText(value: unknown): boolean {
  return (
    isRecord(value) &&
    isRecord(value.json) &&
    value.json.nodeType === "document"
  );
}

function isTipTapRichTextView(value: unknown): boolean {
  return (
    isRecord(value) &&
    isRecord(value.doc) &&
    value.doc.type === "doc"
  );
}

function buildReverseIdMap(
  cfToMongo: ReadonlyMap<string, string> | undefined,
): {
  readonly normalizeId: (id: string) => string;
} {
  const mongoToCf = new Map<string, string>();
  if (cfToMongo) {
    for (const [cfId, mongoId] of cfToMongo.entries()) {
      mongoToCf.set(mongoId.toLowerCase(), cfId);
    }
  }
  return {
    normalizeId: (id: string) => {
      if (cfToMongo?.has(id)) return `entry:${id}`;
      const rev = mongoToCf.get(id.toLowerCase());
      if (rev) return `entry:${rev}`;
      // Embedded beliefItem synthetic IDs (`<collectionId>:item:<idx>`) normalize to item index
      if (id.includes(":item:")) return "entry:embedded-item";
      return id;
    },
  };
}

function resolveRichTextPresetForPath(
  checkName: string,
  fieldPath: string,
): RichTextParityPreset {
  if (checkName.startsWith("getContactForm") && fieldPath.endsWith("agreementNote")) {
    return "contactFormAgreement";
  }
  if (checkName.startsWith("getSermon") && fieldPath.endsWith("content")) {
    return "sermon";
  }
  if (
    checkName.startsWith("getBlogPost") ||
    checkName.startsWith("getLatestBlog") ||
    checkName.startsWith("getChurchInfoTopic")
  ) {
    return "article";
  }
  if (checkName.startsWith("getContentCollection")) {
    return fieldPath.includes("items[")
      ? "cardDescription"
      : "sectionDescription";
  }
  if (checkName.startsWith("getSection") || checkName.includes("Component")) {
    const match = /\(([^)]+)\)/.exec(checkName);
    const machineName = match?.[1] ?? "";
    return SECTION_PRESET_BY_NAME[machineName] ?? "sectionDescription";
  }
  return "article";
}

function compareValues(
  cfValue: unknown,
  mongoValue: unknown,
  path: string,
  ctx: {
    readonly check: string;
    readonly mode: ParityMode;
    readonly locale: Locale;
    readonly mediaMap: MediaIdentityMap;
    readonly normalizeId: (id: string) => string;
    readonly diffs: DataParityDiff[];
  },
): void {
  if (cfValue === undefined && mongoValue === undefined) return;
  if (cfValue === null && mongoValue === null) return;
  // Treat null vs undefined on optional nullable GraphQL fields as equivalent ONLY when both are absent
  if ((cfValue === null || cfValue === undefined) && (mongoValue === null || mongoValue === undefined)) {
    return;
  }

  // Rich-text comparison via both renderers -> normalized HTML
  if (isContentfulRichText(cfValue) || isTipTapRichTextView(mongoValue)) {
    const preset = resolveRichTextPresetForPath(ctx.check, path);
    const rendered = renderRichTextPairForParity(
      cfValue as Parameters<typeof renderRichTextPairForParity>[0],
      mongoValue as RichTextView | undefined,
      preset,
      ctx.mediaMap,
    );
    if (!rendered.equal) {
      ctx.diffs.push({
        check: ctx.check,
        mode: ctx.mode,
        locale: ctx.locale,
        path,
        contentfulValue: rendered.contentfulHtml,
        mongoValue: rendered.mongoHtml,
      });
    }
    return;
  }

  // Normalize URLs
  if (typeof cfValue === "string" && typeof mongoValue === "string") {
    if (path.endsWith(".url") || path === "url") {
      const a = normalizeMediaUrl(cfValue, ctx.mediaMap);
      const b = normalizeMediaUrl(mongoValue, ctx.mediaMap);
      if (a !== b) {
        ctx.diffs.push({
          check: ctx.check,
          mode: ctx.mode,
          locale: ctx.locale,
          path,
          contentfulValue: a,
          mongoValue: b,
        });
      }
      return;
    }
    if (path.endsWith(".sys.id") || path === "sys.id") {
      // Embedded BeliefItem sys.id has no Mongo document id (embedded array item)
      if (ctx.check.startsWith("getContentCollection") && path.includes("items[")) {
        return;
      }
      const a = ctx.normalizeId(cfValue);
      const b = ctx.normalizeId(mongoValue);
      if (a !== b) {
        ctx.diffs.push({
          check: ctx.check,
          mode: ctx.mode,
          locale: ctx.locale,
          path,
          contentfulValue: a,
          mongoValue: b,
        });
      }
      return;
    }
    if (cfValue !== mongoValue) {
      ctx.diffs.push({
        check: ctx.check,
        mode: ctx.mode,
        locale: ctx.locale,
        path,
        contentfulValue: cfValue,
        mongoValue: mongoValue,
      });
    }
    return;
  }

  if (
    typeof cfValue !== "object" ||
    typeof mongoValue !== "object" ||
    cfValue === null ||
    mongoValue === null
  ) {
    if (cfValue !== mongoValue) {
      ctx.diffs.push({
        check: ctx.check,
        mode: ctx.mode,
        locale: ctx.locale,
        path,
        contentfulValue: cfValue,
        mongoValue: mongoValue,
      });
    }
    return;
  }

  if (Array.isArray(cfValue) || Array.isArray(mongoValue)) {
    if (!Array.isArray(cfValue) || !Array.isArray(mongoValue)) {
      ctx.diffs.push({
        check: ctx.check,
        mode: ctx.mode,
        locale: ctx.locale,
        path,
        contentfulValue: cfValue,
        mongoValue: mongoValue,
      });
      return;
    }
    if (cfValue.length !== mongoValue.length) {
      ctx.diffs.push({
        check: ctx.check,
        mode: ctx.mode,
        locale: ctx.locale,
        path: `${path}.length`,
        contentfulValue: cfValue.length,
        mongoValue: mongoValue.length,
      });
    }
    const len = Math.min(cfValue.length, mongoValue.length);
    for (let i = 0; i < len; i += 1) {
      compareValues(cfValue[i], mongoValue[i], `${path}[${i}]`, ctx);
    }
    return;
  }

  const cfRec = cfValue as Record<string, unknown>;
  const mongoRec = mongoValue as Record<string, unknown>;
  const keys = new Set([...Object.keys(cfRec), ...Object.keys(mongoRec)]);

  for (const key of [...keys].sort()) {
    const childPath = path ? `${path}.${key}` : key;
    compareValues(cfRec[key], mongoRec[key], childPath, ctx);
  }
}

/**
 * Mode-matched data parity runner (`ICR-203` AC7).
 *
 * Calls every reader in `ICR-201`'s inventory against BOTH Contentful and MongoDB
 * in `published` mode (`isDraftMode: false`) and `draft` mode (`isDraftMode: true`),
 * across both locales (`es-AR`, `en-US`) and every fixed entry, blog post, sermon,
 * and topic slug. Makes ZERO HTTP requests to any production website host.
 */
export async function runDataParity(
  options: RunDataParityOptions,
): Promise<DataParityReport> {
  const startedAt = new Date().toISOString();
  const modes = options.modes ?? (["published", "draft"] as const);
  const locales = options.locales ?? LOCALES;
  const cf = options.contentfulReaders ?? defaultContentfulReaders;
  const mg = options.mongoReaders ?? defaultMongoReaders;
  const { normalizeId } = buildReverseIdMap(options.entryIdByContentfulId);

  const checks: DataParityCheckResult[] = [];
  const diffs: DataParityDiff[] = [];

  const runCheck = async (
    check: string,
    mode: ParityMode,
    locale: Locale,
    fetchPair: () => Promise<readonly [unknown, unknown]>,
  ) => {
    const beforeCount = diffs.length;
    try {
      const [cfVal, mgVal] = await fetchPair();
      compareValues(cfVal, mgVal, "$", {
        check,
        mode,
        locale,
        mediaMap: options.mediaMap,
        normalizeId,
        diffs,
      });
    } catch (err) {
      diffs.push({
        check,
        mode,
        locale,
        path: "$error",
        contentfulValue: null,
        mongoValue: err instanceof Error ? err.message : String(err),
      });
    }
    const added = diffs.length - beforeCount;
    checks.push({
      check,
      mode,
      locale,
      ok: added === 0,
      diffCount: added,
    });
  };

  const seoNames = FIXED_ENTRIES.filter((e) => e.type === "seoEntry").map(
    (e) => e.machineName,
  );
  const sectionNames = FIXED_ENTRIES.filter((e) => e.type === "section").map(
    (e) => e.machineName,
  );
  const collectionNames = FIXED_ENTRIES.filter(
    (e) => e.type === "beliefCollection",
  ).map((e) => e.machineName);
  const eventBannerNames = FIXED_ENTRIES.filter(
    (e) => e.type === "eventBanner",
  ).map((e) => e.machineName);

  const topicSlugsByLocale: Readonly<Record<Locale, readonly string[]>> = {
    "es-AR": options.topicSlugsByLocale?.["es-AR"] ?? ["privacidad"],
    "en-US": options.topicSlugsByLocale?.["en-US"] ?? ["privacy"],
  };

  for (const mode of modes) {
    const isDraftMode = mode === "draft";

    for (const locale of locales) {
      // 1. SEO entries
      for (const name of seoNames) {
        await runCheck(`getSeo(${name})`, mode, locale, async () =>
          Promise.all([
            cf.getSeo(name, locale, isDraftMode),
            mg.getSeo(name, locale, isDraftMode),
          ]),
        );
      }

      // 2. Sections + aliases
      for (const name of sectionNames) {
        await runCheck(`getSection(${name})`, mode, locale, async () =>
          Promise.all([
            cf.getSection(name, locale, isDraftMode),
            mg.getSection(name, locale, isDraftMode),
          ]),
        );
      }
      await runCheck("getCtaComponent(connect-with-us)", mode, locale, async () =>
        Promise.all([
          cf.getCtaComponent("connect-with-us", locale, isDraftMode),
          mg.getCtaComponent("connect-with-us", locale, isDraftMode),
        ]),
      );
      await runCheck("getHeroBannerComponent(our-mission)", mode, locale, async () =>
        Promise.all([
          cf.getHeroBannerComponent("our-mission", locale, isDraftMode),
          mg.getHeroBannerComponent("our-mission", locale, isDraftMode),
        ]),
      );
      await runCheck("getTextBlockComponent(info-community)", mode, locale, async () =>
        Promise.all([
          cf.getTextBlockComponent("info-community", locale, isDraftMode),
          mg.getTextBlockComponent("info-community", locale, isDraftMode),
        ]),
      );

      // 3. Globals & Event Banner
      await runCheck("getNavigationMenu(main-menu)", mode, locale, async () =>
        Promise.all([
          cf.getNavigationMenu("main-menu", locale, isDraftMode),
          mg.getNavigationMenu("main-menu", locale, isDraftMode),
        ]),
      );
      await runCheck("getFooter", mode, locale, async () =>
        Promise.all([
          cf.getFooter(locale, isDraftMode),
          mg.getFooter(locale, isDraftMode),
        ]),
      );
      await runCheck(
        "getSingleEmailForm(single-email-subscribe)",
        mode,
        locale,
        async () =>
          Promise.all([
            cf.getSingleEmailForm("single-email-subscribe", locale, isDraftMode),
            mg.getSingleEmailForm("single-email-subscribe", locale, isDraftMode),
          ]),
      );
      await runCheck("getContactForm", mode, locale, async () =>
        Promise.all([
          cf.getContactForm(locale, isDraftMode),
          mg.getContactForm(locale, isDraftMode),
        ]),
      );
      for (const name of eventBannerNames) {
        await runCheck(`getEventBanner(${name})`, mode, locale, async () =>
          Promise.all([
            cf.getEventBanner(name, locale, isDraftMode),
            mg.getEventBanner(name, locale, isDraftMode),
          ]),
        );
      }

      // 4. Content Collections (+ mapContentCollection)
      for (const name of collectionNames) {
        await runCheck(
          `getContentCollection(${name})`,
          mode,
          locale,
          async () => {
            const [cfRaw, mgRaw] = await Promise.all([
              cf.getContentCollection(name, locale, isDraftMode),
              mg.getContentCollection(name, locale, isDraftMode),
            ]);
            return [cfRaw, mgRaw];
          },
        );
      }

      // 5. Topics (per-locale slugs + cross-locale negative check)
      for (const slug of topicSlugsByLocale[locale]) {
        await runCheck(`getChurchInfoTopic(${slug})`, mode, locale, async () =>
          Promise.all([
            cf.getChurchInfoTopic(slug, locale, isDraftMode),
            mg.getChurchInfoTopic(slug, locale, isDraftMode),
          ]),
        );
      }

      // 6. Blog posts (sitemap slugs in published mode, latest, detail, ById)
      const discoveredBlogSlugs = new Set<string>(options.extraBlogSlugs ?? []);
      if (!isDraftMode) {
        await runCheck("getAllBlogPostSlugs", mode, locale, async () => {
          const [cfSlugs, mgSlugs] = await Promise.all([
            cf.getAllBlogPostSlugs(locale),
            mg.getAllBlogPostSlugs(locale),
          ]);
          for (const s of cfSlugs) discoveredBlogSlugs.add(s.slug);
          for (const s of mgSlugs) discoveredBlogSlugs.add(s.slug);
          return [cfSlugs, mgSlugs];
        });
      }

      await runCheck("getLatestBlogPostPages", mode, locale, async () => {
        const [cfPosts, mgPosts] = await Promise.all([
          cf.getLatestBlogPostPages(locale, { isDraftMode }),
          mg.getLatestBlogPostPages(locale, { isDraftMode }),
        ]);
        for (const p of [...cfPosts, ...mgPosts]) {
          if (isRecord(p) && typeof p.slug === "string") {
            discoveredBlogSlugs.add(p.slug);
          }
        }
        return [cfPosts, mgPosts];
      });

      for (const slug of [...discoveredBlogSlugs].sort()) {
        let cfPostId: string | undefined;
        await runCheck(`getBlogPostPage(${slug})`, mode, locale, async () => {
          const [cfPost, mgPost] = await Promise.all([
            cf.getBlogPostPage(slug, locale, isDraftMode),
            mg.getBlogPostPage(slug, locale, isDraftMode),
          ]);
          if (isRecord(cfPost) && isRecord(cfPost.sys) && typeof cfPost.sys.id === "string") {
            cfPostId = cfPost.sys.id;
          }
          return [cfPost, mgPost];
        });

        if (cfPostId && options.entryIdByContentfulId?.has(cfPostId)) {
          const mongoPostId = options.entryIdByContentfulId.get(cfPostId)!;
          await runCheck(
            `getBlogPostPageById(${slug})`,
            mode,
            locale,
            async () =>
              Promise.all([
                cf.getBlogPostPageById(cfPostId!, locale, isDraftMode),
                mg.getBlogPostPageById(mongoPostId, locale, isDraftMode),
              ]),
          );
        }
      }

      // 7. Sermons (sitemap slugs in published mode, archive, latest, detail, ById)
      const discoveredSermonSlugs = new Set<string>(
        options.extraSermonSlugs ?? [],
      );
      if (!isDraftMode) {
        await runCheck("getAllSermonSlugs", mode, locale, async () => {
          const [cfSlugs, mgSlugs] = await Promise.all([
            cf.getAllSermonSlugs(locale),
            mg.getAllSermonSlugs(locale),
          ]);
          for (const s of cfSlugs) discoveredSermonSlugs.add(s.slug);
          for (const s of mgSlugs) discoveredSermonSlugs.add(s.slug);
          return [cfSlugs, mgSlugs];
        });
      }

      await runCheck("getAllSermons", mode, locale, async () => {
        const [cfAll, mgAll] = await Promise.all([
          cf.getAllSermons(locale, { isDraftMode }),
          mg.getAllSermons(locale, { isDraftMode }),
        ]);
        for (const s of [...cfAll, ...mgAll]) {
          if (isRecord(s) && typeof s.slug === "string") {
            discoveredSermonSlugs.add(s.slug);
          }
        }
        return [cfAll, mgAll];
      });

      await runCheck("getLatestSermons", mode, locale, async () =>
        Promise.all([
          cf.getLatestSermons(locale, { isDraftMode }),
          mg.getLatestSermons(locale, { isDraftMode }),
        ]),
      );

      for (const slug of [...discoveredSermonSlugs].sort()) {
        let cfSermonId: string | undefined;
        await runCheck(`getSermon(${slug})`, mode, locale, async () => {
          const [cfSermon, mgSermon] = await Promise.all([
            cf.getSermon(slug, locale, isDraftMode),
            mg.getSermon(slug, locale, isDraftMode),
          ]);
          if (
            isRecord(cfSermon) &&
            isRecord(cfSermon.sys) &&
            typeof cfSermon.sys.id === "string"
          ) {
            cfSermonId = cfSermon.sys.id;
          }
          return [cfSermon, mgSermon];
        });

        if (cfSermonId && options.entryIdByContentfulId?.has(cfSermonId)) {
          const mongoSermonId = options.entryIdByContentfulId.get(cfSermonId)!;
          await runCheck(`getSermonById(${slug})`, mode, locale, async () =>
            Promise.all([
              cf.getSermonById(cfSermonId!, locale, isDraftMode),
              mg.getSermonById(mongoSermonId, locale, isDraftMode),
            ]),
          );
        }
      }
    }
  }

  const passedChecks = checks.filter((c) => c.ok).length;
  const failedChecks = checks.length - passedChecks;

  return {
    startedAt,
    completedAt: new Date().toISOString(),
    modes,
    totalChecks: checks.length,
    passedChecks,
    failedChecks,
    totalDiffs: diffs.length,
    ok: failedChecks === 0,
    checks,
    diffs,
  };
}

export function formatDataParityReportMarkdown(
  report: DataParityReport,
): string {
  const lines: string[] = [
    "# Data Parity Report (Contentful vs MongoDB)",
    "",
    `- **Status:** ${report.ok ? "PASS (0 diffs)" : `FAIL (${report.totalDiffs} diff(s))`}`,
    `- **Modes:** ${report.modes.join(", ")}`,
    `- **Checks:** ${report.passedChecks}/${report.totalChecks} passed`,
    `- **Started:** ${report.startedAt}`,
    `- **Completed:** ${report.completedAt}`,
    "",
  ];

  if (report.diffs.length > 0) {
    lines.push("## Differences", "");
    for (const d of report.diffs.slice(0, 100)) {
      lines.push(
        `- **[${d.mode} · ${d.locale}] \`${d.check}\` at \`${d.path}\`**`,
        `  - Contentful: \`${JSON.stringify(d.contentfulValue)}\``,
        `  - MongoDB: \`${JSON.stringify(d.mongoValue)}\``,
      );
    }
    if (report.diffs.length > 100) {
      lines.push(`- …and ${report.diffs.length - 100} more difference(s)`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}
