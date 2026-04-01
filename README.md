# 病床機能報告ダッシュボード

厚生労働省「病床機能報告」オープンデータを活用した、全国横断インタラクティブダッシュボード。

## Features

- **全国俯瞰マップ**: 339構想区域の病床機能バランスをヒートマップで表示
- **構想区域別詳細**: 区域内の病院ごとの機能別病床構成を比較
- **診療実績ランキング**: 手術件数・救急搬送等の全国ランキング
- **経年変化トレンド**: 5年分の病床機能転換の推移を可視化
- **病院個別カルテ**: 個別病院の実績を全国/区域平均と比較

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Recharts / Leaflet
- Tailwind CSS
- Python (pandas) for data preprocessing

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.9+

### Data Preparation

```bash
cd scripts
pip install -r requirements.txt
python download.py     # 厚労省からZIPダウンロード
python preprocess.py   # CSV→JSON変換
```

### Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Data Source

[厚生労働省 病床機能報告 オープンデータ](https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/open_data_00006.html)

## License

MIT
