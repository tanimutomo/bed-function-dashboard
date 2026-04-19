# 医療オープンデータ分析ダッシュボード

厚労省・IPSS・e-Stat などのオープンデータを横断し、病床機能・人口動態・医療介護リソースを組み合わせて地域医療を分析する経営支援ダッシュボード。

## Features

- **病院カルテ（一般病院・精神科病院）**: 個別病院の診療実績・病床機能・職員構成を全国/構想区域平均と比較
- **地域ダッシュボード**: 都道府県 or 構想区域を選んで、人口動態・将来推計・医療介護リソース・経年トレンドを一画面で確認
  - 2050年までの推計人口 + JMAP式 医療介護需要予測指数
  - 令和5年患者調査 × IPSS推計人口 による将来患者数推計
  - 医師・医療施設・介護保険施設の人口対指標（全国平均比）
  - 病床機能・利用率・平均在院日数の経年トレンド
- **精神科医療**: 630調査に基づく精神科病院数・病床・在院・疾患構成・入院形態
- **全国俯瞰マップ**: 339構想区域の病床機能バランスをヒートマップで表示
- **診療実績ランキング**: 手術件数・救急搬送等の全国ランキング

## データソース

- 厚生労働省
  - 病床機能報告（令和元年〜令和6年度）
  - 医師・歯科医師・薬剤師統計（令和4年）
  - 医療施設（静態・動態）調査（令和5年）
  - 介護サービス施設・事業所調査（令和5年）
  - 患者調査（令和5年）
  - 精神保健福祉資料（630調査）
  - 病院報告
- 国立社会保障・人口問題研究所（IPSS）
  - 日本の地域別将来推計人口（令和5年推計）
- 総務省 e-Stat 人口統計

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
