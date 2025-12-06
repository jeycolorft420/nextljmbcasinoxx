// src/app/providers.tsx
'use client';

import { SessionProvider } from "next-auth/react";
import { WalletProvider } from "@/hooks/use-wallet";
import { AudioProvider } from "@/context/AudioContext";
import { LicenseProvider } from "@/context/LicenseContext";
import type { ReactNode } from "react";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <WalletProvider>
        <AudioProvider>
          <LicenseProvider>
            {children}
          </LicenseProvider>
        </AudioProvider>
      </WalletProvider>
    </SessionProvider>
  );
}
