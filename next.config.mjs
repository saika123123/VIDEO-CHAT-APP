/** @type {import('next').NextConfig} */
const nextConfig = {
  assetPrefix: "/yoriai",
  experimental: {
    serverActions: false
  },
  webpack: (config) => {
    config.externals = [...config.externals, 'prisma', 'prisma/client'];
    return config;
  },
  async rewrites() {
    return [
      {
        source: "/yoriai/api/:path*",
        destination: "/api/:path*",
      },
      {
        source: "/yoriai/_next/:path*",
        destination: "/_next/:path*",
      },
      {
        source: "/yoriai/socket.io/:path*",
        destination: "/socket.io/:path*",
      },
      {
        source: "/yoriai/:path*",
        destination: "/:path*",
      },
    ];
  },
};

export default nextConfig;
