export { auth as middleware } from '@/lib/auth';

export const config = {
  matcher: [
    // Protect all routes except auth, API, static assets, and favicon
    '/((?!auth|api|_next/static|_next/image|favicon.ico).*)',
  ],
};
