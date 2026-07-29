import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@src/components/shell/locale-switcher";
import { SignOutButton } from "@src/components/shell/sign-out-button";
import { ThemeToggle } from "@src/components/theme/theme-toggle";

export async function Topbar() {
  const t = await getTranslations("shell");

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-4">
      {/* The sidebar owns the brand on desktop, but it's hidden on mobile —
          without this the panel renders with no visible app name on a phone. */}
      <span className="truncate font-serif text-sm font-bold md:hidden">
        {t("appName")}
      </span>
      <div className="flex items-center gap-2 md:ml-auto">
        <LocaleSwitcher />
        <ThemeToggle />
        <SignOutButton />
      </div>
    </header>
  );
}
