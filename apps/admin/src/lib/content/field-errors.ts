import type { Locale } from "@idcr/content";

export interface TranslatedFieldError {
  readonly path: string;
  readonly message: string;
  /** Which tab owns this field (`es-AR`, `en-US`, or `general` for non-localized fields). */
  readonly localeTab: Locale | "general";
}

export type FieldErrorTranslator = (key: string) => string | undefined;

/**
 * Infers which content tab a field path belongs to (`"title.es-AR"` -> `"es-AR"`,
 * `"items.0.description.en-US"` -> `"en-US"`, `"featuredImageId"` -> `"general"`).
 */
export function inferLocaleTabFromFieldPath(path: string): Locale | "general" {
  const segments = path.split(".");
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    if (segments[i] === "es-AR") return "es-AR";
    if (segments[i] === "en-US") return "en-US";
  }
  return "general";
}

/**
 * Strips numeric array indices (`"items.0.title.en-US"` -> `"items.*.title.en-US"`)
 * and extracts the base field (`"title.en-US"` -> `"title"`) so translation lookups
 * match cleanly without ever surfacing raw Zod strings (`F-editor-ux-decisions.md` §2.5).
 */
function buildLookupCandidates(path: string): string[] {
  const candidates: string[] = [path];
  const wildcard = path
    .split(".")
    .map((seg) => (/^\d+$/.test(seg) ? "*" : seg))
    .join(".");
  if (wildcard !== path) candidates.push(wildcard);

  // Strip trailing locale segment (e.g. "title.es-AR" -> "title")
  const withoutLocale = path.replace(/\.(?:es-AR|en-US)$/, "");
  if (withoutLocale !== path) candidates.push(withoutLocale);

  // Strip rich-text internal subpaths (e.g. "content.es-AR.content.0.marks" -> "content.es-AR", "content")
  const segments = path.split(".");
  if (segments.length >= 2 && (segments[1] === "es-AR" || segments[1] === "en-US")) {
    candidates.push(`${segments[0]}.${segments[1]}`);
    candidates.push(segments[0]!);
  } else if (segments.length >= 1) {
    // Nested object field e.g. "event.name.es-AR" -> "name.es-AR", "name"
    const lastNonLocale = withoutLocale.split(".").pop();
    if (lastNonLocale && lastNonLocale !== withoutLocale) {
      candidates.push(lastNonLocale);
    }
    candidates.push(segments[0]!);
  }

  return Array.from(new Set(candidates));
}

/**
 * Converts server `fieldErrors: Record<string, string[]>` into localized,
 * actionable user messages. NEVER returns a raw Zod English error string.
 */
export function translateFieldErrors(
  fieldErrors: Readonly<Record<string, readonly string[]>>,
  options: {
    readonly lookupFieldMessage: FieldErrorTranslator;
    readonly customFieldErrorMap?: (
      path: string,
      rawMessages: readonly string[],
    ) => string | undefined;
    readonly slugTakenMessage: string;
    readonly duplicateKeyMessage: string;
    readonly fallbackMessage: string;
  },
): {
  readonly list: TranslatedFieldError[];
  readonly byPath: Record<string, string>;
  readonly countByLocale: Record<Locale, number>;
} {
  const list: TranslatedFieldError[] = [];
  const byPath: Record<string, string> = {};
  const countByLocale: Record<Locale, number> = { "es-AR": 0, "en-US": 0 };

  for (const [path, rawMessages] of Object.entries(fieldErrors)) {
    if (!rawMessages || rawMessages.length === 0) continue;

    let resolved: string | undefined;

    if (rawMessages.includes("duplicate-key")) {
      resolved = path.startsWith("slug")
        ? options.slugTakenMessage
        : options.duplicateKeyMessage;
    }

    if (!resolved && options.customFieldErrorMap) {
      resolved = options.customFieldErrorMap(path, rawMessages);
    }

    if (!resolved) {
      for (const candidate of buildLookupCandidates(path)) {
        const hit =
          options.lookupFieldMessage(candidate.replaceAll(".", "__")) ??
          options.lookupFieldMessage(candidate);
        if (hit) {
          resolved = hit;
          break;
        }
      }
    }

    const message = resolved ?? options.fallbackMessage;
    const localeTab = inferLocaleTabFromFieldPath(path);

    byPath[path] = message;
    list.push({ path, message, localeTab });

    if (localeTab === "es-AR" || localeTab === "en-US") {
      countByLocale[localeTab] += 1;
    }
  }

  return { list, byPath, countByLocale };
}
