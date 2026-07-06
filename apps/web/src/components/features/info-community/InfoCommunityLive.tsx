"use client";

import { useLivePreview } from "@src/components/shared/contentful-preview/useLivePreview";
import InfoCommunity from "./InfoCommunity";

interface InfoCommunityLiveProps {
  readonly raw: Parameters<typeof InfoCommunity>[0]["content"];
  readonly locale: string;
}

export function InfoCommunityLive({ raw, locale }: InfoCommunityLiveProps) {
  const { data, inspectorProps } = useLivePreview(raw, locale);
  return <InfoCommunity content={data} inspectorProps={inspectorProps} />;
}
