/** @type {import('next').NextConfig} */
const nextConfig = {
    experimental: {
        serverActions: false
    },
    webpack: (config) => {
        config.externals = [...config.externals, 'prisma', 'prisma/client'];
        return config;
    }
};

export default nextConfig;