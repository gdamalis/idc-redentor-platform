import { AppShell } from "@src/components/shell/app-shell";
import type { ReactNode } from "react";

export default function AppLayout({ children }: { readonly children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
