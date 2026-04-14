"""
630調査（精神保健福祉資料）前処理スクリプト
都道府県別の精神科医療データをJSONに変換

Usage:
    python preprocess_630.py
"""

import json
import os
import glob

import pandas as pd

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(PROJECT_ROOT, "data", "raw", "630")
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "public", "data", "psychiatric")

PREF_CODES = [
    "01", "02", "03", "04", "05", "06", "07", "08", "09", "10",
    "11", "12", "13", "14", "15", "16", "17", "18", "19", "20",
    "21", "22", "23", "24", "25", "26", "27", "28", "29", "30",
    "31", "32", "33", "34", "35", "36", "37", "38", "39", "40",
    "41", "42", "43", "44", "45", "46", "47",
]


def safe_int(val, default=0):
    if pd.isna(val):
        return default
    try:
        return int(float(str(val).strip().replace(",", "")))
    except (ValueError, TypeError):
        return default


def find_other_file():
    """従来ベース集計ファイルを探す"""
    pattern = os.path.join(RAW_DIR, "r*_other", "*.xlsx")
    files = glob.glob(pattern)
    return files[0] if files else None


def find_shisetu_file():
    """施設概要ファイルを探す"""
    pattern = os.path.join(RAW_DIR, "r*_shisetu", "*.xlsx")
    files = glob.glob(pattern)
    return files[0] if files else None


def parse_pref_hospitals(other_file):
    """Ⅲ.1.(1): 都道府県別の精神科病院数・病床数"""
    df = pd.read_excel(other_file, sheet_name="Ⅲ.1.(1)", header=None)
    results = {}
    for i, pref_code in enumerate(PREF_CODES):
        row_idx = 6 + i  # データは行6から
        pref_name = str(df.iloc[row_idx, 0]).strip()
        results[pref_code] = {
            "prefName": pref_name,
            "hospitals": safe_int(df.iloc[row_idx, 1]) + safe_int(df.iloc[row_idx, 3]) + safe_int(df.iloc[row_idx, 5]) + safe_int(df.iloc[row_idx, 7]),
            "beds": safe_int(df.iloc[row_idx, 2]) + safe_int(df.iloc[row_idx, 4]) + safe_int(df.iloc[row_idx, 6]) + safe_int(df.iloc[row_idx, 8]),
            "psychiatricOnlyHospitals": safe_int(df.iloc[row_idx, 7]),
            "psychiatricOnlyBeds": safe_int(df.iloc[row_idx, 8]),
        }
    return results


def parse_admission_types(other_file):
    """Ⅲ.2.(1): 在院患者数（入院形態別）"""
    df = pd.read_excel(other_file, sheet_name="Ⅲ.2.(1)", header=None)
    results = {}
    for i, pref_code in enumerate(PREF_CODES):
        row_idx = 5 + i  # データ開始行
        results[pref_code] = {
            "involuntary": safe_int(df.iloc[row_idx, 4]),       # 措置入院 計
            "medicalProtection": safe_int(df.iloc[row_idx, 8]), # 医療保護入院 計
            "voluntary": safe_int(df.iloc[row_idx, 12]),        # 任意入院 計
            "other": safe_int(df.iloc[row_idx, 16]),            # その他 計
            "unknown": safe_int(df.iloc[row_idx, 20]),          # 不明 計
            "total": safe_int(df.iloc[row_idx, 24]),            # 合計 計
            # 開放/閉鎖区分
            "openWard": safe_int(df.iloc[row_idx, 21]),         # 合計 夜間外開放
            "closedWard": safe_int(df.iloc[row_idx, 22]),       # 合計 終日閉鎖
            "otherWard": safe_int(df.iloc[row_idx, 23]),        # 合計 左記以外
        }
    return results


def parse_diseases(other_file):
    """Ⅲ.2.(5): 疾患分類別在院患者数"""
    df = pd.read_excel(other_file, sheet_name="Ⅲ.2.(5)", header=None)
    results = {}
    for i, pref_code in enumerate(PREF_CODES):
        row_idx = 5 + i
        results[pref_code] = {
            "F0_dementia": safe_int(df.iloc[row_idx, 1]),      # 認知症(F0)
            "F1_substance": safe_int(df.iloc[row_idx, 5]),     # 精神作用物質(F1)
            "F2_schizophrenia": safe_int(df.iloc[row_idx, 9]), # 統合失調症(F2)
            "F3_mood": safe_int(df.iloc[row_idx, 10]),         # 気分障害(F3)
            "F4_neurotic": safe_int(df.iloc[row_idx, 13]),     # 神経症(F4)
            "F5_behavioral": safe_int(df.iloc[row_idx, 14]),   # 生理的障害(F5)
            "F6_personality": safe_int(df.iloc[row_idx, 15]),  # 人格障害(F6)
            "F7_intellectual": safe_int(df.iloc[row_idx, 16]), # 知的障害(F7)
            "F8_developmental": safe_int(df.iloc[row_idx, 17]), # 発達障害(F8)
            "F9_childhood": safe_int(df.iloc[row_idx, 18]),    # 小児期障害(F9)
            "epilepsy": safe_int(df.iloc[row_idx, 19]),        # てんかん
            "other": safe_int(df.iloc[row_idx, 20]),           # その他
            "total": safe_int(df.iloc[row_idx, 22]),           # 合計
        }
    return results


def parse_length_of_stay(other_file):
    """Ⅲ.2.(11): 在院期間別患者数"""
    df = pd.read_excel(other_file, sheet_name="Ⅲ.2.(11)", header=None)
    results = {}
    for i, pref_code in enumerate(PREF_CODES):
        row_idx = 6 + i
        # 3ヶ月未満 / 3-12ヶ月 / 1年以上 の各カテゴリ（施設所在地ベース）
        under3m_u65 = safe_int(df.iloc[row_idx, 2])
        under3m_o65 = safe_int(df.iloc[row_idx, 3])
        m3_12_u65 = safe_int(df.iloc[row_idx, 6])
        m3_12_o65 = safe_int(df.iloc[row_idx, 7])
        over1y_u65 = safe_int(df.iloc[row_idx, 10])
        over1y_o65 = safe_int(df.iloc[row_idx, 11])
        results[pref_code] = {
            "under3months": under3m_u65 + under3m_o65,
            "months3to12": m3_12_u65 + m3_12_o65,
            "over1year": over1y_u65 + over1y_o65,
            "under3months_u65": under3m_u65,
            "under3months_o65": under3m_o65,
            "months3to12_u65": m3_12_u65,
            "months3to12_o65": m3_12_o65,
            "over1year_u65": over1y_u65,
            "over1year_o65": over1y_o65,
        }
    return results


def parse_facility_overview(shisetu_file):
    """施設概要: 職員数等"""
    df = pd.read_excel(shisetu_file, sheet_name=1, header=None)
    results = {}
    for i, pref_code in enumerate(PREF_CODES):
        row_idx = 6 + i
        results[pref_code] = {
            "hospitals": safe_int(df.iloc[row_idx, 2]),
            "beds": safe_int(df.iloc[row_idx, 6]),
            "permittedBeds": safe_int(df.iloc[row_idx, 7]),
            "inpatients": safe_int(df.iloc[row_idx, 10]),
            "protectionRooms": safe_int(df.iloc[row_idx, 12]),
            # 職員数
            "psychiatrists_ft": safe_int(df.iloc[row_idx, 15]),       # 精神科医師（常勤）
            "psychiatrists_pt": safe_int(df.iloc[row_idx, 16]),       # 精神科医師（非常勤）
            "designated_psychiatrists_ft": safe_int(df.iloc[row_idx, 17]),  # 精神保健指定医（常勤）
            "nurses_ft": safe_int(df.iloc[row_idx, 21]),              # 看護師（常勤）
            "nurses_pt": safe_int(df.iloc[row_idx, 22]),              # 看護師（非常勤）
            "asst_nurses_ft": safe_int(df.iloc[row_idx, 31]),        # 准看護師（常勤）
            "asst_nurses_pt": safe_int(df.iloc[row_idx, 32]),        # 准看護師（非常勤）
            "nurse_aides_ft": safe_int(df.iloc[row_idx, 33]),        # 看護補助者（常勤）
            "nurse_aides_pt": safe_int(df.iloc[row_idx, 34]),        # 看護補助者（非常勤）
            "pt_ft": safe_int(df.iloc[row_idx, 35]),                  # 理学療法士（常勤）
            "pt_pt": safe_int(df.iloc[row_idx, 36]),                  # 理学療法士（非常勤）
            "ot_ft": safe_int(df.iloc[row_idx, 39]),                  # 作業療法士（常勤）
            "ot_pt": safe_int(df.iloc[row_idx, 40]),                  # 作業療法士（非常勤）
            "psw_ft": safe_int(df.iloc[row_idx, 43]),                 # 精神保健福祉士（常勤）
            "psw_pt": safe_int(df.iloc[row_idx, 44]),                 # 精神保健福祉士（非常勤）
            "psychologists_ft": safe_int(df.iloc[row_idx, 47]),       # 臨床心理技術者（常勤）
            "psychologists_pt": safe_int(df.iloc[row_idx, 48]),       # 臨床心理技術者（非常勤）
            "medicalProtectionPatients": safe_int(df.iloc[row_idx, 62]),
            "involuntaryPatients": safe_int(df.iloc[row_idx, 63]),
        }
    return results


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    other_file = find_other_file()
    shisetu_file = find_shisetu_file()

    if not other_file:
        print("No 従来ベース集計 file found.")
        return

    print(f"Processing: {os.path.basename(other_file)}")

    # 各シートからデータ取得
    hospitals_data = parse_pref_hospitals(other_file)
    admission_data = parse_admission_types(other_file)
    disease_data = parse_diseases(other_file)
    los_data = parse_length_of_stay(other_file)
    facility_data = parse_facility_overview(shisetu_file) if shisetu_file else {}

    # 都道府県別に統合
    pref_data = {}
    for pref_code in PREF_CODES:
        pref_data[pref_code] = {
            "prefCode": pref_code,
            "prefName": hospitals_data[pref_code]["prefName"],
            "overview": hospitals_data[pref_code],
            "admissionTypes": admission_data.get(pref_code, {}),
            "diseases": disease_data.get(pref_code, {}),
            "lengthOfStay": los_data.get(pref_code, {}),
            "facility": facility_data.get(pref_code, {}),
        }

    # 全国合計の計算
    national = {
        "prefCode": "00",
        "prefName": "全国",
        "overview": {k: sum(p["overview"].get(k, 0) for p in pref_data.values()) for k in ["hospitals", "beds", "psychiatricOnlyHospitals", "psychiatricOnlyBeds"]},
        "admissionTypes": {k: sum(p["admissionTypes"].get(k, 0) for p in pref_data.values()) for k in ["involuntary", "medicalProtection", "voluntary", "other", "unknown", "total", "openWard", "closedWard", "otherWard"]},
        "diseases": {k: sum(p["diseases"].get(k, 0) for p in pref_data.values()) for k in disease_data[PREF_CODES[0]].keys()},
        "lengthOfStay": {k: sum(p["lengthOfStay"].get(k, 0) for p in pref_data.values()) for k in los_data[PREF_CODES[0]].keys()},
    }

    # JSON出力
    output = {
        "national": national,
        "prefectures": pref_data,
    }
    output_path = os.path.join(OUTPUT_DIR, "630_summary.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, separators=(",", ":"))

    print(f"Output: {output_path}")
    print(f"  National: {national['overview']['hospitals']} hospitals, {national['overview']['beds']} beds")
    print(f"  Inpatients: {national['admissionTypes']['total']}")
    print("Done!")


if __name__ == "__main__":
    main()
