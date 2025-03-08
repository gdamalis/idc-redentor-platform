import { Typography } from "@src/components/ui/typography";
import { Link } from "@src/i18n/routing";
import { useTranslations } from "next-intl";
import Image from "next/image";

import { SubscribeForm } from "@src/components/shared/subscribe-form/SubscribeForm";
import { Container } from "@src/components/ui/container";
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
      className="bg-gray-50 dark:bg-gray-700"
    >
      <Typography
        component="h2"
        variant="h2"
        id="footer-heading"
        className="sr-only"
      >
        Footer
      </Typography>
      <Container className="space-y-8 px-6 pt-12 lg:px-8">
        <div className="space-y-8 xl:grid xl:grid-cols-3 xl:gap-8">
          <div className="space-y-4">
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
          <div className="">
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
          <SubscribeForm className="" content={subscribeContent} />
        </div>
        <div className="py-4 border-t border-gray-900/10 lg:py-6 text-center lg:flex lg:justify-between lg:text-left">
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
      </Container>
    </footer>
  );
};
