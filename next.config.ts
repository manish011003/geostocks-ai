import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The Earth night texture is loaded directly by Three.js (TextureLoader)
  // from unpkg; nothing needed here, but listed for visibility.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "unpkg.com" },
    ],
  },
};

export default nextConfig;
