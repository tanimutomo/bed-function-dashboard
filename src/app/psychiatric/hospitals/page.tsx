"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchHospitalIndex, PREFECTURE_NAMES, PREFECTURE_LIST } from "@/lib/data";

interface PsychHospital {
  code: string;
  name: string;
  prefecture: string;
  areaCode: string;
  areaName: string;
  totalBeds: number;
  psychiatricBeds: number;
}

const PAGE_SIZE = 50;

export default function PsychiatricHospitalsPage() {
  const [hospitals, setHospitals] = useState<PsychHospital[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPref, setSelectedPref] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    fetchHospitalIndex().then((idx) => {
      const psych = idx
        .filter((h: PsychHospital) => (h.psychiatricBeds || 0) > 0)
        .map((h: PsychHospital) => ({
          code: h.code,
          name: h.name,
          prefecture: h.prefecture,
          areaCode: h.areaCode,
          areaName: h.areaName,
          totalBeds: h.totalBeds,
          psychiatricBeds: h.psychiatricBeds || 0,
        }))
        .sort(
          (a: PsychHospital, b: PsychHospital) => b.psychiatricBeds - a.psychiatricBeds,
        );
      setHospitals(psych);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    let list = hospitals;
    if (selectedPref !== "all") {
      list = list.filter((h) => h.prefecture === selectedPref);
    }
    if (searchQuery.length >= 2) {
      const q = searchQuery.toLowerCase();
      list = list.filter((h) => h.name.toLowerCase().includes(q));
    }
    return list;
  }, [hospitals, selectedPref, searchQuery]);

  const pageCount = Math.ceil(filtered.length / PAGE_SIZE);
  // フィルタ変更で page が範囲外になった場合はクランプ
  const safePage = Math.min(page, Math.max(0, pageCount - 1));
  const pageItems = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <p className="text-gray-500">データを読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-amber-900">精神科病院一覧</h1>
          <p className="mt-1 text-sm text-gray-500">
            全国の精神病床を有する病院 / 病院名または都道府県で絞り込み
          </p>
        </div>
        <select
          value={selectedPref}
          onChange={(e) => {
            setSelectedPref(e.target.value);
            setPage(0);
          }}
          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm"
        >
          <option value="all">全国</option>
          {PREFECTURE_LIST.map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-lg border border-amber-200 bg-white shadow-sm">
        <div className="border-b border-amber-100 px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-amber-900">
              {filtered.length.toLocaleString()}施設
            </h3>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(0);
              }}
              placeholder="病院名で検索..."
              className="w-64 rounded-md border border-amber-300 px-3 py-1.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-amber-100 bg-amber-50 text-left text-amber-700">
                <th className="px-4 py-3">病院名</th>
                <th className="px-4 py-3">都道府県</th>
                <th className="px-4 py-3 text-right">精神病床</th>
                <th className="px-4 py-3 text-right">総病床数</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {pageItems.map((h) => (
                <tr key={h.code} className="border-b border-amber-50 hover:bg-amber-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/psychiatric/${h.code}`}
                      className="font-medium text-amber-700 hover:underline"
                    >
                      {h.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {PREFECTURE_NAMES[h.prefecture] || h.prefecture}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-amber-900">
                    {h.psychiatricBeds.toLocaleString()}床
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">
                    {h.totalBeds.toLocaleString()}床
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/psychiatric/${h.code}`}
                      className="rounded bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
                    >
                      詳細 →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pageCount > 1 && (
          <div className="flex items-center justify-between border-t border-amber-100 px-4 py-3">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="rounded border border-amber-300 px-3 py-1 text-sm disabled:opacity-40"
            >
              前へ
            </button>
            <span className="text-sm text-gray-500">
              {safePage + 1} / {pageCount}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={safePage >= pageCount - 1}
              className="rounded border border-amber-300 px-3 py-1 text-sm disabled:opacity-40"
            >
              次へ
            </button>
          </div>
        )}
      </div>

      <p className="mt-4 text-xs text-gray-400">
        データ出典：医療情報ネット オープンデータ
      </p>
    </div>
  );
}
