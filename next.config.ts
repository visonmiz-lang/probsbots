/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Явно отключаем Turbopack
  experimental: {
    turbo: {
      rules: {}
    }
  }
}

module.exports = nextConfig
