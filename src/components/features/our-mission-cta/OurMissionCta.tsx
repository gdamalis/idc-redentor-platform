"use client";

import { BLOCKS } from "@contentful/rich-text-types";
import {
  CommonNode,
  documentToReactComponents,
} from "@contentful/rich-text-react-renderer";
import { Typography } from "@src/components/ui/typography";
import { Link } from "@src/i18n/routing";
import Image from "next/image";
import { ReactNode } from "react";
import { motion } from "framer-motion";
import { Button } from "@src/components/ui/button";
import { useTranslations } from "next-intl";

const options = {
  renderNode: {
    [BLOCKS.PARAGRAPH]: (node: CommonNode, children: ReactNode) => (
      <Typography
        component="p"
        variant="body1"
        className="text-lg md:text-xl text-white max-w-2xl mx-auto leading-relaxed drop-shadow-lg"
        style={{ textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}
      >
        {children}
      </Typography>
    ),
  },
};

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

type OurMissionCtaProps = {
  content: {
    headline: string;
    subHeadline: string;
    bodyText: {
      json: any;
    };
    ctaText: string;
    targetPage: {
      slug: string;
    };
    image: {
      title: string;
      url: string;
    };
    additionalImagesCollection: {
      items: {
        title: string;
        url: string;
      }[];
    };
  };
};

export const OurMissionCta = ({ content }: OurMissionCtaProps) => {
  const t = useTranslations("OurMissionCta");
  const bodyText = documentToReactComponents(content.bodyText.json, options);

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background Image with Parallax-like effect */}
      <div className="absolute inset-0 z-0">
        <Image
          src={content.image.url}
          alt={content.image.title}
          fill
          className="object-cover"
          priority
        />
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-background" />
      </div>

      {/* Content */}
      <div className="container relative z-10 px-4 text-center text-white max-w-4xl mx-auto mt-16">
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
            {content.headline}
            <br />
            <span className="italic">{content.subHeadline}</span>
          </motion.h1>

          <motion.div 
            variants={fadeInUp}
            className="max-w-3xl mx-auto backdrop-blur-sm bg-black/20 p-6 rounded-2xl border border-white/10"
          >
            {bodyText}
          </motion.div>

          <motion.div
            variants={fadeInUp}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8"
          >
            <Link href={`/come-meet-us`}>
              <Button
                size="lg"
                className="rounded-full px-8 text-lg h-14 bg-primary hover:bg-primary/90"
              >
                {t("join-us-sunday")}
              </Button>
            </Link>
            <Link href={`/${content.targetPage.slug}`}>
              <Button
                size="lg"
                className="rounded-full px-8 text-lg h-14 bg-white/10 hover:bg-white/20 text-white border-white/20 backdrop-blur-sm"
              >
                {content.ctaText}
              </Button>
            </Link>
          </motion.div>
        </motion.div>
      </div>

      {/* Additional Images Section - Below the Fold */}
      <div className="absolute bottom-0 left-0 right-0 z-10 pb-8 hidden lg:flex justify-center gap-4 opacity-50 hover:opacity-100 transition-opacity">
        {content.additionalImagesCollection.items.slice(0, 3).map((img, i) => (
          <div
            key={i}
            className="relative w-24 h-24 rounded-lg overflow-hidden"
          >
            <Image
              src={img.url}
              alt={img.title}
              fill
              className="object-cover"
            />
          </div>
        ))}
      </div>
    </section>
  );
};
