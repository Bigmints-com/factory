import { NextRequest } from 'next/server';
import { authMiddleware } from '@saveaday/shared-auth/middleware';

// Define public routes that don't require authentication
const publicRoutes = [
    '/',
    '/api/public/*',
    '/api/health',
    '/embed/*',
];

export default function middleware(request: NextRequest) {
    return authMiddleware(request, {
        publicRoutes,
        loginPath: '/login',
        redirectTo: '/dashboard',
    });
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public folder
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
};
