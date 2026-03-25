'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';

export default function SignInPage() {
  const [ssoTooltip, setSsoTooltip] = useState(false);

  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CONFIGURED;
  const isOAuthConfigured = googleClientId !== 'false' && googleClientId !== undefined;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)]">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 shadow-xl">
          {/* Logo */}
          <div className="mb-8 flex flex-col items-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--primary)]">
              <svg className="h-8 w-8 text-[var(--primary-foreground)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <h1 className="mt-4 text-2xl font-bold text-[var(--foreground)]">Orchestra</h1>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">Agentic Coding Workflow Platform</p>
          </div>

          {/* Buttons */}
          <div className="space-y-3">
            <button
              onClick={() => {
                if (!isOAuthConfigured) return;
                signIn('google', { callbackUrl: '/' });
              }}
              disabled={!isOAuthConfigured}
              className={`flex w-full items-center justify-center gap-3 rounded-lg px-4 py-3 text-sm font-medium shadow-sm transition-colors ${
                isOAuthConfigured
                  ? 'bg-white text-gray-900 hover:bg-gray-50 cursor-pointer'
                  : 'bg-gray-200 text-gray-500 cursor-not-allowed'
              }`}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              {isOAuthConfigured ? 'Sign in with Google' : 'Configure Google OAuth in Settings first'}
            </button>

            {!isOAuthConfigured && (
              <p className="text-center text-xs text-amber-400">
                Google OAuth credentials are not configured. Go to{' '}
                <a href="/settings" className="underline hover:text-amber-300">Settings</a>{' '}
                to set up authentication.
              </p>
            )}

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[var(--border)]" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-[var(--card)] px-2 text-[var(--muted-foreground)]">or</span>
              </div>
            </div>

            <div className="relative">
              <button
                onMouseEnter={() => setSsoTooltip(true)}
                onMouseLeave={() => setSsoTooltip(false)}
                className="flex w-full items-center justify-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-medium text-[var(--muted-foreground)] cursor-not-allowed opacity-60 transition-colors"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
                Sign in with SSO
              </button>
              {ssoTooltip && (
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 rounded-md bg-[var(--foreground)] px-3 py-1.5 text-xs text-[var(--background)] shadow-lg whitespace-nowrap">
                  Coming soon
                  <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-[var(--foreground)]" />
                </div>
              )}
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-[var(--muted-foreground)]">
            By signing in, you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
}
