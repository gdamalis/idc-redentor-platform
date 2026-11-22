import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import headersConfig from "./config/headers";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  transpilePackages: ["@idcr/content", "@idcr/ui"],
  // Keep serverless Chromium + Playwright unbundled; @playwright/test is a
  // devDependency only dynamically imported on local non-Vercel runs (ICR-114/200).
  serverExternalPackages: [
    "@sparticuz/chromium",
    "playwright-core",
    "@playwright/test",
  ],
  // Reproduce ICR-143's tracing fix for apps/admin's sermon PDF worker:
  // playwright-core loads browsers.json via a runtime-computed require that
  // @vercel/nft cannot see statically. Pin outputFileTracingRoot to the
  // monorepo root so the pnpm store path resolves consistently.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  outputFileTracingIncludes: {
    "/api/content/pdf-worker": [
      "../../node_modules/.pnpm/playwright-core@*/node_modules/playwright-core/browsers.json",
    ],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
        port: "",
      },
    ],
  },
  headers: headersConfig,
};

export default withNextIntl(nextConfig);
