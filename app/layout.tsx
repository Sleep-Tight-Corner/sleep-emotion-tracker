import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const isGitHubPages = process.env.GITHUB_PAGES === "true";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "孩子睡眠與情緒觀察工具｜安睡角落",
  description: "快速記錄孩子的睡眠、情緒、特殊事件與日常觀察。",
  manifest: `${basePath}/manifest.webmanifest`,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "安睡觀察",
  },
  other: isGitHubPages ? undefined : { "codex-preview": "development" },
  icons: {
    icon: `${basePath}/brand/icon-192.png`,
    shortcut: `${basePath}/brand/icon-192.png`,
    apple: `${basePath}/brand/apple-touch-icon.png`,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
