"""
IPSS 日本の地域別将来推計人口（令和5年推計）前処理スクリプト

国立社会保障・人口問題研究所が公表する都道府県別将来推計人口データを
JSONに変換し、病院ダッシュボードから利用できるようにする。

データソース:
  https://www.ipss.go.jp/pp-shicyoson/j/shicyoson23/t-page.asp
  令和5（2023）年推計、基準年2020年、推計期間2020〜2050年（5年刻み）

入力ファイル（data/raw/ipss/ に配置）:
  kekkahyo1.xlsx    総人口
  kekkahyo2_1.xlsx  0〜14歳
  kekkahyo2_2.xlsx  15〜64歳
  kekkahyo2_3.xlsx  65歳以上
  kekkahyo2_4.xlsx  75歳以上

  ダウンロード:
    BASE=https://www.ipss.go.jp/pp-shicyoson/j/shicyoson23/2gaiyo_hyo
    curl -L -o data/raw/ipss/kekkahyo1.xlsx $BASE/kekkahyo1.xlsx
    curl -L -o data/raw/ipss/kekkahyo2_1.xlsx $BASE/kekkahyo2_1.xlsx
    ... （以下同様）

ファイル構造（全5ファイル共通）:
  Sheet1 のみ。行5以降がデータ。
  col 0: コード（1000=北海道, 2000=青森, ..., 47000=沖縄。市区町村含む）
  col 1: 市などの別（'a'=都道府県, '1'=政令市, '0'=政令市区, '2'=その他の市, '3'=町村）
  col 2: 都道府県名
  col 3: 市区町村名（都道府県全体の場合は NaN）
  col 4-10: 各年次（2020, 2025, 2030, 2035, 2040, 2045, 2050）の人口

  都道府県レベルの抽出条件: col1 == 'a' AND col3 が NaN

出力:
  public/data/summary/population_future.json

Usage:
    python preprocess_ipss.py
"""

import json
import os

import pandas as pd

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(PROJECT_ROOT, "data", "raw", "ipss")
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "public", "data", "summary")

PREFECTURE_NAMES = {
    "01": "北海道", "02": "青森県", "03": "岩手県", "04": "宮城県", "05": "秋田県",
    "06": "山形県", "07": "福島県", "08": "茨城県", "09": "栃木県", "10": "群馬県",
    "11": "埼玉県", "12": "千葉県", "13": "東京都", "14": "神奈川県", "15": "新潟県",
    "16": "富山県", "17": "石川県", "18": "福井県", "19": "山梨県", "20": "長野県",
    "21": "岐阜県", "22": "静岡県", "23": "愛知県", "24": "三重県", "25": "滋賀県",
    "26": "京都府", "27": "大阪府", "28": "兵庫県", "29": "奈良県", "30": "和歌山県",
    "31": "鳥取県", "32": "島根県", "33": "岡山県", "34": "広島県", "35": "山口県",
    "36": "徳島県", "37": "香川県", "38": "愛媛県", "39": "高知県", "40": "福岡県",
    "41": "佐賀県", "42": "長崎県", "43": "熊本県", "44": "大分県", "45": "宮崎県",
    "46": "鹿児島県", "47": "沖縄県",
}

FORECAST_YEARS = ["2020", "2025", "2030", "2035", "2040", "2045", "2050"]
# IPSS の都道府県行（市区町村なし）: 列4〜10 が 2020〜2050年
YEAR_COLS = {year: 4 + i for i, year in enumerate(FORECAST_YEARS)}

FILES = {
    "total":    "kekkahyo1.xlsx",   # 総人口
    "under15":  "kekkahyo2_1.xlsx", # 0〜14歳
    "age15_64": "kekkahyo2_2.xlsx", # 15〜64歳
    "over65":   "kekkahyo2_3.xlsx", # 65歳以上
    "over75":   "kekkahyo2_4.xlsx", # 75歳以上
}


def read_pref_series(path):
    """
    IPSS Excel から都道府県レベルの 年次別 人口を抽出。
    戻り値: {"01": {"2020": int, ..., "2050": int}, ...}
    """
    df = pd.read_excel(path, sheet_name=0, header=None)
    # 都道府県レベル（市などの別=='a' かつ 市区町村==NaN）
    pref_rows = df[(df[1] == "a") & (df[3].isna())]

    result = {}
    for _, row in pref_rows.iterrows():
        code_raw = row[0]
        if pd.isna(code_raw):
            continue
        code_int = int(code_raw) // 1000  # 1000→1, 2000→2, ..., 47000→47
        if code_int < 1 or code_int > 47:
            continue
        pref_code = f"{code_int:02d}"

        years = {}
        for year, col in YEAR_COLS.items():
            val = row[col]
            if pd.isna(val):
                continue
            years[year] = int(val)
        result[pref_code] = years
    return result


def build_year_entry(total, under15, age15_64, over65, over75):
    total = int(total or 0)
    under15 = int(under15 or 0)
    age15_64 = int(age15_64 or 0)
    over65 = int(over65 or 0)
    over75 = int(over75 or 0)
    return {
        "total": total,
        "under15": under15,
        "age15_64": age15_64,
        "over65": over65,
        "agingRate": round(over65 / total * 100, 1) if total > 0 else 0,
        "over75": over75,
        "over75Rate": round(over75 / total * 100, 1) if total > 0 else 0,
    }


def main():
    os.makedirs(RAW_DIR, exist_ok=True)
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # 5ファイルを読んで (metric, pref_code, year) → value のテーブルを構築
    metric_data = {}
    missing = []
    for metric, filename in FILES.items():
        path = os.path.join(RAW_DIR, filename)
        if not os.path.exists(path):
            missing.append(filename)
            continue
        print(f"Reading {filename} ...", end=" ")
        metric_data[metric] = read_pref_series(path)
        print(f"{len(metric_data[metric])} prefectures")

    if missing:
        print("\n[ERROR] 次のファイルが見つかりません:")
        for f in missing:
            print(f"  data/raw/ipss/{f}")
        print("\nダウンロード:")
        print("  BASE=https://www.ipss.go.jp/pp-shicyoson/j/shicyoson23/2gaiyo_hyo")
        for f in missing:
            print(f"  curl -L -o data/raw/ipss/{f} $BASE/{f}")
        return

    # 都道府県ごとに年次エントリを組み立て
    prefectures = {}
    for pref_code, pref_name in PREFECTURE_NAMES.items():
        years_out = {}
        for year in FORECAST_YEARS:
            entry = build_year_entry(
                total=metric_data["total"].get(pref_code, {}).get(year, 0),
                under15=metric_data["under15"].get(pref_code, {}).get(year, 0),
                age15_64=metric_data["age15_64"].get(pref_code, {}).get(year, 0),
                over65=metric_data["over65"].get(pref_code, {}).get(year, 0),
                over75=metric_data["over75"].get(pref_code, {}).get(year, 0),
            )
            if entry["total"] > 0:
                years_out[year] = entry
        prefectures[pref_code] = {"name": pref_name, "years": years_out}

    # 全国値 = 47都道府県の合算
    national_years = {}
    for year in FORECAST_YEARS:
        totals = {"total": 0, "under15": 0, "age15_64": 0, "over65": 0, "over75": 0}
        for pref in prefectures.values():
            y = pref["years"].get(year)
            if not y:
                continue
            for k in totals:
                totals[k] += y.get(k, 0)
        if totals["total"] > 0:
            national_years[year] = build_year_entry(
                totals["total"], totals["under15"], totals["age15_64"],
                totals["over65"], totals["over75"],
            )

    output = {
        "source": "国立社会保障・人口問題研究所「日本の地域別将来推計人口（令和5年推計）」",
        "sourceUrl": "https://www.ipss.go.jp/pp-shicyoson/j/shicyoson23/t-page.asp",
        "baseYear": "2020",
        "years": FORECAST_YEARS,
        "inputSource": "kekkahyo1-2_4.xlsx (IPSS shicyoson23)",
        "national": {"years": national_years},
        "prefectures": prefectures,
    }

    output_path = os.path.join(OUTPUT_DIR, "population_future.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, separators=(",", ":"))

    print(f"\nWritten: {output_path}")

    filled = sum(1 for p in prefectures.values() if p["years"])
    print(f"  Prefectures with data: {filled}/47")
    if national_years:
        y20 = national_years.get("2020", {}).get("total", 0)
        y50 = national_years.get("2050", {}).get("total", 0)
        if y20 > 0:
            delta = (y50 - y20) / y20 * 100
            print(f"  2020→2050 total pop: {y20:,} → {y50:,} ({delta:+.1f}%)")

        over75_20 = national_years.get("2020", {}).get("over75", 0)
        over75_50 = national_years.get("2050", {}).get("over75", 0)
        if over75_20 > 0:
            delta75 = (over75_50 - over75_20) / over75_20 * 100
            print(f"  2020→2050 75歳以上: {over75_20:,} → {over75_50:,} ({delta75:+.1f}%)")


if __name__ == "__main__":
    main()
