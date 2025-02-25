import { Disclosure, DisclosureButton } from "@headlessui/react";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Link } from "@src/i18n/routing";

import LanguageSwitcher from "@src/components/shared/language-switcher/LanguageSwitcher";
import { MainMenuMobile } from "@src/components/shared/main-menu";
import { MainMenuDesktop } from "@src/components/shared/main-menu/MainMenuDesktop";

const menuItems = [
  { href: "/community", label: "Comunidad" },
  { href: "/blog", label: "Blog" },
  // { href: '/who-is-jesus', label: '¿Quién es Jesús?' },
  { href: "/come-meet-us", label: "Conectemos" },
];

export const Navbar = () => {
  const t = useTranslations();

  return (
    <Disclosure as="nav" className="bg-white dark:bg-black shadow">
      <div className="mx-auto max-w-7xl px-2 sm:px-6 lg:px-8">
        <div className="relative flex h-16 justify-between">
          <div className="flex items-center sm:hidden">
            {/* Mobile menu button */}
            <DisclosureButton className="group relative inline-flex items-center justify-center rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500">
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
      </div>

      <MainMenuMobile menuItems={menuItems} />
    </Disclosure>
  );
};
