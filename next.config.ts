import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // lets phones on the LAN load dev JS (otherwise the page never hydrates)
  allowedDevOrigins: ["10.196.146.57", "*.local"],
};

export default nextConfig;
