import type { NextConfig } from "next";

const config: NextConfig = {
	reactStrictMode: true,
	serverExternalPackages: ["@vercel/sandbox"],
	experimental: {
		optimizePackageImports: ["react-markdown", "rehype-highlight"],
	},
};

export default config;
