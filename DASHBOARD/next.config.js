/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  poweredByHeader: false,
  compress: true,
  productionBrowserSourceMaps: false,
  // Lint remains a separate production gate via `pnpm lint`.
  eslint: { ignoreDuringBuilds: true },
  modularizeImports: {
    "@mui/icons-material": {
      transform: "@mui/icons-material/{{member}}",
    },
  },
  experimental: {
    optimizePackageImports: [
      "@mui/material",
      "@mui/icons-material",
      "@mui/x-data-grid",
      "@refinedev/core",
      "@refinedev/mui",
      "recharts",
      "date-fns",
    ],
  },
};

module.exports = nextConfig;
