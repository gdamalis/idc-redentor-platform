declare namespace NodeJS {
  interface ProcessEnv {
    // MongoDB — ONE connection string per database (ICR-166). The DB name rides
    // in each URI's PATH (see .env.example) — there is deliberately no separate
    // DB-name env var. Each is read by exactly one accessor in
    // src/service/database.service.ts, which asserts the resolved name.
    // See docs/architecture/admin-database.md.
    // -> ministry-admin | ministry-admin-staging | ministry-admin-test |
    //    ministry-admin-qa | ministry-admin-e2e (getAdminDb)
    MONGODB_URI: string;
    // -> website | website-staging | website-test | website-qa | website-e2e
    //    (getContentDb)
    WEBSITE_MONGODB_URI: string;

    // Base URL
    NEXT_PUBLIC_ADMIN_BASE_URL: string;
    // Public church website, linked from /no-access. Optional — code falls
    // back to the production site when unset.
    NEXT_PUBLIC_WEBSITE_URL: string;

    // Firebase — client SDK (browser-safe)
    NEXT_PUBLIC_FIREBASE_API_KEY: string;
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: string;
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: string;
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: string;
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: string;
    NEXT_PUBLIC_FIREBASE_APP_ID: string;

    // Firebase — Admin SDK (server-only service account)
    FIREBASE_PROJECT_ID: string;
    FIREBASE_CLIENT_EMAIL: string;
    FIREBASE_PRIVATE_KEY: string;

    // Email — invite + password-reset flows (server-only)
    RESEND_API_KEY: string;
    FROM_EMAIL: string;

    // Content platform — post-commit site revalidation & publish-email gate (ICR-195)
    // Server-only, NO fallback (never reads NEXT_PUBLIC_WEBSITE_URL).
    WEBSITE_REVALIDATE_URL?: string;
    WEBSITE_REVALIDATE_SECRET?: string;
    // Global publish-email switch: off unless explicitly "true".
    CONTENT_PUBLISH_EMAILS?: string;
    // Injected by Vercel ("production" | "preview" | "staging" | "development").
    VERCEL_TARGET_ENV?: string;

    // Content platform — signed preview opener & pre-cutover trial mode (ICR-197)
    // Server-only, NEVER NEXT_PUBLIC_*.
    CONTENT_PREVIEW_SECRET?: string;
    // Optional preview website origin; falls back to WEBSITE_REVALIDATE_URL.
    WEBSITE_PREVIEW_URL?: string;
    // Pre-cutover trial mode banner: active unless explicitly "false" (flipped by ICR-206).
    CONTENT_TRIAL_MODE?: string;

    // File storage — Vercel Blob (ICR-196, server-only, NEVER in apps/web)
    // Production -> idcr-media; Preview/staging/Development -> idcr-media-staging.
    BLOB_READ_WRITE_TOKEN?: string;
    // Reserved for ICR-177 private finance invoice attachments store.
    FINANCE_BLOB_READ_WRITE_TOKEN?: string;
  }
}
