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
  // Set ENABLE_PWA=true to test PWA in development
  disable: process.env.NODE_ENV === "development" && process.env.ENABLE_PWA !== "true",
})(nextConfig);
