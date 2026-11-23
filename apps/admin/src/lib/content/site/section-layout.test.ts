import { describe, expect, it } from "vitest";
import { getSectionLayoutFieldConfig } from "./section-layout";

describe("getSectionLayoutFieldConfig", () => {
  it("configures hero fields (single image, subHeadline, required targetPage)", () => {
    const cfg = getSectionLayoutFieldConfig("hero");
    expect(cfg.showHeadline).toBe(true);
    expect(cfg.requireHeadlineEs).toBe(true);
    expect(cfg.showSubHeadline).toBe(true);
    expect(cfg.showBody).toBe(true);
    expect(cfg.requireBodyEs).toBe(true);
    expect(cfg.showCtaText).toBe(true);
    expect(cfg.requireCtaTextEs).toBe(true);
    expect(cfg.showTargetPage).toBe(true);
    expect(cfg.requireTargetPage).toBe(true);
    expect(cfg.showSingleImage).toBe(true);
    expect(cfg.requireSingleImage).toBe(true);
    expect(cfg.showImageList).toBe(false);
    expect(cfg.showUrlParameters).toBe(false);
  });

  it("reveals urlParameters on hero only when already populated", () => {
    const cfg = getSectionLayoutFieldConfig("hero", {
      urlParameters: "ref=home",
    });
    expect(cfg.showUrlParameters).toBe(true);
  });

  it("configures cta fields (headline, ctaText, optional targetPage + urlParameters, no images)", () => {
    const cfg = getSectionLayoutFieldConfig("cta");
    expect(cfg.showHeadline).toBe(true);
    expect(cfg.showCtaText).toBe(true);
    expect(cfg.showTargetPage).toBe(true);
    expect(cfg.requireTargetPage).toBe(false);
    expect(cfg.showUrlParameters).toBe(true);
    expect(cfg.showBody).toBe(false);
    expect(cfg.showSingleImage).toBe(false);
    expect(cfg.showImageList).toBe(false);
  });

  it("configures textBlock fields (optional headline, required body, multi images)", () => {
    const cfg = getSectionLayoutFieldConfig("textBlock");
    expect(cfg.showHeadline).toBe(true);
    expect(cfg.requireHeadlineEs).toBe(false);
    expect(cfg.showBody).toBe(true);
    expect(cfg.requireBodyEs).toBe(true);
    expect(cfg.showImageList).toBe(true);
    expect(cfg.showSingleImage).toBe(false);
    expect(cfg.showTargetPage).toBe(false);
    expect(cfg.showCtaText).toBe(false);
  });
});
