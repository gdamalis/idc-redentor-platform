"use client";

import { usePathname } from "@src/i18n/routing";
import { Navbar } from "./Navbar";
import type { MenuItem } from "@src/types/MenuItem";

interface NavbarWrapperProps {
  menuItems: MenuItem[];
}

/**
 * Client wrapper component that determines the Navbar variant based on the current pathname.
 * - Uses "overlay" variant for home page only (has image background)
 * - Uses "solid" variant for all other pages (light backgrounds without images)
 */
export const NavbarWrapper = ({ menuItems }: NavbarWrapperProps) => {
  const pathname = usePathname();
  
  // Only the home page uses overlay variant (transparent with white text over images)
  // All other pages use solid variant (visible navbar with dark text)
  const isHomePage = pathname === "/";
  
  return <Navbar menuItems={menuItems} variant={isHomePage ? "overlay" : "solid"} />;
};

