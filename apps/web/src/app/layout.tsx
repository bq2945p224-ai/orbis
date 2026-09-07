import "./globals.css";
import type { Metadata } from "next";
import { AppNav } from "@/components/AppNav";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  title: "Orbis",
  description: "Persistent multiplayer society simulation",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,500;8..60,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-paper text-ink font-sans antialiased">
        <AppNav />
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        <Analytics />
      </body>
    </html>
  );
}
