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
  /* config options here */
};

export default process.env.NODE_ENV === "development" ? nextConfig : withSerwist(nextConfig);
