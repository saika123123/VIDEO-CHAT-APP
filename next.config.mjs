/** @type {import('next').NextConfig} */
const nextConfig = {
    experimental: {
        serverActions: false
    },
    webpack: (config) => {
        config.externals = [...config.externals, 'prisma', 'prisma/client'];
        return config;
    },
    // ベースパスの設定を追加
    basePath: '/yoriai',
    // 静的ファイルの設定を追加
    images: {
        domains: ['localhost'],
    },
    // publicディレクトリの設定
    assetPrefix: '/yoriai',
    // public directory configuration
    publicRuntimeConfig: {
        staticFolder: '/yoriai/public',
    }
};

export default nextConfig;