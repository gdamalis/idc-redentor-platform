import { MobileNav } from "@src/components/shell/mobile-nav";
import { NAV_ITEMS } from "@src/components/shell/nav-items";
import { Sidebar } from "@src/components/shell/sidebar";
import { Topbar } from "@src/components/shell/topbar";
import { getSessionPermissions } from "@src/lib/rbac/require-permission";
import type { PermissionKey } from "@src/lib/rbac/permissions";
import type { ReactNode } from "react";

export async function AppShell({ children }: { readonly children: ReactNode }) {
  // Resolved ONCE here and handed to both nav surfaces, so the desktop rail
  // and the mobile tab bar can never disagree about what a user may see.
  // Still convenience only — `requirePermission()` in each page is the gate.
  const authz = await getSessionPermissions();
  const granted = authz.ok ? authz.permissions : new Set<PermissionKey>();
  const items = NAV_ITEMS.filter(
    (item) => !item.permission || granted.has(item.permission),
  );

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar items={items} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-6">
          {children}
        </main>
      </div>
      <MobileNav items={items} />
    </div>
  );
}
