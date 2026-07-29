import path from "node:path";
import { withSentryConfig } from "@sentry/nextjs";
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
  // playwright-core loads browsers.json through a RUNTIME-computed require
  // (lib/coreBundle.js: `require(path.join(packageRoot, "browsers.json"))`), which
  // @vercel/nft's static analysis cannot see — so it never lands in the Lambda and the
  // sermon-PDF cron fails forever with "Cannot find module …/browsers.json" (ICR-143).
  // The package resolves to the REPO-ROOT pnpm store, outside apps/web, so the tracing
  // root must be pinned to the monorepo root as well. Pinning it also silences Next's
  // "inferred your workspace root, but it may not be correct" multi-lockfile warning.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  outputFileTracingIncludes: {
    "/api/predica/regenerate-pdf/cron": [
      "../../node_modules/.pnpm/playwright-core@*/node_modules/playwright-core/browsers.json",
    ],
  },
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

export default withSentryConfig(withNextIntl(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Only log source-map upload noise in CI.
  silent: !process.env.CI,
  widenClientFileUpload: true,
  // Same-origin tunnel: browser events POST to /monitoring and the server
  // forwards them. Keeps the CSP untouched and dodges ad-blockers.
  // NOTE: /monitoring MUST stay excluded from the src/proxy.ts matcher.
  tunnelRoute: "/monitoring",
});
