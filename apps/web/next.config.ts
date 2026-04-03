import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: ["127.0.0.1", "localhost", "192.168.1.25", "100.108.149.37"],
};

export default nextConfig;
