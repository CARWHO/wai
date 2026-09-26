import type { Metadata, Viewport } from "next";
import { Archivo, Chivo, Chivo_Mono } from "next/font/google";
import "./globals.css";

// Same fonts as the landing page (wai-web/index.html)
const chivo = Chivo({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-chivo" });
const mono = Chivo_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-chivo-mono" });
const logo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo" });

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
    <html lang="en-NZ" className={`${chivo.variable} ${mono.variable} ${logo.variable}`}>
      <body>{children}</body>
    </html>
  );
}
