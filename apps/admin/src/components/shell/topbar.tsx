import { LocaleSwitcher } from "@src/components/shell/locale-switcher";
import { ThemeToggle } from "@src/components/theme/theme-toggle";
import { Button } from "@src/components/ui/button";
import { UserCircle } from "lucide-react";
import { getTranslations } from "next-intl/server";

export async function Topbar() {
  const t = await getTranslations("topbar");

  return (
    <header className="flex h-14 shrink-0 items-center justify-end gap-2 border-b border-border bg-background px-4">
      <LocaleSwitcher />
      <ThemeToggle />
      {/* Static placeholder — sign-out wiring lands with Firebase Auth (a later checkpoint). */}
      <Button type="button" variant="ghost" size="sm" className="gap-2" disabled>
        <UserCircle className="h-4 w-4" />
        <span className="hidden sm:inline">{t("userMenuPlaceholder")}</span>
      </Button>
    </header>
  );
}
