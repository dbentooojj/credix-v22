function resolveLegacyBackendUrl() {
  const configured = process.env.LEGACY_BACKEND_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  return process.env.NODE_ENV === "development"
    ? "http://localhost:4000"
    : "http://backend:4000";
}

const legacyBackendUrl = resolveLegacyBackendUrl();
const legacyPageRoutes = [
  // A rota /login agora e renderizada pelo Next.
  "/dashboard",
  "/dashboard.html",
  "/dashboard-advanced.html",
  "/debtors.html",
  "/loans.html",
  "/installments.html",
  "/reports.html",
  "/account.html",
  "/admin",
];
const legacyStaticRoutes = [
  "/favicon.svg",
  "/favicon.ico",
  "/favicon-32x32.png",
  "/favicon-48x48.png",
  "/favicon-64x64.png",
  "/apple-touch-icon.png",
  "/android-chrome-192x192.png",
  "/android-chrome-512x512.png",
  "/site.webmanifest",
  "/health",
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: "/app/visao-geral",
        destination: "/app/carteira",
        permanent: false,
      },
      {
        source: "/visao-geral",
        destination: "/app/carteira",
        permanent: false,
      },
      {
        source: "/visao-geral.html",
        destination: "/app/carteira",
        permanent: false,
      },
      {
        source: "/admin/visao-geral.html",
        destination: "/app/carteira",
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return {
      afterFiles: [
        ...legacyPageRoutes.map((source) => ({
          source,
          destination: `${legacyBackendUrl}${source}`,
        })),
        ...legacyStaticRoutes.map((source) => ({
          source,
          destination: `${legacyBackendUrl}${source}`,
        })),
        {
          source: "/admin/:path*",
          destination: `${legacyBackendUrl}/admin/:path*`,
        },
        {
          source: "/auth/:path*",
          destination: `${legacyBackendUrl}/auth/:path*`,
        },
        {
          source: "/api/:path*",
          destination: `${legacyBackendUrl}/api/:path*`,
        },
        {
          source: "/scripts/:path*",
          destination: `${legacyBackendUrl}/scripts/:path*`,
        },
        {
          source: "/styles/:path*",
          destination: `${legacyBackendUrl}/styles/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
