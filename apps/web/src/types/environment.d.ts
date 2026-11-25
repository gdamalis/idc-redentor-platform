declare namespace NodeJS {
  interface ProcessEnv {
    // Base URL
    NEXT_PUBLIC_BASE_URL: string;
    
    // Vercel Environment
    VERCEL_ENV?: 'production' | 'preview' | 'development';
    VERCEL_TARGET_ENV?: string;

    // Content platform preview & revalidation
    CONTENT_PREVIEW_SECRET?: string;
    WEBSITE_REVALIDATE_SECRET?: string;
    CONTENT_PUBLISH_EMAILS?: string;

    // Resend Broadcasts
    RESEND_AUDIENCE_ID: string;
    RESEND_AUDIENCE_ID_ES_AR: string;
    RESEND_AUDIENCE_ID_EN_US: string;
    BROADCAST_POSTAL_ADDRESS: string;

    // Mail Provider
    MAIL_PROVIDER: 'sendgrid' | 'resend';
    CONTACT_FORM_RECIPIENT_EMAIL: string;
    FROM_EMAIL: string;
    
    // SendGrid
    SENDGRID_API_KEY: string;
    
    // Resend
    RESEND_API_KEY: string;
    
    // MongoDB
    MONGODB_URI: string;

    // Sentry (observability) — see docs/architecture/observability-sentry.md
    NEXT_PUBLIC_SENTRY_DSN?: string;
    NEXT_PUBLIC_SENTRY_ENVIRONMENT?: string;
    // Injected automatically by Vercel — the browser-readable mirror of VERCEL_ENV.
    // Normally left unset locally; see resolveSentryEnvironment() in
    // src/utils/sentry/options.ts for why this is in the fallback chain.
    NEXT_PUBLIC_VERCEL_ENV?: 'production' | 'preview' | 'development';
    SENTRY_ORG?: string;
    SENTRY_PROJECT?: string;
    SENTRY_AUTH_TOKEN?: string;
  }
}