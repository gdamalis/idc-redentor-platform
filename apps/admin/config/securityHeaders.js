const DEFAULT_SRC = "default-src 'self'";
// Firebase Auth (email/password + Google popup sign-in) requires Google APIs scripts & frames.
const SCRIPT_SRC =
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://www.gstatic.com";
const STYLE_SRC = "style-src 'self' 'unsafe-inline'";
// connect-src allows direct client uploads to Vercel Blob (`vercel.com/api/blob` + `*.blob.vercel-storage.com`)
// and Firebase Auth endpoints (`identitytoolkit`, `securetoken`, `googleapis`, `firebaseapp`).
const CONNECT_SRC =
  "connect-src 'self' https://vercel.com https://*.blob.vercel-storage.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com https://apis.google.com https://*.firebaseapp.com";
const FRAME_SRC =
  "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com";
// img-src / media-src allow `blob:` for local upload previews/metadata probing and Vercel Blob public CDN previews.
const IMG_SRC =
  "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com https://lh3.googleusercontent.com";
const MEDIA_SRC =
  "media-src 'self' blob: https://*.public.blob.vercel-storage.com";
const FRAME_ANCESTORS = "frame-ancestors 'none'";
const OBJECT_SRC = "object-src 'none'";
const BASE_URI = "base-uri 'self'";
const FORM_ACTION = "form-action 'self'";

function buildAdminCsp() {
  return [
    FRAME_ANCESTORS,
    DEFAULT_SRC,
    SCRIPT_SRC,
    STYLE_SRC,
    CONNECT_SRC,
    FRAME_SRC,
    IMG_SRC,
    MEDIA_SRC,
    OBJECT_SRC,
    BASE_URI,
    FORM_ACTION,
  ].join("; ");
}

/**
 * Baseline security headers for `apps/admin` (`ICR-196` AC8, cross-referenced with `ICR-188`).
 * Stricter than `apps/web` (never framed: `X-Frame-Options: DENY` + `frame-ancestors 'none'`;
 * no Contentful/GTM/Unsplash allowlist) while allowing Vercel Blob uploads/previews and Firebase Auth.
 */
function buildAdminSecurityHeaders() {
  return [
    { key: "X-DNS-Prefetch-Control", value: "on" },
    {
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Content-Security-Policy", value: buildAdminCsp() },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  ];
}

module.exports = { buildAdminSecurityHeaders };
