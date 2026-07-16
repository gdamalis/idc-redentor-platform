import { Sidebar } from "@src/components/shell/sidebar";
import { Topbar } from "@src/components/shell/topbar";
import type { ReactNode } from "react";

export function AppShell({ children }: { readonly children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
