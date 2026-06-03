import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { BackupReminderBanner } from "@/components/BackupReminderBanner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FocusFlow",
  description: "Personal task prioritization and time management",
  manifest: "/manifest.json",
  icons: { apple: "/icons/icon-192.png" },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#6366f1",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <BackupReminderBanner />
        {children}
      </body>
    </html>
  );
}
