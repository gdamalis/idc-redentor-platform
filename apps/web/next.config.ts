import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import headersConfig from "./config/headers";

const withNextIntl = createNextIntlPlugin();
const nextConfig: NextConfig = {
  transpilePackages: ["@idcr/ui"],
  // @playwright/test is a devDependency, only ever dynamically imported behind the
  // renderSermonPdf.ts local/dev branch (ICR-114) — externalizing it here stops
  // webpack from tracing/bundling it into the Vercel function even though it's a
  // dynamic import; that branch never runs in a Vercel/Lambda environment.
  serverExternalPackages: ["@sparticuz/chromium", "playwright-core", "@playwright/test"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.ctfassets.net",
        port: "",
      },
      {
        protocol: "https",
        hostname: "images.eu.ctfassets.net",
        port: "",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        port: "",
      },
    ],
  },
  headers: headersConfig,
};

export default withNextIntl(nextConfig);
