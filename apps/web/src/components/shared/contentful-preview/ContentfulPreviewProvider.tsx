"use client";

// NOTE: @contentful/live-preview@4.10.10 ships no CSS export (no `exports["./style.css"]`
// entry and no .css file in `dist/`) — the inspector overlay styling is injected by the SDK
// itself at runtime, so there is no stylesheet import here. Re-check on any SDK version bump.
import { ContentfulLivePreviewProvider } from "@contentful/live-preview/react";
import type { PropsWithChildren } from "react";

interface ContentfulPreviewProviderProps {
  readonly locale: string;
}

export function ContentfulPreviewProvider({
  locale,
  children,
}: PropsWithChildren<ContentfulPreviewProviderProps>) {
  return (
    <ContentfulLivePreviewProvider
      locale={locale}
      enableInspectorMode
      enableLiveUpdates
    >
      {children}
    </ContentfulLivePreviewProvider>
  );
}
