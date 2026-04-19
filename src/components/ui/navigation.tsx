"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "全国俯瞰" },
  { href: "/area", label: "構想区域" },
  { href: "/ranking", label: "ランキング" },
  { href: "/trend", label: "経年トレンド" },
  { href: "/population", label: "人口動態" },
  { href: "/hospital", label: "病院カルテ" },
  { href: "/psychiatric", label: "精神科", accent: true },
  { href: "/psychiatric/hospitals", label: "精神科病院", accent: true },
];

/**
 * pathname に最もマッチする nav item の href を1つだけ返す。
 * 例: /psychiatric/hospitals は /psychiatric より /psychiatric/hospitals にマッチ。
 * /psychiatric/P120242 (動的ルート) は /psychiatric にマッチ。
 */
function findActiveHref(pathname: string, items: { href: string }[]): string {
  let active = "";
  for (const item of items) {
    if (item.href === "/") continue;
    const matches =
      pathname === item.href || pathname.startsWith(item.href + "/");
    if (matches && item.href.length > active.length) {
      active = item.href;
    }
  }
  if (!active && pathname === "/") active = "/";
  return active;
}

export function Navigation() {
  const pathname = usePathname();
  const activeHref = findActiveHref(pathname, navItems);

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between">
          <Link href="/" className="text-lg font-bold text-gray-900">
            病床機能報告ダッシュボード
          </Link>
          <nav className="flex gap-1">
            {navItems.map((item) => {
              const isActive = activeHref === item.href;
              const accent = "accent" in item && item.accent;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? accent
                        ? "bg-amber-50 text-amber-700"
                        : "bg-blue-50 text-blue-700"
                      : accent
                        ? "text-amber-600 hover:bg-amber-50 hover:text-amber-700"
                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}
