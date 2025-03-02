"use client";
import React from "react";

import { usePathname, Link } from "@src/i18n/routing";
import { MenuItem } from "@src/types/MenuItem";

type MainMenuDesktopProps = {
  menuItems: MenuItem[];
};

export const MainMenuDesktop = ({ menuItems }: MainMenuDesktopProps) => {
  const path = usePathname();

  return (
    <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
      {/* Current: "border-blue-500 text-gray-900", Default: "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700" */}
      {menuItems.map((item) => (
        <Link
          key={item.groupName}
          href={`/${item.groupLink.slug}`}
          className={`${
            path.startsWith(`/${item.groupLink.slug}`)
              ? "border-blue-500 text-gray-900 dark:text-white"
              : "border-transparent text-gray-500 dark:text-gray-100 hover:border-gray-300 hover:text-gray-700 dark:hover:text-gray-300"
          } inline-flex items-center border-b-2 px-1 pt-1 text-sm font-medium`}
        >
          {item.groupName}
        </Link>
      ))}
    </div>
  );
};
