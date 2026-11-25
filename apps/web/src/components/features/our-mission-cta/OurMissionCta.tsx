"use client";

import { ourMissionCtaPreset, renderRichText } from "@lib/content/rich-text";
import type { SectionView } from "@lib/content/types";
import { Link } from "@src/i18n/routing";
import Image from "next/image";
import { motion } from "framer-motion";
import { Button } from "@src/components/ui/button";
import { useTranslations } from "next-intl";
import { trackEvent } from "@src/lib/analytics";

// Animation variants
const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6 },
};

const stagger = {
  animate: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

interface OurMissionCtaProps {
  readonly content: SectionView;
}

export const OurMissionCta = ({ content }: OurMissionCtaProps) => {
  const t = useTranslations("OurMissionCta");
  const bodyText = content.body
    ? renderRichText(content.body, ourMissionCtaPreset)
    : null;

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background Image with Parallax-like effect */}
      <div className="absolute inset-0 z-0">
        {content.image && (
          <Image
            src={content.image.url}
            alt={content.image.title}
            fill
            className="object-cover"
            priority
          />
        )}
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-background" />
      </div>

      {/* Content */}
      <div className="relative z-10 px-4 text-center text-white max-w-4xl mx-auto mt-16">
        <motion.div
          initial="initial"
          animate="animate"
          variants={stagger}
          className="space-y-6"
        >
          <motion.span
            variants={fadeInUp}
            className="inline-block py-1 px-3 rounded-full bg-primary/90 backdrop-blur-sm text-sm font-medium tracking-wide uppercase mb-4"
          >
            {t("welcome-home")}
          </motion.span>

          <motion.h1
            variants={fadeInUp}
            className="font-serif text-5xl md:text-7xl font-bold leading-tight"
          >
            <span>{content.headline}</span>
            <br />
            <span className="italic">{content.subHeadline}</span>
          </motion.h1>

          {bodyText && (
            <motion.div
              variants={fadeInUp}
              className="max-w-3xl mx-auto backdrop-blur-sm bg-black/20 p-6 rounded-2xl border border-white/10"
            >
              {bodyText}
            </motion.div>
          )}

          <motion.div
            variants={fadeInUp}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8"
          >
            <Link
              href="/come-meet-us"
              onClick={() =>
                trackEvent("join_us_click", {
                  click_location: "hero_cta",
                  page_path: window.location.pathname,
                })
              }
            >
              <Button
                size="lg"
                className="rounded-full px-8 text-lg h-14 bg-primary hover:bg-primary/90"
              >
                {t("join-us-sunday")}
              </Button>
            </Link>
            {content.targetPage?.slug && content.ctaText && (
              <Link href={`/${content.targetPage.slug}`}>
                <Button
                  size="lg"
                  className="rounded-full px-8 text-lg h-14 bg-black/20 hover:bg-white/20 text-white border-white/20 backdrop-blur-sm [text-shadow:_0_2px_8px_rgb(0_0_0_/_60%)]"
                >
                  {content.ctaText}
                </Button>
              </Link>
            )}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
};
