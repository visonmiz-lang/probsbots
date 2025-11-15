import type { NextConfig } from "next";

const nextConfig = {
  experimental: {
    turbo: false // Отключаем Turbopack
  }
}

module.exports = nextConfig
