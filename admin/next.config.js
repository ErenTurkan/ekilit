/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'api.e-kilit.com',
      },
    ],
  },
  // Suppress hydration warnings for dynamic content
  reactStrictMode: false,
};

module.exports = nextConfig;
