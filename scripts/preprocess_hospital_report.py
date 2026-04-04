"""
病院報告データ前処理スクリプト
厚生労働省「病院報告」統計表から都道府県別病床利用率・平均在院日数JSONを生成

Usage:
    python preprocess_hospital_report.py
"""

import json
import os
import re

import pandas as pd

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(PROJECT_ROOT, "data", "raw", "hospital_report")
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "public", "data", "summary")

# 都道府県名→コードマッピング
PREF_NAME_TO_CODE = {
    "北海道": "01", "青森": "02", "岩手": "03", "宮城": "04", "秋田": "05",
    "山形": "06", "福島": "07", "茨城": "08", "栃木": "09", "群馬": "10",
    "埼玉": "11", "千葉": "12", "東京": "13", "神奈川": "14", "新潟": "15",
    "富山": "16", "石川": "17", "福井": "18", "山梨": "19", "長野": "20",
    "岐阜": "21", "静岡": "22", "愛知": "23", "三重": "24", "滋賀": "25",
    "京都": "26", "大阪": "27", "兵庫": "28", "奈良": "29", "和歌山": "30",
    "鳥取": "31", "島根": "32", "岡山": "33", "広島": "34", "山口": "35",
    "徳島": "36", "香川": "37", "愛媛": "38", "高知": "39", "福岡": "40",
    "佐賀": "41", "長崎": "42", "熊本": "43", "大分": "44", "宮崎": "45",
    "鹿児島": "46", "沖縄": "47",
}

# ファイルと年度のマッピング
FILE_CONFIGS = [
    {
        "file": "byouintoukei_r6_2024.xlsx",
        "year": "2024",
        "sheet": "統計表４",
        "data_start_row": 6,  # 全国
        "pref_start_row": 7,  # 北海道
        "cols": {
            "pref_name": 2,
            "total_util": 4,
            "psychiatric_util": 5,
            "infectious_util": 6,
            "tb_util": 7,
            "therapy_util": 8,
            "general_util": 9,
            "total_stay": 10,
            "psychiatric_stay": 11,
            "infectious_stay": 12,
            "tb_stay": 13,
            "therapy_stay": 14,
            "general_stay": 15,
        },
    },
    {
        "file": "byouintoukei_r5_2023.xlsx",
        "year": "2023",
        "sheet": "統計表4-1",  # R5は4-1と4-2に分割
        "data_start_row": 6,
        "pref_start_row": 7,
        "cols": {
            "pref_name": 2,
            "total_util": 4,
            "psychiatric_util": 5,
            "infectious_util": 6,
            "tb_util": 7,
            "therapy_util": 8,
            "general_util": 9,
            "total_stay": 10,
            "psychiatric_stay": 11,
            "infectious_stay": 12,
            "tb_stay": 13,
            "therapy_stay": 14,
            "general_stay": 15,
        },
    },
    {
        "file": "byouintoukei_r4_2022.xlsx",
        "year": "2022",
        "sheet": "統計表４ ",  # 末尾スペースあり
        "data_start_row": 6,
        "pref_start_row": 7,
        "cols": {
            "pref_name": 2,
            "total_util": 4,
            "psychiatric_util": 5,
            "infectious_util": 6,
            "tb_util": 7,
            "therapy_util": 8,
            "general_util": 9,
            "total_stay": 10,
            "psychiatric_stay": 11,
            "infectious_stay": 12,
            "tb_stay": 13,
            "therapy_stay": 14,
            "general_stay": 15,
        },
    },
    {
        "file": "byouintoukei_r3_2021.xlsx",
        "year": "2021",
        "sheet": "統計表４ ",  # 末尾スペースあり
        "data_start_row": 6,
        "pref_start_row": 7,
        "cols": {
            "pref_name": 2,
            "total_util": 4,
            "psychiatric_util": 5,
            "infectious_util": 6,
            "tb_util": 7,
            "therapy_util": 8,
            "general_util": 9,
            "total_stay": 10,
            "psychiatric_stay": 11,
            "infectious_stay": 12,
            "tb_stay": 13,
            "therapy_stay": 14,
            "general_stay": 15,
        },
    },
]


def safe_float(val):
    """安全にfloatに変換"""
    if pd.isna(val):
        return None
    s = str(val).strip()
    if s in ("", "-", "－", "…", "･", "x"):
        return None
    try:
        return round(float(s), 1)
    except (ValueError, TypeError):
        return None


def find_sheet(xls, target):
    """シート名を柔軟にマッチング（空白の差異を吸収）"""
    target_clean = target.strip()
    for name in xls.sheet_names:
        if name.strip() == target_clean:
            return name
        # 数字の全角半角揺れ対応
        if target_clean.replace("４", "4") == name.strip().replace("４", "4"):
            return name
    # 部分一致
    for name in xls.sheet_names:
        if "利用率" in str(name) or ("統計表" in str(name) and ("4" in str(name) or "４" in str(name))):
            return name
    return None


def process_file(config):
    """1ファイル分の処理"""
    filepath = os.path.join(RAW_DIR, config["file"])
    if not os.path.exists(filepath):
        print(f"  SKIP: {config['file']} not found")
        return None

    print(f"  Reading: {config['file']} (year={config['year']})")
    xls = pd.ExcelFile(filepath)

    sheet = find_sheet(xls, config["sheet"])
    if sheet is None:
        print(f"  ERROR: sheet '{config['sheet']}' not found in {xls.sheet_names}")
        return None

    df = pd.read_excel(xls, sheet_name=sheet, header=None)
    cols = config["cols"]

    # 全国データ
    national_row = config["data_start_row"]
    national = {
        "totalUtilization": safe_float(df.iloc[national_row, cols["total_util"]]),
        "generalUtilization": safe_float(df.iloc[national_row, cols["general_util"]]),
        "therapyUtilization": safe_float(df.iloc[national_row, cols["therapy_util"]]),
        "psychiatricUtilization": safe_float(df.iloc[national_row, cols["psychiatric_util"]]),
        "totalAvgStay": safe_float(df.iloc[national_row, cols["total_stay"]]),
        "generalAvgStay": safe_float(df.iloc[national_row, cols["general_stay"]]),
        "therapyAvgStay": safe_float(df.iloc[national_row, cols["therapy_stay"]]),
    }

    # 都道府県データ
    prefectures = {}
    for row_idx in range(config["pref_start_row"], len(df)):
        name_raw = df.iloc[row_idx, cols["pref_name"]]
        if pd.isna(name_raw):
            continue
        name = str(name_raw).strip()

        # 都道府県名→コード
        pref_code = None
        for pname, pcode in PREF_NAME_TO_CODE.items():
            if name.startswith(pname) or pname.startswith(name):
                pref_code = pcode
                break

        if not pref_code:
            continue

        prefectures[pref_code] = {
            "totalUtilization": safe_float(df.iloc[row_idx, cols["total_util"]]),
            "generalUtilization": safe_float(df.iloc[row_idx, cols["general_util"]]),
            "therapyUtilization": safe_float(df.iloc[row_idx, cols["therapy_util"]]),
            "psychiatricUtilization": safe_float(df.iloc[row_idx, cols["psychiatric_util"]]),
            "totalAvgStay": safe_float(df.iloc[row_idx, cols["total_stay"]]),
            "generalAvgStay": safe_float(df.iloc[row_idx, cols["general_stay"]]),
            "therapyAvgStay": safe_float(df.iloc[row_idx, cols["therapy_stay"]]),
        }

    print(f"    National: util={national['totalUtilization']}%, general={national['generalUtilization']}%")
    print(f"    Prefectures: {len(prefectures)}")

    return {
        "year": config["year"],
        "national": national,
        "prefectures": prefectures,
    }


def main():
    print("=== 病院報告データ前処理 ===\n")

    all_years = []
    for config in FILE_CONFIGS:
        result = process_file(config)
        if result:
            all_years.append(result)

    if not all_years:
        print("\nERROR: No data processed")
        return

    # 年度でソート
    all_years.sort(key=lambda x: x["year"])

    # JSON出力
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    output = {
        "source": "厚生労働省 病院報告",
        "years": {y["year"]: {"national": y["national"], "prefectures": y["prefectures"]} for y in all_years},
    }

    output_path = os.path.join(OUTPUT_DIR, "hospital_report.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, separators=(",", ":"))

    print(f"\nWritten: {output_path}")
    print(f"Years: {[y['year'] for y in all_years]}")

    # サマリー
    for y in all_years:
        nat = y["national"]
        print(f"\n{y['year']}年: 全国病床利用率 {nat['totalUtilization']}% (一般 {nat['generalUtilization']}%, 療養 {nat['therapyUtilization']}%)")


if __name__ == "__main__":
    main()
