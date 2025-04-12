"use client";

import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { ChevronDownIcon, GlobeAltIcon } from "@heroicons/react/24/outline";
import { i18n, type Locale } from "@src/i18n/config";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function LanguageSwitcher() {
  const pathname = usePathname();
  const currentLocale = pathname?.split("/")[1];

  const redirectedPathname = (locale: Locale) => {
    if (!pathname) return "/";
    const segments = pathname.split("/");
    segments[1] = locale;
    return segments.join("/");
  };

  return (
    <Menu as="div" className="relative inline-block text-left">
      <div>
        <MenuButton className="inline-flex w-full justify-center gap-x-1.5 rounded-md  px-3 py-2 text-sm font-semibold text-gray-900 dark:text-white shadow-sm">
          <GlobeAltIcon
            aria-hidden="true"
            className="-mr-1 size-5 text-gray-400"
          />
          {currentLocale?.split("-")[0]?.toUpperCase()}
          <ChevronDownIcon
            aria-hidden="true"
            className="-mr-1 size-5 text-gray-400"
          />
        </MenuButton>
      </div>

      <MenuItems
        transition
        className="absolute right-0 z-10 mt-2 origin-top-right rounded-md  shadow-lg ring-1 ring-gray-700/5 dark:ring-white/5 transition focus:outline-none data-[closed]:scale-95 data-[closed]:transform data-[closed]:opacity-0 data-[enter]:duration-100 data-[leave]:duration-75 data-[enter]:ease-out data-[leave]:ease-in"
      >
        <ul>
          {i18n.locales
            .filter((e) => e !== currentLocale)
            .map((locale) => {
              return (
                <li key={locale}>
                  <MenuItem>
                    <Link
                      href={redirectedPathname(locale)}
                      className="block px-4 py-2 text-sm text-gray-700 dark:text-white data-[focus]:rounded-md data-[focus]:bg-gray-100 dark:data-[focus]:bg-gray-700 dark:data-[focus]:text-white data-[focus]:text-gray-900 data-[focus]:outline-none"
                    >
                      {locale?.split("-")[0]?.toUpperCase()}
                    </Link>
                  </MenuItem>
                </li>
              );
            })}
        </ul>
      </MenuItems>
    </Menu>
  );
}
