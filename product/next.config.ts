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

const nextConfig: NextConfig = {
  env: {
    // Visible build identity (splash + Settings footer): lets the owner SEE
    // that an auto-update landed. Vercel injects the commit sha at build time.
    NEXT_PUBLIC_BUILD_SHA: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev',
  },
};

export default process.env.NODE_ENV === "development" ? nextConfig : withSerwist(nextConfig);
