import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Allow iframe embedding on universaleverything.io (and localhost for dev)
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self' https://universaleverything.io https://*.universaleverything.io http://localhost:*",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
