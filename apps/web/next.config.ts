import type { NextConfig } from "next";

const dynamicAllowedOrigins = (process.env.RELAY_ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: ["127.0.0.1", "localhost", "192.168.1.25", "100.108.149.37", ...dynamicAllowedOrigins],
};

export default nextConfig;
