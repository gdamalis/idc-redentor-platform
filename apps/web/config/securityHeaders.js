const SCRIPT_SRC =
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com https://*.googletagmanager.com https://va.vercel-scripts.com";
const CONNECT_SRC =
  "connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://va.vercel-scripts.com https://vitals.vercel-insights.com";
const IMG_SRC =
  "img-src 'self' data: https://www.google-analytics.com https://*.google-analytics.com https://*.googletagmanager.com https://images.ctfassets.net https://images.eu.ctfassets.net https://images.unsplash.com https://*.public.blob.vercel-storage.com";
// media-src allows the sermon <audio> element to stream from Contentful's asset CDN (until ICR-207) and Vercel Blob public stores
const MEDIA_SRC =
  "media-src 'self' https://assets.ctfassets.net https://assets.eu.ctfassets.net https://downloads.ctfassets.net https://*.public.blob.vercel-storage.com";

function buildCsp() {
  return [
    "frame-ancestors 'self'",
    SCRIPT_SRC,
    CONNECT_SRC,
    IMG_SRC,
    MEDIA_SRC,
  ].join("; ");
}

function buildSecurityHeaders(_options = {}) {
  return [
    { key: "X-DNS-Prefetch-Control", value: "on" },
    {
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    },
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    { key: "Content-Security-Policy", value: buildCsp() },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-XSS-Protection", value: "1; mode=block" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  ];
}

module.exports = { buildSecurityHeaders };
