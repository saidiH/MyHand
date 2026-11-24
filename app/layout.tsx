import type { Metadata, Viewport } from "next";
import "./globals.css";
import BottomNav from "@/components/BottomNav";

export const metadata: Metadata = {
  title: "MyHand — Bahasa Isyarat Malaysia",
  description:
    "Aplikasi dua hala Bahasa Isyarat Malaysia: kamera ke teks, suara/teks ke isyarat. Berfungsi luar talian.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "MyHand" },
};

export const viewport: Viewport = {
  themeColor: "#0b0e1a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ms">
      <body className="antialiased min-h-screen pb-20">
        <main className="max-w-lg mx-auto px-4 pt-4">{children}</main>
        <BottomNav />
      </body>
    </html>
  );
}
