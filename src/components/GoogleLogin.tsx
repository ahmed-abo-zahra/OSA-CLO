'use client';

import { useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useLanguage } from '@/context/LanguageContext';

interface GoogleLoginProps {
  redirectTo?: string;
  className?: string;
}

export default function GoogleLogin({
  redirectTo,
  className = '',
}: GoogleLoginProps) {
  const supabase = createClientComponentClient();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);

    const callbackUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}/api/auth/google/callback`
        : '/api/auth/google/callback';

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectTo ?? callbackUrl,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });

    if (oauthError) {
      setError(t('auth.google.error'));
      setLoading(false);
    }
    // On success, browser redirects — no need to setLoading(false)
  };

  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      <button
        onClick={handleGoogleLogin}
        disabled={loading}
        className="
          flex items-center justify-center gap-3
          w-full px-6 py-3 rounded-xl
          bg-white dark:bg-zinc-900
          border border-zinc-200 dark:border-zinc-700
          text-zinc-800 dark:text-zinc-100
          font-medium text-sm
          shadow-sm hover:shadow-md
          transition-all duration-200
          hover:bg-zinc-50 dark:hover:bg-zinc-800
          disabled:opacity-50 disabled:cursor-not-allowed
          focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-zinc-400
        "
        aria-label={t('auth.google.button')}
      >
        {loading ? (
          <svg
            className="animate-spin h-5 w-5 text-zinc-500"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        ) : (
          <GoogleIcon />
        )}
        <span>
          {loading ? t('auth.google.loading') : t('auth.google.button')}
        </span>
      </button>

      {error && (
        <p className="text-sm text-red-500 text-center" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"
      />
      <path
        fill="#34A853"
        d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"
      />
      <path
        fill="#FBBC05"
        d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18l2.67-2.07z"
      />
      <path
        fill="#EA4335"
        d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.3z"
      />
    </svg>
  );
}
