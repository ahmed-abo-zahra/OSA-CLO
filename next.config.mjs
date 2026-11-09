const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
let supabaseHostname;

if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_DEMO_MODE === 'true') {
  throw new Error('NEXT_PUBLIC_DEMO_MODE must be false for every production build or runtime.');
}

if (supabaseUrl) {
  try {
    supabaseHostname = new URL(supabaseUrl).hostname;
  } catch {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL must be a valid URL.');
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  images: {
    remotePatterns: supabaseHostname
      ? [{ protocol: 'https', hostname: supabaseHostname, pathname: '/storage/v1/object/public/**' }]
      : [],
    formats: ['image/avif', 'image/webp'],
  },
  async headers() {
    const securityHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      {
        key: 'Content-Security-Policy',
        value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.vercel.app; frame-ancestors 'none';",
      },
    ];

    if (process.env.VERCEL_ENV === 'production') {
      securityHeaders.push({ key: 'Strict-Transport-Security', value: 'max-age=31536000' });
    }

    const privateNoStore = [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }];
    return [
      { source: '/admin/:path*', headers: privateNoStore },
      { source: '/api/admin/:path*', headers: privateNoStore },
      { source: '/api/account/:path*', headers: privateNoStore },
      { source: '/api/checkout', headers: privateNoStore },
      { source: '/api/discount/validate', headers: privateNoStore },
      { source: '/api/reviews', headers: privateNoStore },
      { source: '/api/track', headers: privateNoStore },
      { source: '/api/track/:path*', headers: privateNoStore },
      { source: '/:path*', headers: securityHeaders },
    ];
  },
};

export default nextConfig;
