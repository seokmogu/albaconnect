import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@albaconnect/shared", "@wxpr/icons", "@wxpr/react", "@wxpr/tokens"],
}

export default nextConfig
