import { ThemeProvider } from "@src/components/theme/theme-provider";
import { routing } from "@src/i18n/routing";
import { Metadata } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { Outfit, Playfair_Display } from "next/font/google";
import { notFound } from "next/navigation";
import "../globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
});

export const metadata: Metadata = {
  // Guarded, not defaulted: NEXT_PUBLIC_ADMIN_BASE_URL is unset until ICR-141
  // provisions the Vercel project env. `new URL(undefined)` throws at build time,
  // so metadataBase is simply omitted when the env is absent (AC8: the scaffold
  // must build green with no Firebase/Mongo/base-url env set).
  ...(process.env.NEXT_PUBLIC_ADMIN_BASE_URL
    ? { metadataBase: new URL(process.env.NEXT_PUBLIC_ADMIN_BASE_URL) }
    : {}),
  title: {
    template: "%s | Ministry Admin Panel",
    default: "Ministry Admin Panel",
  },
  description: "Internal ministry admin panel for Iglesia de Cristo Redentor.",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  readonly children: React.ReactNode;
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  const messages = await getMessages();

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
          <NextIntlClientProvider messages={messages}>
            {children}
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
