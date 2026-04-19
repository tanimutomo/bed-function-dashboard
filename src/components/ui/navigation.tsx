"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

interface NavLeaf {
  href: string;
  label: string;
  /** 互換性のために他のパスでも active 扱いとするエイリアス */
  alsoActiveFor?: string[];
}

interface NavGroup {
  label: string;
  children: NavLeaf[];
}

type NavItem = NavLeaf | NavGroup;

function isGroup(item: NavItem): item is NavGroup {
  return "children" in item;
}

const navItems: NavItem[] = [
  { href: "/", label: "ホーム" },
  {
    label: "病院カルテ",
    children: [
      { href: "/hospital", label: "一般病院" },
      { href: "/psychiatric/hospitals", label: "精神科病院" },
      { href: "/ranking", label: "診療実績ランキング" },
    ],
  },
  {
    label: "地域",
    children: [
      {
        href: "/population",
        label: "地域ダッシュボード",
        alsoActiveFor: ["/area", "/trend", "/psychiatric"],
      },
    ],
  },
];

function findActiveHref(pathname: string, items: NavItem[]): string {
  const leaves: NavLeaf[] = [];
  for (const item of items) {
    if (isGroup(item)) leaves.push(...item.children);
    else leaves.push(item);
  }
  let active = "";
  let activeMatchLen = 0;
  for (const leaf of leaves) {
    if (leaf.href === "/") continue;
    const pathsToCheck = [leaf.href, ...(leaf.alsoActiveFor ?? [])];
    for (const path of pathsToCheck) {
      const matches = pathname === path || pathname.startsWith(path + "/");
      if (matches && path.length > activeMatchLen) {
        active = leaf.href;
        activeMatchLen = path.length;
      }
    }
  }
  if (!active && pathname === "/") active = "/";
  return active;
}

/**
 * サイドバー型ナビゲーション。
 * デスクトップ (lg+): 左端に固定表示 (w-60)
 * モバイル: ハンバーガーでドロワー開閉
 */
export function Navigation() {
  const pathname = usePathname();
  const activeHref = findActiveHref(pathname, navItems);
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = () => setMobileOpen(false);

  // モバイルドロワーが開いている時は body スクロール抑止
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <>
      {/* モバイル: 上部バー (ハンバーガー + タイトル) */}
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="メニューを開く"
          className="rounded-md border border-gray-300 p-1.5 text-gray-700 hover:bg-gray-100"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M4 7h16M4 12h16M4 17h16"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <Link href="/" onClick={closeMobile} className="text-sm font-bold text-gray-900">
          病床機能報告ダッシュボード
        </Link>
      </div>

      {/* モバイル: オーバーレイ */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      {/* サイドバー本体 */}
      <aside
        className={`fixed left-0 top-0 z-50 flex h-screen w-60 flex-col border-r border-gray-200 bg-white transition-transform duration-200 lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* ロゴ・タイトル */}
        <div className="flex items-start justify-between border-b border-gray-200 px-5 py-4">
          <Link
            href="/"
            onClick={closeMobile}
            className="block text-sm font-bold leading-snug text-gray-900"
          >
            病床機能報告
            <br />
            ダッシュボード
          </Link>
          {/* モバイル: 閉じるボタン */}
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="メニューを閉じる"
            className="-mr-2 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 lg:hidden"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M6 6l12 12M6 18L18 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* ナビリスト */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1">
            {navItems.map((item) => {
              if (isGroup(item)) {
                return (
                  <li key={item.label} className="pt-3 first:pt-0">
                    <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                      {item.label}
                    </p>
                    <ul className="space-y-0.5">
                      {item.children.map((child) => {
                        const isActive = activeHref === child.href;
                        return (
                          <li key={child.href}>
                            <Link
                              href={child.href}
                              onClick={closeMobile}
                              className={`block rounded-md px-3 py-1.5 text-sm transition-colors ${
                                isActive
                                  ? "bg-blue-50 font-medium text-blue-700"
                                  : "text-gray-700 hover:bg-gray-100"
                              }`}
                            >
                              {child.label}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              }
              const isActive = activeHref === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={closeMobile}
                    className={`block rounded-md px-3 py-1.5 text-sm transition-colors ${
                      isActive
                        ? "bg-blue-50 font-medium text-blue-700"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* フッター風データ出典 */}
        <div className="border-t border-gray-200 px-5 py-3 text-[10px] leading-relaxed text-gray-400">
          データ出典: 厚生労働省<br />「病床機能報告」ほか
        </div>
      </aside>
    </>
  );
}
