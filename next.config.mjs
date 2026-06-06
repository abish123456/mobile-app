import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  // Ensure Next.js treats this directory as the app root when using Turbopack
  turbopack: {
    root: __dirname,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        pathname: '/**',
      },
    ],
  },
  basePath: '/shop',
  async redirects() {
    return [
      {
        source: '/',
        destination: '/shop',
        basePath: false,
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
