import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/*": ["./node_modules/.prisma/client/**/*", "./prisma/migrations/**/*"]
  }
};

export default nextConfig;
