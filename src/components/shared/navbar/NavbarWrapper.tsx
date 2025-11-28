"use client";

import { usePathname } from "@src/i18n/routing";
import { Navbar } from "./Navbar";
import type { MenuItem } from "@src/types/MenuItem";

interface NavbarWrapperProps {
  menuItems: MenuItem[];
}

/**
 * Client wrapper component that determines the Navbar variant based on the current pathname.
 * - Uses "solid" variant for blog post pages (white background)
 * - Uses "overlay" variant (default) for all other pages
 */
export const NavbarWrapper = ({ menuItems }: NavbarWrapperProps) => {
  const pathname = usePathname();
  
  // Check if we're on a blog post page (e.g., /blog/some-slug)
  // Blog listing page (/blog) should use overlay variant
  const isBlogPost = pathname?.startsWith("/blog");
  
  return <Navbar menuItems={menuItems} variant={isBlogPost ? "solid" : "overlay"} />;
};

