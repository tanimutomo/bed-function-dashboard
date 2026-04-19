"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

interface NavLeaf {
  href: string;
  label: string;
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
    label: "病院",
    children: [
      { href: "/hospital", label: "病院カルテ（一般病院）" },
      { href: "/psychiatric/hospitals", label: "病院カルテ（精神科病院）" },
      { href: "/ranking", label: "診療実績ランキング" },
    ],
  },
  {
    label: "地域",
    children: [
      { href: "/area", label: "構想区域" },
      { href: "/population", label: "人口動態・将来推計" },
      { href: "/trend", label: "経年トレンド" },
      { href: "/psychiatric", label: "精神科医療の状況" },
    ],
  },
];

/**
 * pathname に最もマッチする nav leaf の href を返す。
 */
function findActiveHref(pathname: string, items: NavItem[]): string {
  const leaves: NavLeaf[] = [];
  for (const item of items) {
    if (isGroup(item)) leaves.push(...item.children);
    else leaves.push(item);
  }
  let active = "";
  for (const leaf of leaves) {
    if (leaf.href === "/") continue;
    const matches = pathname === leaf.href || pathname.startsWith(leaf.href + "/");
    if (matches && leaf.href.length > active.length) active = leaf.href;
  }
  if (!active && pathname === "/") active = "/";
  return active;
}

export function Navigation() {
  const pathname = usePathname();
  const activeHref = findActiveHref(pathname, navItems);
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  return (
    <header className="relative border-b border-gray-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between">
          <Link href="/" className="text-lg font-bold text-gray-900">
            病床機能報告ダッシュボード
          </Link>
          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              if (isGroup(item)) {
                const groupActive = item.children.some((c) => c.href === activeHref);
                const isOpen = openGroup === item.label;
                return (
                  <div
                    key={item.label}
                    className="relative"
                    onMouseEnter={() => setOpenGroup(item.label)}
                    onMouseLeave={() => setOpenGroup(null)}
                  >
                    <button
                      onClick={() => setOpenGroup(isOpen ? null : item.label)}
                      className={`flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                        groupActive
                          ? "bg-blue-50 text-blue-700"
                          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                      }`}
                    >
                      {item.label}
                      <svg
                        className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`}
                        viewBox="0 0 12 12"
                        fill="none"
                        aria-hidden
                      >
                        <path
                          d="M3 4.5L6 7.5L9 4.5"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>

                    {isOpen && (
                      <div className="absolute right-0 top-full z-20 mt-1 min-w-[240px] overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg">
                        {item.children.map((child) => {
                          const childActive = activeHref === child.href;
                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              onClick={() => setOpenGroup(null)}
                              className={`block px-4 py-2 text-sm transition-colors ${
                                childActive
                                  ? "bg-blue-50 text-blue-700 font-medium"
                                  : "text-gray-700 hover:bg-gray-50"
                              }`}
                            >
                              {child.label}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              // Leaf item
              const isActive = activeHref === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-blue-50 text-blue-700"
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
