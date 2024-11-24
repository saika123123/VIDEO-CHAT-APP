/** @type {import('next').NextConfig} */
const nextConfig = {
    experimental: {
        serverActions: false
    },
    webpack: (config) => {
        config.externals = [...config.externals, 'prisma', 'prisma/client'];
        return config;
    },
    // 静的ファイルの設定を追加
    images: {
        domains: ['localhost'],
    },
    // publicディレクトリの設定
    assetPrefix: '',
    // public directory configuration
    publicRuntimeConfig: {
        staticFolder: '/public',
    }
};

export default nextConfig;