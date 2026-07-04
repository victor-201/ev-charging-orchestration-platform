/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['lucide-react'],
  output: 'export',
  images: { unoptimized: true },
}

module.exports = nextConfig
