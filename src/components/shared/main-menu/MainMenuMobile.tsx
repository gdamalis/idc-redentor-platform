"use client";
import { DisclosureButton, DisclosurePanel } from "@headlessui/react";

import { Link, usePathname } from "@src/i18n/routing";
import { MenuItem } from "@src/types/MenuItem";

type MainMenuMobileProps = {
  menuItems: MenuItem[];
};

export const MainMenuMobile = ({ menuItems }: MainMenuMobileProps) => {
  const path = usePathname();
  return (
    <DisclosurePanel className="sm:hidden">
      <div className="space-y-1 pb-4 pt-2">
        {menuItems.map((item) => (
          <DisclosureButton
            key={item.groupName}
            as={Link}
            href={`/${item.groupLink.slug}`}
            className={`${
              path.startsWith(`/${item.groupLink.slug}`)
                ? "border-blue-500 bg-blue-50 dark:bg-blue-900 text-blue-700 dark:text-blue-50"
                : "border-transparent text-gray-500 hover:border-gray-300 dark:hover:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900 hover:text-gray-700 dark:hover:text-gray-300"
            } block border-l-4 py-2 pl-3 pr-4 text-base font-medium`}
          >
            {item.groupName}
          </DisclosureButton>
        ))}
        {/* Current: "bg-blue-50 border-blue-500 text-blue-700", Default: "border-transparent text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700" */}
      </div>
    </DisclosurePanel>
  );
};
