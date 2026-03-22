/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "bcryptjs"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.sunoapi.org",
      },
      {
        protocol: "https",
        hostname: "**.removeai.ai",
      },
      {
        protocol: "https",
        hostname: "**.redpandaai.co",
      },
      {
        protocol: "https",
        hostname: "**.sunoapi.org",
      },
    ],
  },
};

let config = nextConfig;

if (process.env.ANALYZE === "true") {
  const withBundleAnalyzer = (await import("@next/bundle-analyzer")).default;
  config = withBundleAnalyzer({ enabled: true })(nextConfig);
}

export default config;
