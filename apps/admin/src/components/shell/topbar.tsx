import { LocaleSwitcher } from "@src/components/shell/locale-switcher";
import { SignOutButton } from "@src/components/shell/sign-out-button";
import { ThemeToggle } from "@src/components/theme/theme-toggle";

export function Topbar() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-end gap-2 border-b border-border bg-background px-4">
      <LocaleSwitcher />
      <ThemeToggle />
      <SignOutButton />
    </header>
  );
}
