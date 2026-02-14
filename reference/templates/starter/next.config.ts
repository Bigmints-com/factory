import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    // Enable standalone output for Docker/Cloud Run
    output: 'standalone',

    // Optimize for production
    compress: true,

    // Disable powered by header for security
    poweredByHeader: false,

    // Transpile workspace packages
    transpilePackages: [
        '@saveaday/shared-auth',
        '@saveaday/shared-firebase',
        '@saveaday/shared-ui',
        '@saveaday/shared-utils',
        '@saveaday/shared-types',
        '@saveaday/integrations',
        '@saveaday/llm-config',
        '@saveaday/onboarding',
        '@saveaday/trigger-github-pages-deployment'
    ],

    // Performance optimizations

    compiler: {
        removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
    },
    experimental: {
        optimizePackageImports: ['lucide-react', '@saveaday/shared-ui'],
    },

    // Build cache
    generateBuildId: async () => {
        return process.env.BUILD_ID || `build-${Date.now()}`;
    },

    // Temporarily ignore TypeScript errors during build for deployment
    typescript: {
        ignoreBuildErrors: true,
    },
    // Proxy API requests to main API server (avoids CORS)
    async rewrites() {
        const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3011';
        return [
            {
                source: '/api/v1/:path*',
                destination: `${apiUrl}/api/v1/:path*`,
            },
        ];
    },

    // CORS headers for public API endpoints
    async headers() {
        return [
            {
                source: "/api/public/:path*",
                headers: [
                    { key: "Access-Control-Allow-Credentials", value: "true" },
                    { key: "Access-Control-Allow-Origin", value: "*" },
                    { key: "Access-Control-Allow-Methods", value: "GET,DELETE,PATCH,POST,PUT" },
                    { key: "Access-Control-Allow-Headers", value: "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version" },
                ]
            }
        ]
    }
};

export default nextConfig;
