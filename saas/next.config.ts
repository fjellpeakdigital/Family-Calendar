import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // node-ical pulls in CommonJS deps (rrule, ical.js shims) and registers
  // timezone tables at module load. Treat it as an external Node package so
  // Next.js doesn't try to bundle or evaluate it during page-data collection.
  serverExternalPackages: ['node-ical'],
};

export default nextConfig;
