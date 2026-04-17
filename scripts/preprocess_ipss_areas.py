"""
IPSS 市区町村別将来推計人口 → 構想区域単位に集計するスクリプト

既存の hospitals/index.json + hospitals/{code}.json から
「構想区域 → 市区町村」のマッピングを動的に構築し、
IPSS kekkahyo1-2_4.xlsx の市区町村行を集計して構想区域別JSONを出力する。

入力:
  data/raw/ipss/
    kekkahyo1.xlsx    総人口
    kekkahyo2_1.xlsx  0〜14歳
    kekkahyo2_2.xlsx  15〜64歳
    kekkahyo2_3.xlsx  65歳以上
    kekkahyo2_4.xlsx  75歳以上
  public/data/hospitals/index.json     病院ごとの構想区域コード
  public/data/hospitals/{code}.json    病院ごとの市区町村コード (areaCode フィールド)
  public/data/areas/index.json          構想区域 index

出力:
  public/data/summary/population_future_areas.json
    {
      "source": ...,
      "years": [...],
      "areas": {
        "<area_code>": {
          "name": ...,
          "prefecture": ...,
          "municipalities": [...],  // 集計対象の市区町村コード
          "years": {
            "2020": {total, under15, age15_64, over65, over75, agingRate, over75Rate},
            ...
          }
        }
      }
    }
"""

import json
import os
from collections import defaultdict

import pandas as pd

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(PROJECT_ROOT, "data", "raw", "ipss")
HOSP_DIR = os.path.join(PROJECT_ROOT, "public", "data", "hospitals")
AREAS_DIR = os.path.join(PROJECT_ROOT, "public", "data", "areas")
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "public", "data", "summary")

FORECAST_YEARS = ["2020", "2025", "2030", "2035", "2040", "2045", "2050"]
YEAR_COLS = {year: 4 + i for i, year in enumerate(FORECAST_YEARS)}

FILES = {
    "total":    "kekkahyo1.xlsx",
    "under15":  "kekkahyo2_1.xlsx",
    "age15_64": "kekkahyo2_2.xlsx",
    "over65":   "kekkahyo2_3.xlsx",
    "over75":   "kekkahyo2_4.xlsx",
}


def build_area_to_municipality_mapping():
    """
    hospitals/index.json + 個別詳細JSON から
    構想区域 → 市区町村(JIS5桁) のマッピングを構築。
    """
    with open(os.path.join(HOSP_DIR, "index.json"), encoding="utf-8") as f:
        hospitals_idx = json.load(f)

    # 有効な構想区域コードセット（偽コード除外用）
    with open(os.path.join(AREAS_DIR, "index.json"), encoding="utf-8") as f:
        area_idx = json.load(f)
    valid_area_codes = {a["code"] for a in area_idx}

    area_to_munis = defaultdict(set)
    area_to_pref = {}

    for h in hospitals_idx:
        code = h["code"]
        area_code = h.get("areaCode", "")
        if not area_code or area_code not in valid_area_codes:
            continue
        pref = str(h.get("prefecture", "")).zfill(2)

        detail_path = os.path.join(HOSP_DIR, f"{code}.json")
        if not os.path.exists(detail_path):
            continue
        with open(detail_path, encoding="utf-8") as f:
            d = json.load(f)

        # 個別JSONの areaCode フィールドは実は市区町村コード
        muni = d.get("areaCode")
        if muni is None:
            continue
        muni_str = str(muni).zfill(5)
        # 都道府県コードとの整合性チェック (muni先頭2桁 == pref)
        if muni_str[:2] != pref:
            continue
        area_to_munis[area_code].add(muni_str)
        area_to_pref[area_code] = pref

    return dict(area_to_munis), area_to_pref, area_idx


def read_muni_pop_series(path):
    """
    IPSS Excel から市区町村レベル(+都道府県レベル除外)の年次別人口を抽出。
    戻り値: {muni_code_5: {"2020": int, ..., "2050": int}}
    """
    df = pd.read_excel(path, sheet_name=0, header=None)
    # 市区町村行: col1 != 'a' かつ col3 (市区町村名) が NaN でない
    # ※ 政令市全体（col1='1'）と その区（col1='0'）の両方存在することがあるので
    # 政令市全体行は重複になるため除外、区のみを拾う
    result = {}
    for _, row in df.iterrows():
        kind = row[1]
        if pd.isna(kind):
            continue
        kind_str = str(kind).strip()
        # 都道府県行(a) と 政令市全体行(1) は集計対象外（区が別行にある）
        # 地域区分行(9 = 浜通り) も除外
        if kind_str in ("a", "1", "9"):
            continue
        code_raw = row[0]
        if pd.isna(code_raw):
            continue
        # JIS市区町村コード: 5桁ゼロパディング（ヘッダ行などの文字列はスキップ）
        try:
            muni_code = str(int(code_raw)).zfill(5)
        except (ValueError, TypeError):
            continue

        years = {}
        for year, col in YEAR_COLS.items():
            val = row[col]
            if pd.isna(val):
                continue
            years[year] = int(val)
        if years:
            result[muni_code] = years

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
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # 1. マッピング構築
    print("Building area→municipality mapping from hospital data ...")
    area_to_munis, area_to_pref, area_idx = build_area_to_municipality_mapping()
    print(f"  Areas mapped: {len(area_to_munis)}")
    total_munis = sum(len(m) for m in area_to_munis.values())
    print(f"  Total municipality entries: {total_munis}")

    # 2. IPSS 市区町村データ読込
    missing = []
    metric_muni_data = {}
    for metric, filename in FILES.items():
        path = os.path.join(RAW_DIR, filename)
        if not os.path.exists(path):
            missing.append(filename)
            continue
        print(f"Reading {filename} (municipality rows) ...", end=" ")
        metric_muni_data[metric] = read_muni_pop_series(path)
        print(f"{len(metric_muni_data[metric])} municipalities")

    if missing:
        print(f"\n[ERROR] 次の IPSS ファイルが見つかりません: {missing}")
        print("  scripts/preprocess_ipss.py と同じディレクトリ構成が必要です。")
        return

    # 3. 構想区域ごとに集計
    name_by_code = {a["code"]: a["name"] for a in area_idx}

    areas_out = {}
    unmatched_muni = set()
    for area_code, munis in area_to_munis.items():
        years_out = {}
        matched_munis = []
        for year in FORECAST_YEARS:
            totals = {m: 0 for m in ["total", "under15", "age15_64", "over65", "over75"]}
            for muni in munis:
                if muni not in metric_muni_data["total"]:
                    unmatched_muni.add(muni)
                    continue
                for metric, muni_years in metric_muni_data.items():
                    y = muni_years.get(muni, {}).get(year)
                    if y is not None:
                        totals[metric] += y
                if year == FORECAST_YEARS[0] and muni not in matched_munis:
                    matched_munis.append(muni)
            if totals["total"] > 0:
                years_out[year] = build_year_entry(**totals)

        if years_out:
            areas_out[area_code] = {
                "name": name_by_code.get(area_code, area_code),
                "prefecture": area_to_pref.get(area_code, ""),
                "municipalities": sorted(matched_munis),
                "years": years_out,
            }

    if unmatched_muni:
        print(f"\n  Warning: {len(unmatched_muni)} municipalities in mapping not found in IPSS data:")
        for m in sorted(unmatched_muni)[:10]:
            print(f"    {m}")

    output = {
        "source": "国立社会保障・人口問題研究所「日本の地域別将来推計人口（令和5年推計）」",
        "sourceUrl": "https://www.ipss.go.jp/pp-shicyoson/j/shicyoson23/t-page.asp",
        "baseYear": "2020",
        "years": FORECAST_YEARS,
        "mappingNote": (
            "構想区域→市区町村マッピングは hospitals/index.json (構想区域コード) と "
            "hospitals/{code}.json (市区町村コード) から動的に構築。"
            "病院が1つも存在しない市区町村は集計対象外。"
        ),
        "areas": areas_out,
    }

    output_path = os.path.join(OUTPUT_DIR, "population_future_areas.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, separators=(",", ":"))

    print(f"\nWritten: {output_path}")
    print(f"  Areas with population forecast: {len(areas_out)}")

    # サンプル統計
    if "104" in areas_out:
        sapporo = areas_out["104"]
        y20 = sapporo["years"].get("2020", {})
        y50 = sapporo["years"].get("2050", {})
        print(f"\n  札幌 (104): {len(sapporo['municipalities'])} 市区町村")
        if y20.get("total") and y50.get("total"):
            chg = (y50["total"] - y20["total"]) / y20["total"] * 100
            print(f"    2020→2050 総人口: {y20['total']:,} → {y50['total']:,} ({chg:+.1f}%)")


if __name__ == "__main__":
    main()
