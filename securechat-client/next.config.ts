import type { NextConfig } from "next";
import withPWA from "next-pwa";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  // Add empty turbopack config to silence the warning
  // PWA is disabled in development anyway
  turbopack: {},
};

export default withPWA({
  dest: "public",
  register: true,
  skipWaiting: true,
  // next-pwa auto-detects worker/ directory (customWorkerDir defaults to "worker")
  // Set ENABLE_PWA=true to test PWA in development
  disable: process.env.NODE_ENV === "development" && process.env.ENABLE_PWA !== "true",
} as Parameters<typeof withPWA>[0])(nextConfig);
