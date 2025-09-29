import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import NavBar from "@/components/NavBar"; // 👈 importa el navbar

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Ruleta12",
  description: "Sistema de ruletas con Next.js",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-dvh bg-black text-white`}
      >
        <Providers>
          <NavBar />
          <div className="mx-auto max-w-6xl px-4 py-6">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
