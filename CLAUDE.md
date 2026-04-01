# CLAUDE.md

## Project Overview

病床機能報告オープンデータを活用した全国横断インタラクティブダッシュボード。
厚生労働省が年1回公開する病床機能報告データ（CSV）を前処理し、Next.jsで可視化する。

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Charts**: Recharts
- **Map**: Leaflet (react-leaflet)
- **Styling**: Tailwind CSS
- **Data**: 静的JSON（ビルド時にCSVから生成）
- **Data Pipeline**: Python (pandas) for CSV→JSON preprocessing
- **Deploy**: Vercel

## Project Structure

```
bed-function-dashboard/
├── app/                    # Next.js App Router pages
│   ├── page.tsx            # Page 1: 全国俯瞰マップ
│   ├── area/page.tsx       # Page 2: 構想区域別詳細分析
│   ├── ranking/page.tsx    # Page 3: 診療実績ランキング
│   ├── trend/page.tsx      # Page 4: 経年変化トレンド
│   ├── hospital/page.tsx   # Page 5: 病院個別カルテ
│   └── layout.tsx
├── components/             # React components
│   ├── charts/             # Chart components (Recharts wrappers)
│   ├── map/                # Map components (Leaflet)
│   └── ui/                 # Common UI components
├── lib/                    # Utility functions, data loading
├── types/                  # TypeScript type definitions
├── public/data/            # Generated JSON data files
├── scripts/                # Python data preprocessing scripts
│   ├── download.py         # Download ZIPs from MHLW
│   ├── preprocess.py       # CSV→JSON conversion
│   └── requirements.txt
├── data/raw/               # Raw CSV files (gitignored)
└── docs/                   # Design documents
```

## Commands

```bash
# Development
npm run dev          # Start dev server
npm run build        # Build for production
npm run lint         # Run linter

# Data Pipeline
cd scripts
pip install -r requirements.txt
python download.py   # Download raw data from MHLW
python preprocess.py # Convert CSV to JSON
```

## Data Flow

```
厚労省ZIP → data/raw/ (CSV) → scripts/preprocess.py → public/data/ (JSON) → Next.js pages
```

## Key Design Decisions

- データは静的JSONとしてpublic/data/に配置し、fetchで取得する（SSG/ISR対応）
- 構想区域コードをキーにデータを結合する
- 地図はGeoJSONベースの構想区域ポリゴンを使用
- 年度データは5年分（令和元年〜令和5年度）を対象
