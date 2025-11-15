/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  eslint: {
    // ИГНОРИРУЕМ ESLint ошибки при сборке
    ignoreDuringBuilds: true,
  },
  typescript: {
    // ИГНОРИРУЕМ TypeScript ошибки при сборке  
    ignoreBuildErrors: true,
  },
}

module.exports = nextConfig
