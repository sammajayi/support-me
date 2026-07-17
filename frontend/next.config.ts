import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Avatars are served from Cloudinary after a signed upload.
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
    ],
  },
};

export default nextConfig;
