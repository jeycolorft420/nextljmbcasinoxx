import type { NextConfig } from "next";
import "./src/modules/ui/lib/env"; // 👈 Validate env vars on import

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    unoptimized: true,
  },
  webpack: (config, { dev, isServer }) => {
    // Solo ofuscar en producción y en el cliente (para no romper el server si no es necesario)
    // O ofuscar todo si queremos máxima seguridad.
    // Nota: Ofuscar el server puede causar problemas con Next.js (por las rutas dinámicas).
    // Empezamos solo con el cliente.
    // Solo ofuscar si se habilita explícitamente (ahorra RAM en build)
    if (!dev && !isServer && process.env.ENABLE_OBFUSCATION === "true") {
      const WebpackObfuscator = require('webpack-obfuscator');
      config.plugins.push(
        new WebpackObfuscator({
          rotateStringArray: true,
          stringArray: true,
          stringArrayEncoding: ['rc4'],
          stringArrayThreshold: 0.75,
          compact: true,
          controlFlowFlattening: true,
          controlFlowFlatteningThreshold: 0.75,
          deadCodeInjection: true,
          deadCodeInjectionThreshold: 0.4,
          debugProtection: false,
          disableConsoleOutput: true,
          identifierNamesGenerator: 'hexadecimal',
          log: false,
          renameGlobals: false,
          selfDefending: true,
          splitStrings: true,
          splitStringsChunkLength: 10,
        }, [])
      );
    }
    return config;
  },
};

export default nextConfig;
