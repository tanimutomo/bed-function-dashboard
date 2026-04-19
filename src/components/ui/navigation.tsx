"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

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
        alsoActiveFor: ["/area", "/trend"],
      },
      {
        href: "/population?tab=psychiatric",
        label: "精神科医療",
        alsoActiveFor: ["/psychiatric"],
      },
    ],
  },
];

/** href を pathname + クエリに分解。クエリは Record<string,string> */
function splitHref(href: string): { pathname: string; query: Record<string, string> } {
  const [pathname, queryStr = ""] = href.split("?");
  const query: Record<string, string> = {};
  for (const part of queryStr.split("&").filter(Boolean)) {
    const [k, v] = part.split("=");
    query[decodeURIComponent(k)] = decodeURIComponent(v ?? "");
  }
  return { pathname, query };
}

function findActiveHref(
  pathname: string,
  searchParams: URLSearchParams,
  items: NavItem[],
): string {
  const leaves: NavLeaf[] = [];
  for (const item of items) {
    if (isGroup(item)) leaves.push(...item.children);
    else leaves.push(item);
  }
  let active = "";
  let activeScore = -1;

  for (const leaf of leaves) {
    const candidates = [leaf.href, ...(leaf.alsoActiveFor ?? [])];
    for (const candidate of candidates) {
      const { pathname: candPath, query: candQuery } = splitHref(candidate);
      if (candPath === "/") continue;

      // パス一致
      const pathMatches =
        pathname === candPath || pathname.startsWith(candPath + "/");
      if (!pathMatches) continue;

      // クエリ一致: 候補が指定するキーが全部現在のqueryと一致する必要あり
      let queryMatches = true;
      for (const [k, v] of Object.entries(candQuery)) {
        if (searchParams.get(k) !== v) {
          queryMatches = false;
          break;
        }
      }
      if (!queryMatches) continue;

      // スコア: パス長 + クエリが多いほど優先（より具体的）
      const score = candPath.length + Object.keys(candQuery).length * 100;
      if (score > activeScore) {
        active = leaf.href;
        activeScore = score;
      }
    }
  }

  if (!active && pathname === "/") active = "/";

  // /population でクエリ無し (tab未指定) → 地域ダッシュボードがactive。
  // /population?tab=psychiatric → 精神科医療がactive。
  // 上記ロジックで、クエリ指定有り候補が優先されるのでOK。
  // ただし /population (クエリ無し) のとき、精神科医療 leaf は tab=psychiatric
  // を要求するのでマッチせず、地域ダッシュボード leaf (クエリ要求無し) がマッチする。
  return active;
}

/**
 * サイドバー型ナビゲーション。
 * デスクトップ (lg+): 左端に固定表示 (w-60)
 * モバイル: ハンバーガーでドロワー開閉
 */
export function Navigation() {
  // useSearchParams 使用のため Suspense でラップ
  return (
    <Suspense fallback={null}>
      <NavigationInner />
    </Suspense>
  );
}

function NavigationInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeHref = findActiveHref(pathname, searchParams, navItems);
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
