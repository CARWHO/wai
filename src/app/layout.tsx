import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-geist" });
// Geist Mono, as on the landing page: same proportions as Geist
const mono = Geist_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "Wai",
  description: "Water and soil monitoring for NZ farms",
  appleWebApp: { capable: true, title: "Wai", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f6f5f1",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-NZ" className={`${geist.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
