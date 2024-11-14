/** @type {import('next').NextConfig} */
const nextConfig = {
    // API設定
    async rewrites() {
        return [
            {
                source: '/api/:path*',
                destination: '/api/:path*',
            },
        ];
    },
    // 実験的機能の設定
    experimental: {
        serverActions: {
            allowedOrigins: ["localhost:3000"],  // 開発環境用
            bodySizeLimit: '2mb'
        }
    }
};

export default nextConfig;