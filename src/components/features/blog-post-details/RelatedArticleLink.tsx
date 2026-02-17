"use client";

import { Link } from "@src/i18n/routing";
import { trackEvent } from "@src/lib/analytics";
import { ReactNode } from "react";

interface RelatedArticleLinkProps {
  readonly href: string;
  readonly sourceArticle: string;
  readonly targetArticle: string;
  readonly targetArticleTitle: string;
  readonly children: ReactNode;
}

export function RelatedArticleLink({
  href,
  sourceArticle,
  targetArticle,
  targetArticleTitle,
  children,
}: RelatedArticleLinkProps) {
  return (
    <Link
      href={href}
      onClick={() =>
        trackEvent("related_article_click", {
          source_article: sourceArticle,
          target_article: targetArticle,
          target_article_title: targetArticleTitle,
        })
      }
    >
      {children}
    </Link>
  );
}
