"use client";

import { useTranslations } from "next-intl";
import { Typography } from "@src/components/ui/typography";
import { Container } from "@src/components/ui/container";
import { motion } from "framer-motion";

type HeaderProps = {
  titlePath: string;
  description?: string;
  subtitle?: string;
  className?: string;
  variant?: "image" | "gradient";
};

export const Header = ({ 
  titlePath, 
  description, 
  subtitle,
  className,
  variant = "image" 
}: HeaderProps) => {
  const t = useTranslations();

  if (variant === "gradient") {
    return (
      <section className="relative pt-32 pb-20 bg-muted/30 overflow-hidden">
        <Container className="relative z-10">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="font-serif text-5xl md:text-6xl font-bold leading-tight"
            >
              {t.rich(titlePath, {
                highlight: (text) => (
                  <span className="text-primary">{text}</span>
                ),
              })}
            </motion.h1>
            {subtitle && (
              <motion.p 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-xl text-muted-foreground leading-relaxed"
              >
                {subtitle}
              </motion.p>
            )}
          </div>
        </Container>
        
        {/* Decorative background elements */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-0 pointer-events-none opacity-30">
          <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-primary/20 rounded-full blur-[100px]" />
          <div className="absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] bg-secondary/30 rounded-full blur-[100px]" />
        </div>
      </section>
    );
  }

  return (
    <div
      className={`bg-white/50 bg-cover bg-center py-24 bg-blend-overlay sm:py-48 ${className}`}
    >
      <Container className="px-6 lg:px-8">
        <div className="mx-auto max-w-2xl lg:mx-0">
          <Typography
            component="h1"
            variant="h1"
            className="inline-block text-4xl/normal font-bold text-gray-900 sm:text-6xl dark:!text-gray-900"
          >
            {t.rich(titlePath, {
              highlight: (text) => (
                <span className="animate-highlight bg-gradient-to-r from-yellow-300 to-yellow-300 bg-[length:0%_100%] bg-left-bottom bg-no-repeat px-2 [animation-delay:1s]">
                  {text}
                </span>
              ),
            })}
          </Typography>
          {description && (
            <Typography
              component="p"
              variant="body1"
              className="mt-6 text-lg leading-8 text-gray-600 dark:text-gray-300"
            >
              {description}
            </Typography>
          )}
        </div>
      </Container>
    </div>
  );
};
