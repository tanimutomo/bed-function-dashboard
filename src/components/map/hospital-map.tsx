"use client";

import dynamic from "next/dynamic";

const HospitalMapInner = dynamic(() => import("./hospital-map-inner"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[400px] items-center justify-center rounded-lg bg-gray-100">
      <p className="text-sm text-gray-400">地図を読み込み中...</p>
    </div>
  ),
});

export interface HospitalMapItem {
  code: string;
  name: string;
  lat: number;
  lng: number;
  totalBeds: number;
  isSelf: boolean;
}

interface HospitalMapProps {
  hospitals: HospitalMapItem[];
  selfCode: string;
}

export default function HospitalMap({ hospitals, selfCode }: HospitalMapProps) {
  return <HospitalMapInner hospitals={hospitals} selfCode={selfCode} />;
}
