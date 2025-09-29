/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },

  // 👇 mueve aquí (nivel raíz)
  outputFileTracingRoot: '/root/ruleta12',
};

export default nextConfig;

