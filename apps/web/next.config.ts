import path from "node:path";
import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import headersConfig from "./config/headers";

const withNextIntl = createNextIntlPlugin();
const nextConfig: NextConfig = {
  transpilePackages: ["@idcr/content", "@idcr/ui"],
  // Pin the tracing root to the monorepo root (outside apps/web) so Next resolves
  // workspace packages cleanly and silences the multi-lockfile inference warning.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        port: "",
      },
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
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
