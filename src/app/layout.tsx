// src/app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import NavBar from "@/components/NavBar";
import { Toaster } from "sonner";
import prisma from "@/lib/prisma";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "777Galaxy",
  description: "Sistema de ruletas con Next.js",
};

async function getSettings() {
  try {
    // This might fail if Prisma Client is not generated yet
    return await prisma.systemSettings.findFirst();
  } catch (e) {
    console.error("Failed to load settings (Prisma not generated?)", e);
    return null;
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings();

  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {settings?.fontFamily && (
          <link
            href={`https://fonts.googleapis.com/css2?family=${settings.fontFamily.replace(/ /g, "+")}:wght@400;500;700&display=swap`}
            rel="stylesheet"
          />
        )}
        {settings?.faviconUrl && <link rel="icon" href={settings.faviconUrl} />}
        <style dangerouslySetInnerHTML={{
          __html: `
            :root {
              --font-primary: '${settings?.fontFamily || 'Inter'}', sans-serif;
              --background: ${settings?.backgroundColor || '#0f212e'};
              --card: ${settings?.secondaryColor || '#1a2c38'};
              --border: ${settings?.accentColor || '#2f4553'};
              --primary: ${settings?.primaryColor || '#10b981'};
              --foreground: ${settings?.textColor || '#ffffff'};
            }
          `
        }} />
      </head>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-dvh bg-background text-foreground`}
        style={settings?.fontFamily ? { fontFamily: `var(--font-primary)` } : {}}
      >
        <Providers>
          <NavBar />
          <div className="container-page">
            {children}
          </div>
          <Toaster position="top-center" richColors />
        </Providers>
      </body>
    </html>
  );
}
