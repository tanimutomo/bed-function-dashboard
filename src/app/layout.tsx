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
  title: "医療オープンデータ分析ダッシュボード",
  description:
    "厚労省・IPSS・e-Stat などのオープンデータから、病床機能・人口動態・医療介護リソースを横断的に可視化する経営支援ダッシュボード",
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
      <body className="min-h-full bg-gray-50 text-gray-900 overflow-x-hidden">
        <Navigation />
        {/* デスクトップではサイドバー分のオフセット (lg:pl-60) */}
        <div className="flex min-h-screen flex-col lg:pl-60">
          <main className="flex-1">{children}</main>
          <footer className="border-t border-gray-200 py-4 text-center text-sm text-gray-500">
            データ出典：厚生労働省「病床機能報告」「医師・歯科医師・薬剤師統計」「医療施設調査」「介護サービス施設・事業所調査」「患者調査」「精神保健福祉資料(630調査)」 / IPSS「日本の地域別将来推計人口」 / e-Stat 人口統計
          </footer>
        </div>
      </body>
    </html>
  );
}
