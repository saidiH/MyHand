/** @type {import('next').NextConfig} */
// D: was exFAT — symlink resolution breaks webpack there (EISDIR); keep on NTFS C:.
// PWA: next-pwa provides offline caching of the app shell, MediaPipe assets and models (FR-034).
const withPWA = require("next-pwa")({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  runtimeCaching: [
    {
      // MediaPipe WASM + models + sign assets: cache-first, they change only with new packs
      urlPattern: /^\/(mediapipe|models)\/.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "myhand-ai-assets",
        expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 30 },
        cacheableResponse: { statuses: [200] },
      },
    },
    {
      // static chunks: stale-while-revalidate
      urlPattern: /\/_next\/static\/.*/i,
      handler: "StaleWhileRevalidate",
      options: { cacheName: "myhand-static", expiration: { maxEntries: 128 } },
    },
  ],
});

const isGH = process.env.GITHUB_PAGES === "1";
const nextConfig = {
  // GitHub Pages serves from /MyHand/ — base path + asset prefix required
  ...(isGH ? { output: "export", basePath: "/MyHand", assetPrefix: "/MyHand" } : {}),
  ...(isGH ? { images: { unoptimized: true } } : {}),
  webpack: (config) => {
    config.resolve.symlinks = false;
    return config;
  },
};

module.exports = withPWA(nextConfig);
