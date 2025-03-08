import { Typography } from "@src/components/ui/typography";
import { Link } from "@src/i18n/routing";
import { useTranslations } from "next-intl";
import Image from "next/image";

import { SubscribeForm } from "@src/components/shared/subscribe-form/SubscribeForm";
import SocialLinks from "../social-links/SocialLinks";

type FooterProps = {
  content: {
    logo: { url: string; title: string };
    shortDescription: string;
    socialLinks: { url: string; platform: string }[];
  };
  subscribeContent: {
    title: string;
    shortDescription: string;
    inputPlaceholder: string;
    ctaText: string;
    successMessage: string;
  };
};

export const Footer = ({ content, subscribeContent }: FooterProps) => {
  const t = useTranslations();

  return (
    <footer
      aria-labelledby="footer-heading"
      className="border-t border-gray-900/10 bg-white dark:bg-black"
    >
      <Typography
        component="h2"
        variant="h2"
        id="footer-heading"
        className="sr-only"
      >
        Footer
      </Typography>
      <div className="mx-auto max-w-7xl px-6 pb-8 pt-16 sm:pt-24 lg:px-8 lg:pt-32">
        <div className="xl:grid xl:grid-cols-3 xl:gap-8">
          <div className="space-y-8">
            <Link className="flex w-fit" href="/" title={t("common.homepage")}>
              <Image
                src={content.logo.url}
                alt={content.logo.title}
                className="dark:invert dark:mix-blend-luminosity"
                width={80}
                height={80}
              />
            </Link>
            <Typography
              component="p"
              variant="body1"
              className="text-sm leading-6 text-gray-600"
            >
              {content.shortDescription}
            </Typography>
            <SocialLinks links={content.socialLinks} />
          </div>
          <div className="mt-16 xl:mt-0">
            <div className="md:grid md:grid-cols-2 md:gap-8">
              {/* <div>
                <Typography
          component="h3"
          variant="h3" className="text-sm font-semibold leading-6 text-gray-900">Solutions</Typography>
                <ul className="mt-6 space-y-4">
                  {navigation.solutions.map(item => (
                    <li key={item.name}>
                      <a
                        href={item.href}
                        className="text-sm leading-6 text-gray-600 hover:text-gray-900">
                        {item.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-10 md:mt-0">
                <Typography
          component="h3"
          variant="h3" className="text-sm font-semibold leading-6 text-gray-900">Support</Typography>
                <ul className="mt-6 space-y-4">
                  {navigation.support.map(item => (
                    <li key={item.name}>
                      <a
                        href={item.href}
                        className="text-sm leading-6 text-gray-600 hover:text-gray-900">
                        {item.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </div> */}
            </div>
          </div>
          <SubscribeForm content={subscribeContent}
          />
        </div>
        <div className="mt-16 border-t border-gray-900/10 pt-8 text-center sm:mt-20 lg:mt-24 lg:flex lg:justify-between lg:text-left">
          <Typography
            component="p"
            variant="body1"
            className="text-xs leading-5 text-gray-500"
          >
            &copy; {new Date().getFullYear()} {t("footer.copyright")}
          </Typography>
          <Typography
            component="p"
            variant="body1"
            className="text-xs leading-5 text-gray-500"
          >
            {t("footer.poweredBy")}
          </Typography>
        </div>
      </div>
    </footer>
  );
};
