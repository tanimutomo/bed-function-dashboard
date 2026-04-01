"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { fetchHospitalIndex, PREFECTURE_NAMES, PREFECTURE_LIST } from "@/lib/data";

interface HospitalMaster {
  code: string;
  name: string;
  areaCode: string;
  areaName: string;
  prefecture: string;
}

const PAGE_SIZE = 50;

export default function HospitalListPage() {
  const [hospitals, setHospitals] = useState<HospitalMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPref, setSelectedPref] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    fetchHospitalIndex().then((data) => {
      setHospitals(data);
      setLoading(false);
    });
  }, []);

  // 選択都道府県の構想区域一覧
  const areaOptions = useMemo(() => {
    if (selectedPref === "all") return [];
    const areas = new Map<string, string>();
    for (const h of hospitals) {
      if (h.prefecture === selectedPref && h.areaCode && h.areaName) {
        areas.set(h.areaCode, h.areaName);
      }
    }
    return Array.from(areas.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [hospitals, selectedPref]);

  const [selectedArea, setSelectedArea] = useState<string>("all");

  const filtered = useMemo(() => {
    let list = hospitals;
    if (selectedPref !== "all") {
      list = list.filter((h) => h.prefecture === selectedPref);
    }
    if (selectedArea !== "all") {
      list = list.filter((h) => h.areaCode === selectedArea);
    }
    if (searchQuery.length >= 2) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (h) =>
          h.name.toLowerCase().includes(q) ||
          h.areaName.includes(q)
      );
    }
    return list;
  }, [hospitals, selectedPref, selectedArea, searchQuery]);

  // ページリセット
  useEffect(() => {
    setPage(0);
  }, [selectedPref, selectedArea, searchQuery]);

  const pageCount = Math.ceil(filtered.length / PAGE_SIZE);
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <p className="text-gray-500">データを読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="mb-2 text-2xl font-bold">病院一覧</h1>
      <p className="mb-6 text-sm text-gray-500">
        病院を選択して個別カルテを確認（{hospitals.length.toLocaleString()}施設）
      </p>

      {/* フィルタ */}
      <div className="mb-6 flex flex-wrap gap-4">
        <select
          value={selectedPref}
          onChange={(e) => {
            setSelectedPref(e.target.value);
            setSelectedArea("all");
          }}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="all">全国</option>
          {PREFECTURE_LIST.map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>

        {selectedPref !== "all" && areaOptions.length > 0 && (
          <select
            value={selectedArea}
            onChange={(e) => setSelectedArea(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="all">全構想区域</option>
            {areaOptions.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        )}

        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="病院名で絞り込み..."
          className="flex-1 min-w-[200px] rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* 件数 */}
      <p className="mb-3 text-sm text-gray-500">
        {filtered.length.toLocaleString()}件
        {filtered.length !== hospitals.length && ` / ${hospitals.length.toLocaleString()}件中`}
      </p>

      {/* テーブル */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-3">病院名</th>
                <th className="px-4 py-3">都道府県</th>
                <th className="px-4 py-3">構想区域</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {pageItems.map((h) => (
                <tr
                  key={h.code}
                  className="border-b border-gray-100 hover:bg-blue-50"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/hospital/${h.code}`}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {h.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {PREFECTURE_NAMES[h.prefecture] || h.prefecture}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{h.areaName}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/hospital/${h.code}`}
                      className="rounded bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                    >
                      カルテ →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ページネーション */}
        {pageCount > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded border border-gray-300 px-3 py-1 text-sm disabled:opacity-40"
            >
              前へ
            </button>
            <span className="text-sm text-gray-500">
              {page + 1} / {pageCount}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={page >= pageCount - 1}
              className="rounded border border-gray-300 px-3 py-1 text-sm disabled:opacity-40"
            >
              次へ
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
