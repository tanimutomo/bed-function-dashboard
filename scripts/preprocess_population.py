"""
人口データ前処理スクリプト
e-Stat「統計でみる市区町村のすがた」Excelから人口・高齢化率JSONを生成

Usage:
    python preprocess_population.py
"""

import json
import os
import re
from collections import defaultdict

import pandas as pd

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(PROJECT_ROOT, "data", "raw")
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "public", "data")

# e-Stat Excel column indices (0-based)
COL_MUNI_CODE = 1       # 市区町村コード (4-6桁)
COL_MUNI_NAME_JP = 8    # 市区町村名（日本語）
COL_TOTAL_POP = 10      # 総人口 (A1101, 国勢調査)
COL_POP_UNDER15 = 14    # 15歳未満人口 (A1301)
COL_POP_15_64 = 15      # 15-64歳人口 (A1302)
COL_POP_65OVER = 16     # 65歳以上人口 (A1303)
COL_JUKI_POP = 13       # 住民基本台帳人口 (A2301, より新しい)
DATA_START_ROW = 10     # データ開始行


def normalize_muni_code(code_val):
    """市区町村コードを標準5桁コードに変換"""
    if pd.isna(code_val):
        return None
    code = str(int(code_val))
    # 4桁以下は都道府県コード等、スキップ
    if len(code) <= 2:
        return None
    # 3-4桁は都道府県レベル (e.g., 1000=北海道)
    if code.endswith("000") or code.endswith("00"):
        return None
    # 5桁の市区町村コードに正規化
    return code.zfill(5)


def load_population_data(filepath):
    """e-Stat Excelから市区町村別人口データを読み込み"""
    print(f"Reading: {filepath}")
    df = pd.read_excel(filepath, engine="xlrd", header=None, sheet_name=0)

    # データ年を取得
    year_row = df.iloc[9].tolist()
    census_year = str(int(year_row[COL_TOTAL_POP]))
    juki_year = str(int(year_row[COL_JUKI_POP])) if not pd.isna(year_row[COL_JUKI_POP]) else None
    print(f"  Census year: {census_year}, Juki year: {juki_year}")

    municipalities = {}
    for idx in range(DATA_START_ROW, len(df)):
        row = df.iloc[idx]
        code = normalize_muni_code(row.iloc[COL_MUNI_CODE])
        if code is None:
            continue

        name = str(row.iloc[COL_MUNI_NAME_JP]).strip() if not pd.isna(row.iloc[COL_MUNI_NAME_JP]) else ""
        def safe_int(val):
            if pd.isna(val):
                return 0
            try:
                return int(val)
            except (ValueError, TypeError):
                return 0

        total_pop = safe_int(row.iloc[COL_TOTAL_POP])
        pop_under15 = safe_int(row.iloc[COL_POP_UNDER15])
        pop_15_64 = safe_int(row.iloc[COL_POP_15_64])
        pop_65over = safe_int(row.iloc[COL_POP_65OVER])
        juki_pop = safe_int(row.iloc[COL_JUKI_POP])

        if total_pop == 0:
            continue

        aging_rate = round(pop_65over / total_pop * 100, 1) if total_pop > 0 else 0

        municipalities[code] = {
            "code": code,
            "name": name,
            "totalPopulation": total_pop,
            "populationUnder15": pop_under15,
            "population15to64": pop_15_64,
            "population65over": pop_65over,
            "agingRate": aging_rate,
            "jukiPopulation": juki_pop,
            "censusYear": census_year,
        }

    print(f"  Loaded {len(municipalities)} municipalities")
    return municipalities, census_year


def build_area_mapping(municipalities):
    """既存の病院データから市区町村→構想区域のマッピングを構築"""
    hospitals_dir = os.path.join(OUTPUT_DIR, "hospitals")
    index_path = os.path.join(hospitals_dir, "index.json")

    if not os.path.exists(index_path):
        print("  WARNING: hospitals/index.json not found")
        return {}

    with open(index_path) as f:
        hospitals = json.load(f)

    # 各病院の病院コードから都道府県+市区町村を推定し、構想区域にマッピング
    # 病院コードの先頭2桁 = 都道府県コード
    area_mapping = {}  # muni_code -> area_code
    for h in hospitals:
        area_code = h.get("areaCode", "")
        if area_code:
            # エリアインデックスからこのエリアに属する市区町村を特定
            pass

    # 代わりに、エリアJSONの病院リストから市区町村を推定
    areas_dir = os.path.join(OUTPUT_DIR, "areas")
    area_index_path = os.path.join(areas_dir, "index.json")
    if not os.path.exists(area_index_path):
        return {}

    with open(area_index_path) as f:
        area_index = json.load(f)

    # 構想区域コード (4桁) と市区町村コード (5桁) の対応を構築
    # 構想区域JSONに含まれる病院の所在地から推定
    # → 病院indexのareaCodeとprefectureから、都道府県別に集計する方が確実

    return {}


def aggregate_by_prefecture(municipalities):
    """都道府県別に集計"""
    pref_data = defaultdict(lambda: {
        "totalPopulation": 0,
        "populationUnder15": 0,
        "population15to64": 0,
        "population65over": 0,
    })

    for code, m in municipalities.items():
        # 市区町村コード先頭2桁 = 都道府県コード
        pref_code = str(int(code[:2]))
        pref_data[pref_code]["totalPopulation"] += m["totalPopulation"]
        pref_data[pref_code]["populationUnder15"] += m["populationUnder15"]
        pref_data[pref_code]["population15to64"] += m["population15to64"]
        pref_data[pref_code]["population65over"] += m["population65over"]

    result = {}
    for pref_code, data in pref_data.items():
        total = data["totalPopulation"]
        result[pref_code] = {
            **data,
            "agingRate": round(data["population65over"] / total * 100, 1) if total > 0 else 0,
        }

    return result


def aggregate_by_area(municipalities):
    """構想区域別に集計（病院indexのareaCodeで市区町村をグループ化）"""
    hospitals_path = os.path.join(OUTPUT_DIR, "hospitals", "index.json")
    if not os.path.exists(hospitals_path):
        return {}

    with open(hospitals_path) as f:
        hospitals = json.load(f)

    # エリアの詳細JSONから、エリア内の病院コードを取得し、
    # その病院が所在する市区町村を特定する
    areas_dir = os.path.join(OUTPUT_DIR, "areas")
    area_index_path = os.path.join(areas_dir, "index.json")
    if not os.path.exists(area_index_path):
        return {}

    with open(area_index_path) as f:
        area_index = json.load(f)

    # 構想区域コード → 所属する市区町村コードのセットを構築
    # 構想区域ファイルから病院を取得し、病院コードから市区町村を推定
    area_to_munis = defaultdict(set)

    for area_info in area_index:
        area_code = area_info["code"]
        area_path = os.path.join(areas_dir, f"{area_code}.json")
        if not os.path.exists(area_path):
            continue
        with open(area_path) as f:
            area_data = json.load(f)

        # 構想区域コードが5桁 = 市区町村コードそのもの
        if len(str(area_code)) >= 5:
            muni_code = str(area_code).zfill(5)
            if muni_code in municipalities:
                area_to_munis[area_code].add(muni_code)

    # 4桁の構想区域コードには、病院indexから所属する市区町村を集める
    # 病院コードから市区町村を直接紐づけるのは難しいので、
    # 病院indexのprefectureとareaCodeから、各エリアの都道府県内集計にする

    # 構想区域ごとの都道府県コードを取得
    area_pref = {}
    for area_info in area_index:
        area_pref[area_info["code"]] = area_info.get("prefecture", "")

    # 病院indexから、各構想区域に属する病院の個別JSONを参照し、
    # そこのareaCodeから市区町村を推定
    hosp_by_area = defaultdict(list)
    for h in hospitals:
        hosp_by_area[h["areaCode"]].append(h)

    # 各構想区域に対し、個別病院JSONのareaCodeから市区町村マッピング
    for area_code, hosps in hosp_by_area.items():
        if area_code in area_to_munis and len(area_to_munis[area_code]) > 0:
            continue
        # 病院の個別JSONを確認して、そこのareaCodeを取得
        for h in hosps:
            hosp_path = os.path.join(OUTPUT_DIR, "hospitals", f"{h['code']}.json")
            if os.path.exists(hosp_path):
                with open(hosp_path) as f:
                    hosp_data = json.load(f)
                muni_code = hosp_data.get("areaCode", "")
                if muni_code and len(str(muni_code)) >= 5:
                    muni_code_str = str(muni_code).zfill(5)
                    if muni_code_str in municipalities:
                        area_to_munis[area_code].add(muni_code_str)

    # 集計
    result = {}
    for area_code, muni_codes in area_to_munis.items():
        data = {
            "totalPopulation": 0,
            "populationUnder15": 0,
            "population15to64": 0,
            "population65over": 0,
        }
        for mc in muni_codes:
            m = municipalities.get(mc, {})
            data["totalPopulation"] += m.get("totalPopulation", 0)
            data["populationUnder15"] += m.get("populationUnder15", 0)
            data["population15to64"] += m.get("population15to64", 0)
            data["population65over"] += m.get("population65over", 0)

        total = data["totalPopulation"]
        if total > 0:
            result[area_code] = {
                **data,
                "agingRate": round(data["population65over"] / total * 100, 1),
            }

    return result


def main():
    # 最新のExcelファイルを使用
    pop_file = os.path.join(RAW_DIR, "population_2025.xlsx")
    if not os.path.exists(pop_file):
        pop_file = os.path.join(RAW_DIR, "population_2024.xlsx")
    if not os.path.exists(pop_file):
        print("ERROR: population Excel file not found in data/raw/")
        return

    municipalities, census_year = load_population_data(pop_file)

    # 都道府県別集計
    print("\nAggregating by prefecture...")
    pref_data = aggregate_by_prefecture(municipalities)
    print(f"  {len(pref_data)} prefectures")

    # 構想区域別集計
    print("\nAggregating by planning area...")
    area_data = aggregate_by_area(municipalities)
    print(f"  {len(area_data)} areas")

    # JSON出力
    summary_dir = os.path.join(OUTPUT_DIR, "summary")
    os.makedirs(summary_dir, exist_ok=True)

    # 都道府県別人口
    output = {
        "censusYear": census_year,
        "prefectures": pref_data,
    }
    pref_path = os.path.join(summary_dir, "population.json")
    with open(pref_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, separators=(",", ":"))
    print(f"\nWritten: {pref_path}")

    # 構想区域別人口
    area_output = {
        "censusYear": census_year,
        "areas": area_data,
    }
    area_pop_path = os.path.join(summary_dir, "population_areas.json")
    with open(area_pop_path, "w", encoding="utf-8") as f:
        json.dump(area_output, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Written: {area_pop_path}")

    # 市区町村別人口（全件）
    muni_path = os.path.join(summary_dir, "population_municipalities.json")
    with open(muni_path, "w", encoding="utf-8") as f:
        json.dump({"censusYear": census_year, "municipalities": municipalities},
                  f, ensure_ascii=False, separators=(",", ":"))
    print(f"Written: {muni_path}")

    # サマリー表示
    print(f"\n=== Summary ===")
    print(f"Census year: {census_year}")
    print(f"Municipalities: {len(municipalities)}")
    print(f"Prefectures: {len(pref_data)}")
    print(f"Planning areas: {len(area_data)}")

    # 都道府県の高齢化率 top/bottom
    sorted_pref = sorted(pref_data.items(), key=lambda x: x[1]["agingRate"], reverse=True)
    print(f"\n高齢化率 上位5都道府県:")
    for code, data in sorted_pref[:5]:
        print(f"  {code}: {data['agingRate']}% (人口 {data['totalPopulation']:,})")
    print(f"高齢化率 下位5都道府県:")
    for code, data in sorted_pref[-5:]:
        print(f"  {code}: {data['agingRate']}% (人口 {data['totalPopulation']:,})")


if __name__ == "__main__":
    main()
