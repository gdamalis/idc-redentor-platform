import { Disclosure, DisclosureButton } from "@headlessui/react";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";
import { Link } from "@src/i18n/routing";
import { useTranslations } from "next-intl";
import Image from "next/image";

import LanguageSwitcher from "@src/components/shared/language-switcher/LanguageSwitcher";
import { MainMenuMobile } from "@src/components/shared/main-menu";
import { MainMenuDesktop } from "@src/components/shared/main-menu/MainMenuDesktop";
import { Container } from "@src/components/ui/container";

export const Navbar = ({ menuItems = [] }) => {
  const t = useTranslations();

  return (
    <Disclosure as="nav" className="bg-white dark:bg-gray-900 shadow">
      <Container className="px-2 sm:px-6 lg:px-8">
        <div className="relative flex h-16 justify-between">
          <div className="flex items-center sm:hidden">
            {/* Mobile menu button */}
            <DisclosureButton className="group relative inline-flex items-center justify-center rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 dark:hover:bg-gray-800 dark:hover:text-gray-400">
              <span className="absolute -inset-0.5" />
              <span className="sr-only">Open main menu</span>
              <Bars3Icon
                aria-hidden="true"
                className="block h-6 w-6 group-data-[open]:hidden"
              />
              <XMarkIcon
                aria-hidden="true"
                className="hidden h-6 w-6 group-data-[open]:block"
              />
            </DisclosureButton>
          </div>
          <div className="flex items-center justify-center sm:items-stretch">
            <div className="flex flex-shrink-0 items-center">
              <Link href="/" title={t("common.homepage")}>
                <Image
                  src="/assets/img/redentor_logo.png"
                  className="h-16 w-16 dark:invert dark:mix-blend-luminosity"
                  width={60}
                  height={80}
                  alt="Redentor church logo"
                />
              </Link>
            </div>
          </div>
          <MainMenuDesktop menuItems={menuItems} />
          <div className="flex items-center pr-2 sm:ml-6 sm:pr-0">
            <LanguageSwitcher />
          </div>
        </div>
      </Container>

      <MainMenuMobile menuItems={menuItems} />
    </Disclosure>
  );
};
