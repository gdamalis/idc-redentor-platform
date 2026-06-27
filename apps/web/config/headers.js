const securityHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'X-Frame-Options',
    value: 'SAMEORIGIN',
  },
  {
    key: 'Content-Security-Policy',
    // media-src allows the sermon <audio> element to stream from Contentful's asset CDN
    value: `frame-ancestors 'self' https://app.contentful.com https://app.eu.contentful.com; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com https://*.googletagmanager.com https://va.vercel-scripts.com; connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://va.vercel-scripts.com https://vitals.vercel-insights.com; img-src 'self' data: https://www.google-analytics.com https://*.google-analytics.com https://*.googletagmanager.com https://images.ctfassets.net https://images.eu.ctfassets.net https://images.unsplash.com; media-src 'self' https://assets.ctfassets.net https://assets.eu.ctfassets.net https://downloads.ctfassets.net`,
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
];

module.exports = async () => {
  return [
    {
      source: '/:path*',
      headers: securityHeaders,
    },
  ];
};
