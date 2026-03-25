import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

function isOAuthConfigured(): boolean {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? '';
  return (
    clientId.length > 0 &&
    clientId !== 'placeholder' &&
    clientSecret.length > 0 &&
    clientSecret !== 'placeholder'
  );
}

export const {
  handlers,
  auth,
  signIn: serverSignIn,
  signOut: serverSignOut,
} = NextAuth({
  providers: isOAuthConfigured()
    ? [
        Google({
          clientId: process.env.GOOGLE_CLIENT_ID ?? '',
          clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
        }),
      ]
    : [],
  pages: {
    signIn: '/auth/signin',
  },
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
      }
      return token;
    },
    async session({ session, token }) {
      return { ...session, accessToken: token.accessToken as string };
    },
    async authorized({ auth: session, request }) {
      const { pathname } = request.nextUrl;

      // Always allow auth routes, API routes, and static assets
      if (
        pathname.startsWith('/auth') ||
        pathname.startsWith('/api') ||
        pathname.startsWith('/_next') ||
        pathname === '/favicon.ico'
      ) {
        return true;
      }

      // If OAuth is not configured, allow unauthenticated access
      if (!isOAuthConfigured()) {
        return true;
      }

      // Otherwise require authentication
      return !!session?.user;
    },
  },
});
