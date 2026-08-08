import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

// PWA (M2): Serwist precaches the app shell + static assets so /live opens
// instantly (and readable-from-cache) on flaky hotel wifi.
//
// Serwist integrates via webpack, so: `next build --webpack` (package.json) for
// production, and in dev we skip the wrapper ENTIRELY — Turbopack (the dev
// default) refuses to run with a webpack config present, and a stale service
// worker fighting HMR is nobody's friend anyway.
const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
});

// Security headers.
//
// The CSP here is deliberately limited to directives that cannot break
// rendering: no script-src/style-src, because Next's inline bootstrap and
// Tailwind would need a nonce pipeline that this app doesn't have yet. What it
// does buy is clickjacking cover (frame-ancestors, which cannot be set from a
// meta tag) plus base-uri/object-src/form-action, none of which the app uses.
const BASE_SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  {
    key: 'Content-Security-Policy',
    value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
  },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
];

// Routes whose ACCESS CONTROL IS THE URL ITSELF (follow tokens, invite tokens,
// digest confirm/unsubscribe tokens). The browser default would still send the
// origin to any third-party resource; `no-referrer` sends nothing at all, so a
// token cannot leak through a Referer header. X-Robots-Tag repeats the per-page
// `robots: { index: false }` at the transport level, where a crawler that never
// renders the page still sees it.
const TOKEN_ROUTE_HEADERS = [
  ...BASE_SECURITY_HEADERS,
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
];

const nextConfig: NextConfig = {
  env: {
    // Visible build identity (splash + Settings footer): lets the owner SEE
    // that an auto-update landed. Vercel injects the commit sha at build time.
    NEXT_PUBLIC_BUILD_SHA: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev',
  },
  async headers() {
    // Later entries win per header key, so the token routes' no-referrer
    // overrides the base policy for exactly those paths.
    return [
      { source: '/:path*', headers: BASE_SECURITY_HEADERS },
      { source: '/follow/:path*', headers: TOKEN_ROUTE_HEADERS },
      { source: '/invite/:path*', headers: TOKEN_ROUTE_HEADERS },
      { source: '/digest/:path*', headers: TOKEN_ROUTE_HEADERS },
      { source: '/api/digest/:path*', headers: TOKEN_ROUTE_HEADERS },
    ];
  },
};

export default process.env.NODE_ENV === "development" ? nextConfig : withSerwist(nextConfig);
