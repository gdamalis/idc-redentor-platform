import { LOGO } from "@idcr/ui";
import { ThemeProvider } from "@src/components/theme/theme-provider";
import { getLocale, getTranslations } from "next-intl/server";
import { Outfit, Playfair_Display } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
});

export default async function NotFound() {
  const locale = await getLocale();
  const t = await getTranslations("notFound");

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={`${outfit.variable} ${playfairDisplay.variable} font-sans antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
            <div className="max-w-lg rounded-lg p-8 shadow-lg">
              <div className="mb-8 flex justify-center">
                {/* Light Mode Logo */}
                <Image
                  src={LOGO.default100}
                  className="block h-24 w-24 dark:hidden"
                  width={96}
                  height={96}
                  alt="Redentor church logo"
                  priority
                />
                {/* Dark Mode Logo */}
                <Image
                  src={LOGO.light100}
                  className="hidden h-24 w-24 dark:block"
                  width={96}
                  height={96}
                  alt="Redentor church logo"
                  priority
                />
              </div>
              <h1 className="mb-4 text-4xl font-bold text-foreground">
                {t("title")}
              </h1>
              <p className="mb-8 text-lg text-muted-foreground">
                {t("description")}
              </p>
              <div className="flex flex-col justify-center gap-4 sm:flex-row">
                <Link
                  key={locale}
                  href={`/${locale}`}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {t("backToHome")}
                </Link>
              </div>
            </div>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
