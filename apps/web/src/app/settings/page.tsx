'use client';

import { useState, useEffect, useCallback } from 'react';

interface OAuthSettings {
  googleClientId: string;
  googleClientSecret: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function SettingsPage() {
  const [settings, setSettings] = useState<OAuthSettings>({
    googleClientId: '',
    googleClientSecret: '',
  });
  const [maskedSettings, setMaskedSettings] = useState<OAuthSettings>({
    googleClientId: '',
    googleClientSecret: '',
  });
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/settings`);
      if (!res.ok) throw new Error('Failed to fetch settings');
      const data = await res.json();
      setMaskedSettings({
        googleClientId: data.googleClientId ?? '',
        googleClientSecret: data.googleClientSecret ?? '',
      });
      setSettings({
        googleClientId: '',
        googleClientSecret: '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage(null);
    setError(null);
    try {
      const payload: Record<string, string> = {};
      if (settings.googleClientId) payload.googleClientId = settings.googleClientId;
      if (settings.googleClientSecret) payload.googleClientSecret = settings.googleClientSecret;

      if (Object.keys(payload).length === 0) {
        setSaveMessage('No changes to save.');
        setSaving(false);
        return;
      }

      const res = await fetch(`${API_BASE}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to save settings');
      setSaveMessage('Settings saved successfully. Restart the app to apply OAuth changes.');
      setEditing(false);
      await fetchSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${API_BASE}/settings/test-oauth`, {
        method: 'POST',
      });
      const data = await res.json();
      setTestResult({
        success: data.success ?? false,
        message: data.message ?? 'Unknown result',
      });
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Test failed',
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Settings</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Configure application-level settings for Orchestra.
        </p>
      </div>

      {/* Google OAuth Configuration */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
              <svg className="h-5 w-5 text-blue-400" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--foreground)]">Google OAuth</h2>
              <p className="text-sm text-[var(--muted-foreground)]">
                Configure Google OAuth credentials for user authentication.
              </p>
            </div>
          </div>
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
            >
              Edit
            </button>
          )}
        </div>

        <div className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
              Client ID
            </label>
            {editing ? (
              <input
                type="text"
                value={settings.googleClientId}
                onChange={(e) => setSettings((s) => ({ ...s, googleClientId: e.target.value }))}
                placeholder={maskedSettings.googleClientId || 'Enter Google Client ID'}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
              />
            ) : (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-2.5 text-sm text-[var(--muted-foreground)] font-mono">
                {maskedSettings.googleClientId || 'Not configured'}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
              Client Secret
            </label>
            {editing ? (
              <input
                type="password"
                value={settings.googleClientSecret}
                onChange={(e) => setSettings((s) => ({ ...s, googleClientSecret: e.target.value }))}
                placeholder={maskedSettings.googleClientSecret || 'Enter Google Client Secret'}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
              />
            ) : (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-2.5 text-sm text-[var(--muted-foreground)] font-mono">
                {maskedSettings.googleClientSecret || 'Not configured'}
              </div>
            )}
          </div>

          {editing && (
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setSettings({ googleClientId: '', googleClientSecret: '' });
                }}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          {!editing && (
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleTest}
                disabled={testing}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors disabled:opacity-50"
              >
                {testing ? 'Testing...' : 'Test Connection'}
              </button>
            </div>
          )}

          {testResult && (
            <div
              className={`mt-3 rounded-lg px-4 py-3 text-sm ${
                testResult.success
                  ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                  : 'bg-red-500/10 text-red-400 border border-red-500/20'
              }`}
            >
              {testResult.message}
            </div>
          )}

          {saveMessage && (
            <div className="mt-3 rounded-lg bg-green-500/10 border border-green-500/20 px-4 py-3 text-sm text-green-400">
              {saveMessage}
            </div>
          )}

          {error && (
            <div className="mt-3 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">How to get Google OAuth credentials</h3>
        <ol className="mt-3 list-decimal list-inside space-y-2 text-sm text-[var(--muted-foreground)]">
          <li>
            Go to the{' '}
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--primary)] hover:underline"
            >
              Google Cloud Console
            </a>
          </li>
          <li>Create a new OAuth 2.0 Client ID (Web application type)</li>
          <li>
            Add <code className="rounded bg-[var(--muted)] px-1.5 py-0.5 text-xs font-mono">http://localhost:3000/api/auth/callback/google</code> as an authorized redirect URI
          </li>
          <li>Copy the Client ID and Client Secret into the fields above</li>
          <li>Set <code className="rounded bg-[var(--muted)] px-1.5 py-0.5 text-xs font-mono">GOOGLE_CLIENT_ID</code> and <code className="rounded bg-[var(--muted)] px-1.5 py-0.5 text-xs font-mono">GOOGLE_CLIENT_SECRET</code> environment variables and restart the app</li>
        </ol>
      </div>
    </div>
  );
}
