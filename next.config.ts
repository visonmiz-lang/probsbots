import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Turbopack отключен для стабильной сборки на Vercel
  experimental: {
    // Оставляем пустым или добавляем только стабильные экспериментальные функции
  }
};

export default nextConfig;
