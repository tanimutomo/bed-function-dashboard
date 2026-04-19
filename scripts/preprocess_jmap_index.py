"""
医療介護需要予測指数 前処理スクリプト

IPSS 5歳階級別将来推計人口 (suikei_kekka.xlsx) を読み込み、
日本医師会 JMAP 方式の医療需要・介護需要の予測指数を算出する。

公式:
  医療需要 = 0-14歳×0.6 + 15-39歳×0.4 + 40-64歳×1.0
           + 65-74歳×2.3 + 75歳以上×3.9
  介護需要 = 40-64歳×1.0 + 65-74歳×9.7 + 75歳以上×87.3

2020年=100 の指数として出力し、将来の医療・介護需要が
何倍になるかを一目で把握できるようにする。

入力:
  data/raw/ipss/suikei_kekka.xlsx (IPSS 令和5年推計 5歳階級別)
  public/data/hospitals/index.json  (構想区域マッピング用)
  public/data/hospitals/{code}.json (同上)

出力:
  public/data/summary/jmap_index.json
    {
      "source": ...,
      "years": [...],
      "formula": {...},
      "national": {"years": {"2020": {...}, ...}},
      "prefectures": {"01": {...}, ...},
      "areas": {"<code>": {...}, ...}
    }
"""

import json
import os
from collections import defaultdict

import pandas as pd

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_FILE = os.path.join(PROJECT_ROOT, "data", "raw", "ipss", "suikei_kekka.xlsx")
HOSP_DIR = os.path.join(PROJECT_ROOT, "public", "data", "hospitals")
AREAS_DIR = os.path.join(PROJECT_ROOT, "public", "data", "areas")
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "public", "data", "summary")

YEAR_LABELS = ["2020年", "2025年", "2030年", "2035年", "2040年", "2045年", "2050年"]
YEARS = [y.replace("年", "") for y in YEAR_LABELS]

# 5歳階級列 (Sheet1, 総数ブロック)
# col 5:計, 6:0-4, 7:5-9, 8:10-14, 9:15-19, 10:20-24, 11:25-29, 12:30-34,
# 13:35-39, 14:40-44, 15:45-49, 16:50-54, 17:55-59, 18:60-64,
# 19:65-69, 20:70-74, 21:75-79, 22:80-84, 23:85-89, 24:90-94, 25:95+
AGE_COLS = {
    "0_4":   6,  "5_9":   7,  "10_14": 8,
    "15_19": 9,  "20_24": 10, "25_29": 11, "30_34": 12, "35_39": 13,
    "40_44": 14, "45_49": 15, "50_54": 16, "55_59": 17, "60_64": 18,
    "65_69": 19, "70_74": 20,
    "75_79": 21, "80_84": 22, "85_89": 23, "90_94": 24, "95_up": 25,
}

# JMAPが使う年齢区分
JMAP_GROUPS = {
    "age0_14":  ["0_4", "5_9", "10_14"],
    "age15_39": ["15_19", "20_24", "25_29", "30_34", "35_39"],
    "age40_64": ["40_44", "45_49", "50_54", "55_59", "60_64"],
    "age65_74": ["65_69", "70_74"],
    "over75":   ["75_79", "80_84", "85_89", "90_94", "95_up"],
}

# JMAP重み
MEDICAL_WEIGHTS = {
    "age0_14":  0.6,
    "age15_39": 0.4,
    "age40_64": 1.0,
    "age65_74": 2.3,
    "over75":   3.9,
}

NURSING_WEIGHTS = {
    "age40_64": 1.0,
    "age65_74": 9.7,
    "over75":   87.3,
}


def compute_demands(buckets):
    """buckets: {age0_14: int, age15_39: int, age40_64: int, age65_74: int, over75: int}
    戻り値: {"medicalDemandRaw": float, "nursingCareDemandRaw": float}
    """
    med = sum(buckets.get(k, 0) * w for k, w in MEDICAL_WEIGHTS.items())
    nur = sum(buckets.get(k, 0) * w for k, w in NURSING_WEIGHTS.items())
    return {"medicalDemandRaw": med, "nursingCareDemandRaw": nur}


def build_year_entry(buckets):
    """JMAP用の1年次エントリ (buckets + demand raw)"""
    entry = dict(buckets)
    entry.update(compute_demands(buckets))
    return entry


def add_indices(years_data):
    """基準年(2020)=100 として指数を付与"""
    base = years_data.get("2020")
    if not base or base["medicalDemandRaw"] == 0:
        return years_data
    base_med = base["medicalDemandRaw"]
    base_nur = base["nursingCareDemandRaw"] if base["nursingCareDemandRaw"] > 0 else None

    for year, e in years_data.items():
        e["medicalIndex"] = round(e["medicalDemandRaw"] / base_med * 100, 1)
        if base_nur:
            e["nursingCareIndex"] = round(e["nursingCareDemandRaw"] / base_nur * 100, 1)
        else:
            e["nursingCareIndex"] = 0
    return years_data


def read_suikei(path):
    """
    IPSS suikei_kekka.xlsx を読み、
      pref: {"01": {"2020": {buckets}, ..., "2050": {}}, ...}
      muni: {"01101": {...}, ...}
    を返す
    """
    print(f"Reading {path} ... (may take a while)")
    df = pd.read_excel(path, sheet_name=0, header=None)
    print(f"  shape: {df.shape}")

    pref = defaultdict(dict)
    muni = defaultdict(dict)

    for _, row in df.iterrows():
        code_raw = row[0]
        kind = row[1]
        year_label = row[4]
        if pd.isna(code_raw) or pd.isna(kind) or pd.isna(year_label):
            continue
        try:
            code_int = int(code_raw)
        except (ValueError, TypeError):
            continue
        year = str(year_label).replace("年", "")
        if year not in YEARS:
            continue

        kind_str = str(kind).strip()
        # 5歳階級値を取得
        five = {}
        for k, c in AGE_COLS.items():
            v = row[c]
            if pd.isna(v):
                five[k] = 0
            else:
                try:
                    five[k] = int(v)
                except (ValueError, TypeError):
                    five[k] = 0

        # JMAP区分に集計
        buckets = {}
        for group, sub_keys in JMAP_GROUPS.items():
            buckets[group] = sum(five[k] for k in sub_keys)

        if kind_str == "a":
            # 都道府県行
            pref_code = f"{code_int // 1000:02d}"
            if 1 <= code_int // 1000 <= 47:
                pref[pref_code][year] = buckets
        elif kind_str in ("0", "2", "3"):
            # 市区町村レベル (政令市区, その他市, 町村) — 5桁コード
            muni_code = f"{code_int:05d}"
            muni[muni_code][year] = buckets
        # '1'(政令市合計) と '9'(浜通り広域) はスキップ: 市区町村では区を使う

    return dict(pref), dict(muni)


def build_area_mapping():
    """hospital data から 構想区域→市区町村(5桁JIS) のマッピングを構築"""
    with open(os.path.join(HOSP_DIR, "index.json"), encoding="utf-8") as f:
        hospitals_idx = json.load(f)

    area_to_munis = defaultdict(set)
    area_to_pref = {}
    area_name_by_code = {}

    for h in hospitals_idx:
        code = h["code"]
        area_code = h.get("areaCode", "")
        area_name = h.get("areaName", "")
        if not area_code:
            continue
        pref = str(h.get("prefecture", "")).zfill(2)

        detail_path = os.path.join(HOSP_DIR, f"{code}.json")
        if not os.path.exists(detail_path):
            continue
        with open(detail_path, encoding="utf-8") as f:
            d = json.load(f)

        muni = d.get("areaCode")
        if muni is None:
            continue
        muni_str = str(muni).zfill(5)
        if muni_str[:2] != pref:
            continue

        area_to_munis[area_code].add(muni_str)
        area_to_pref[area_code] = pref
        if area_name and area_code not in area_name_by_code:
            area_name_by_code[area_code] = area_name

    return dict(area_to_munis), area_to_pref, area_name_by_code


def main():
    if not os.path.exists(RAW_FILE):
        print(f"[ERROR] {RAW_FILE} not found")
        print("  curl -L -o data/raw/ipss/suikei_kekka.xlsx \\")
        print("    https://www.ipss.go.jp/pp-shicyoson/j/shicyoson23/3kekka/suikei_kekka.xlsx")
        return

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # 1. suikei_kekka を読む
    pref_data, muni_data = read_suikei(RAW_FILE)
    print(f"  prefectures with data: {len(pref_data)}")
    print(f"  municipalities with data: {len(muni_data)}")

    # 2. 全国合計 = 47都道府県の合算
    national = {}
    for year in YEARS:
        total_buckets = {g: 0 for g in JMAP_GROUPS.keys()}
        for pref_years in pref_data.values():
            yb = pref_years.get(year)
            if not yb:
                continue
            for g in total_buckets:
                total_buckets[g] += yb.get(g, 0)
        if total_buckets["age40_64"] > 0:
            national[year] = build_year_entry(total_buckets)
    national = add_indices(national)

    # 3. 都道府県別
    prefs_out = {}
    for pref_code, years_buckets in pref_data.items():
        years_out = {}
        for year in YEARS:
            yb = years_buckets.get(year)
            if yb:
                years_out[year] = build_year_entry(yb)
        years_out = add_indices(years_out)
        if years_out:
            prefs_out[pref_code] = {"years": years_out}

    # 4. 構想区域別 (市区町村を area_to_munis で集計)
    area_to_munis, area_to_pref, area_name_by_code = build_area_mapping()
    areas_out = {}
    for area_code, munis in area_to_munis.items():
        years_out = {}
        for year in YEARS:
            total_buckets = {g: 0 for g in JMAP_GROUPS.keys()}
            for muni in munis:
                yb = muni_data.get(muni, {}).get(year)
                if not yb:
                    continue
                for g in total_buckets:
                    total_buckets[g] += yb.get(g, 0)
            if total_buckets["age40_64"] > 0:
                years_out[year] = build_year_entry(total_buckets)
        years_out = add_indices(years_out)
        if years_out:
            areas_out[area_code] = {
                "name": area_name_by_code.get(area_code, area_code),
                "prefecture": area_to_pref.get(area_code, ""),
                "years": years_out,
            }

    # 5. JSON出力
    output = {
        "source": "国立社会保障・人口問題研究所「日本の地域別将来推計人口（令和5年推計）」5歳階級別",
        "sourceUrl": "https://www.ipss.go.jp/pp-shicyoson/j/shicyoson23/t-page.asp",
        "methodology": "日本医師会 JMAP 方式",
        "methodologyUrl": "https://jmap.jp/",
        "baseYear": "2020",
        "years": YEARS,
        "formula": {
            "medical": "0-14歳×0.6 + 15-39歳×0.4 + 40-64歳×1.0 + 65-74歳×2.3 + 75歳以上×3.9",
            "nursingCare": "40-64歳×1.0 + 65-74歳×9.7 + 75歳以上×87.3",
            "index": "各年の需要値を2020年=100として指数化",
        },
        "national": {"years": national},
        "prefectures": prefs_out,
        "areas": areas_out,
    }

    output_path = os.path.join(OUTPUT_DIR, "jmap_index.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, separators=(",", ":"))

    print(f"\nWritten: {output_path}")
    if national:
        print("\n=== 全国 ===")
        for y in YEARS:
            e = national.get(y, {})
            if e:
                print(f"  {y}: 医療需要指数 {e['medicalIndex']}, 介護需要指数 {e['nursingCareIndex']}")


if __name__ == "__main__":
    main()
