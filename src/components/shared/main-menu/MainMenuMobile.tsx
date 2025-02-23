"use client";
import { DisclosureButton, DisclosurePanel } from "@headlessui/react";
import React from "react";

import { usePathname, Link } from "@src/i18n/routing";
import { MenuItem } from "@src/types/MenuItem";

type MainMenuMobileProps = {
  menuItems: MenuItem[];
};

export const MainMenuMobile = ({ menuItems }: MainMenuMobileProps) => {
  const pathname = usePathname();

  const [currentPath, setCurrentPath] = React.useState(pathname);

  React.useEffect(() => {
    setCurrentPath(pathname);
  }, [pathname]);

  return (
    <DisclosurePanel className="sm:hidden">
      <div className="space-y-1 pb-4 pt-2">
        {menuItems.map((item) => (
          <DisclosureButton
            key={item.label}
            as={Link}
            href={item.href}
            className={`${
              currentPath === item.href
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-700"
            } block border-l-4 py-2 pl-3 pr-4 text-base font-medium`}
          >
            {item.label}
          </DisclosureButton>
        ))}
        {/* Current: "bg-blue-50 border-blue-500 text-blue-700", Default: "border-transparent text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700" */}
      </div>
    </DisclosurePanel>
  );
};
