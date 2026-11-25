import { Typography } from "@src/components/ui/typography";
import { Link } from "@src/i18n/routing";
import type { RichTextPreset } from "./types";

/**
 * Article preset for blog posts (`BlogPostContent.tsx`) and church info topics
 * (`[locale]/[topic]/page.tsx`).
 */
export const articlePreset: RichTextPreset = {
  profile: "article",
  renderParagraph: (children, key) => (
    <Typography key={key} component="p" variant="body">
      {children}
    </Typography>
  ),
  renderHeading: (level, children, key) =>
    level === 2 ? (
      <Typography key={key} component="h2" variant="h2">
        {children}
      </Typography>
    ) : (
      <Typography key={key} component="h3" variant="h3">
        {children}
      </Typography>
    ),
  renderBlockquote: (children, key) => (
    <Typography key={key} component="blockquote" variant="blockquote">
      {children}
    </Typography>
  ),
  renderBulletList: (children, key) => (
    <ul key={key} className="list-disc pl-5 space-y-2 mb-4">
      {children}
    </ul>
  ),
  renderOrderedList: (children, key, attrs) => (
    <ol
      key={key}
      className="list-decimal pl-5 space-y-2 mb-4"
      start={attrs?.start !== undefined && attrs.start !== 1 ? attrs.start : undefined}
    >
      {children}
    </ol>
  ),
  renderListItem: (children, key) => (
    <li key={key} className="space-y-2">
      {children}
    </li>
  ),
  renderBold: (children, key) => <strong key={key}>{children}</strong>,
  renderItalic: (children, key) => <em key={key}>{children}</em>,
  renderLink: (href, children, key) => (
    <a key={key} href={href}>
      {children}
    </a>
  ),
};

/**
 * Section description preset (`CreedSection.tsx`, `OurMissionSection.tsx`).
 * Uses default `<b>`/`<i>` inline marks.
 */
export const sectionDescriptionPreset: RichTextPreset = {
  profile: "inline",
  renderParagraph: (children, key) => (
    <p key={key} className="text-muted-foreground text-lg">
      {children}
    </p>
  ),
  renderBold: (children, key) => <b key={key}>{children}</b>,
  renderItalic: (children, key) => <i key={key}>{children}</i>,
};

/**
 * Card description preset (`CreedSection.tsx`, `OurMissionSection.tsx`).
 * Uses default `<b>`/`<i>` inline marks.
 */
export const cardDescriptionPreset: RichTextPreset = {
  profile: "inline",
  renderParagraph: (children, key) => (
    <p key={key} className="text-muted-foreground leading-relaxed">
      {children}
    </p>
  ),
  renderBold: (children, key) => <b key={key}>{children}</b>,
  renderItalic: (children, key) => <i key={key}>{children}</i>,
};

/**
 * Shared factory consolidating the three inline blurb presets (`InfoCommunity`,
 * `InfoConnect`, `OurMissionCta`), which differ only in the paragraph class string.
 */
export function createInlineParagraphPreset(className: string): RichTextPreset {
  return {
    profile: "inline",
    renderParagraph: (children, key) => (
      <Typography
        key={key}
        component="p"
        variant="body1"
        className={className}
      >
        {children}
      </Typography>
    ),
    renderBold: (children, key) => <b key={key}>{children}</b>,
    renderItalic: (children, key) => <i key={key}>{children}</i>,
  };
}

/** Inline blurb preset for `InfoCommunity.tsx`. */
export const infoCommunityPreset: RichTextPreset = createInlineParagraphPreset(
  "text-xl md:text-2xl dark:text-white",
);

/** Inline blurb preset for `InfoConnect.tsx`. */
export const infoConnectPreset: RichTextPreset = createInlineParagraphPreset(
  "text-xl md:text-2xl text-gray-700 dark:text-gray-300",
);

/** Inline blurb preset for `OurMissionCta.tsx` (`"use client"`). */
export const ourMissionCtaPreset: RichTextPreset = createInlineParagraphPreset(
  "text-lg md:text-xl text-white max-w-2xl mx-auto leading-relaxed [text-shadow:_0_2px_8px_rgb(0_0_0_/_60%)]",
);

/**
 * Agreement note preset for `ContactForm.tsx` (`"use client"`).
 * Renders links via `next-intl`'s `Link` with `target="_blank"`.
 */
export const contactFormAgreementPreset: RichTextPreset = {
  profile: "inlineLink",
  renderParagraph: (children, key) => (
    <Typography
      key={key}
      component="p"
      variant="body1"
      className="mt-4 text-sm/6 text-muted-foreground"
    >
      {children}
    </Typography>
  ),
  renderBold: (children, key) => <b key={key}>{children}</b>,
  renderItalic: (children, key) => <i key={key}>{children}</i>,
  renderLink: (href, children, key) => (
    <Link
      key={key}
      href={href}
      className="font-semibold text-primary hover:underline"
      target="_blank"
    >
      {children}
    </Link>
  ),
};
