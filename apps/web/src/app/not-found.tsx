import { LOGO } from "@idcr/ui";
import { routing } from "@src/i18n/routing";
import { getLocale, getTranslations } from "next-intl/server";
import { Nunito_Sans } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { ThemeProvider } from "next-themes";
import "./globals.css";

const nunitoSans = Nunito_Sans({
  subsets: ["latin"],
  variable: "--font-nunito-sans",
});

export default async function NotFound() {
  const locale = await getLocale();
  const t = await getTranslations("notFound");

  return (
    <html lang={routing.defaultLocale} suppressHydrationWarning>
      <body className={`${nunitoSans.variable} font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <div className="min-h-screen flex flex-col items-center justify-center text-center px-4 ">
            <div className="max-w-lg p-8  shadow-lg rounded-lg">
              <div className="flex justify-center mb-8">
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
              <h1 className="text-4xl font-bold mb-4 text-foreground">
                {t("title")}
              </h1>
              <p className="mb-8 text-lg text-muted-foreground">
                {t("description")}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
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
