import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navigation } from "@/components/ui/navigation";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "病床機能報告ダッシュボード",
  description:
    "厚生労働省オープンデータによる全国の病床機能報告を可視化するダッシュボード",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-gray-50 text-gray-900 overflow-x-hidden">
        <Navigation />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-gray-200 py-4 text-center text-sm text-gray-500">
          データ出典：厚生労働省「病床機能報告」オープンデータ
        </footer>
      </body>
    </html>
  );
}
