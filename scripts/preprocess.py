"""
病床機能報告データ前処理スクリプト
XLSX → JSON変換

Usage:
    python preprocess.py            # 全年度処理
    python preprocess.py --year R5  # 特定年度のみ
"""

import csv
import json
import os
import re
import sys
import glob
import unicodedata
import warnings
from collections import defaultdict

import pandas as pd

warnings.filterwarnings("ignore", category=UserWarning, module="openpyxl")

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(PROJECT_ROOT, "data", "raw")
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "public", "data")

YEAR_MAP = {"R1": "2019", "R2": "2020", "R3": "2021", "R4": "2022", "R5": "2023", "R6": "2024"}

# 医療機能の日本語→英語マッピング
FUNCTION_MAP = {
    "高度急性期": "high_acute",
    "急性期": "acute",
    "回復期": "recovery",
    "慢性期": "chronic",
}

# ヘッダー行数（データは row 6 から開始）
HEADER_ROWS = 6

# 様式1のカラムインデックス（R3-R5）
Y1_COLS = {
    "hospital_code": 0,
    "hospital_name": 1,
    "pref_code": 2,
    "area_code": 5,
    "area_name": 6,
    "ward_code": 11,
    "ward_name": 12,
    "current_function": 15,
    "future_function": 16,
    "general_beds_permitted": 18,
    "general_beds_max": 19,
    "therapy_beds_permitted": 22,
    "therapy_beds_max": 23,
    "admission_fee": 32,
    "admission_fee_beds": 33,
    # 職員数（常勤）
    "nurses": 39,       # 看護師（常勤）
    "asst_nurses": 41,  # 准看護師（常勤）
    # 入院患者数
    "new_admissions_annual": 65,
    "planned_admissions_annual": 78,
}

# R6ではカラム構成が変更（介護療養病床関連列が削除されて左に6列シフト）
Y1_COLS_R6 = {
    "hospital_code": 0,
    "hospital_name": 1,
    "pref_code": 2,
    "area_code": 5,
    "area_name": 6,
    "ward_code": 11,
    "ward_name": 12,
    "current_function": 15,
    "future_function": 16,
    "general_beds_permitted": 18,
    "general_beds_max": 19,
    "therapy_beds_permitted": 22,
    "therapy_beds_max": 23,
    "admission_fee": 26,
    "admission_fee_beds": 27,
    # 職員数（常勤）
    "nurses": 32,       # 看護師（常勤）
    "asst_nurses": 34,  # 准看護師（常勤）
    # 入院患者数
    "new_admissions_annual": 58,
    "planned_admissions_annual": 71,
}

# 様式2年間合計のカラムインデックス（R3-R5）
Y2_COLS = {
    "hospital_code": 0,
    "hospital_name": 1,
    "pref_code": 2,
    "area_code": 5,
    "area_name": 6,
    "ward_code": 11,
    "ward_name": 12,
    # 手術
    "surgeries_total": 82,
    "surgeries_ga": 95,       # 全身麻酔手術
    "heart_lung_surgery": 108,  # 人工心肺手術
    # がん・脳卒中等
    "cancer_surgery": 112,     # 悪性腫瘍手術
    "radiotherapy": 115,       # 放射線治療
    "chemotherapy": 116,       # 化学療法
    "tpa": 121,               # t-PA
    # 救急
    "triage": 145,             # 院内トリアージ
    # リハビリ
    "rehab": 179,             # 疾患別リハビリテーション料
    # 全身管理
    "dialysis": 177,          # 人工腎臓・腹膜灌流
}

# R6ではカラムが1列左にシフト
Y2_COLS_R6 = {
    "hospital_code": 0,
    "hospital_name": 1,
    "pref_code": 2,
    "area_code": 5,
    "area_name": 6,
    "ward_code": 11,
    "ward_name": 12,
    "surgeries_total": 81,
    "surgeries_ga": 94,
    "heart_lung_surgery": 107,
    "cancer_surgery": 111,
    "radiotherapy": 114,
    "chemotherapy": 115,
    "tpa": 120,
    "triage": 144,
    "rehab": 184,
    "dialysis": 182,
}

# 施設票のカラムインデックス
SHISETSU_COLS = {
    "type": 0,               # 病診区分
    "hospital_code": 1,
    "hospital_name": 2,
    "pref_code": 3,
    "secondary_area_code": 4,
    "secondary_area_name": 5,
    "area_code": 6,
    "area_name": 7,
    "city_code": 8,
    "city_name": 9,
    "emergency_transports_annual": 154,  # 救急車受入件数（年間）
}


def safe_int(val, default=0):
    """安全に整数変換"""
    if pd.isna(val):
        return default
    try:
        s = str(val).strip()
        if s in ("", "-", "－", "未報告又はデータ不備"):
            return default
        return int(float(s))
    except (ValueError, TypeError):
        return default


def safe_str(val, default=""):
    if pd.isna(val):
        return default
    return str(val).strip()


def ward_key(ward_code: str) -> str:
    """病棟コードから医療機関コード+病棟番号を抽出。
    病棟コードは13桁: 先頭10桁=医療機関コード, 11桁目=フォーム番号(1or2), 最後2桁=病棟番号。
    様式1と様式2で11桁目が異なるので、それを除いてマッチングする。
    """
    s = str(ward_code).strip()
    if len(s) >= 13:
        return s[:10] + s[11:]  # 医療機関コード + 病棟番号
    return s


def load_yoshiki1(year: str) -> pd.DataFrame:
    """様式1（病棟票）を全地域分結合して読み込み"""
    year_dir = os.path.join(RAW_DIR, year)
    pattern = os.path.join(year_dir, "yoshiki1_*.xlsx")
    files = sorted(glob.glob(pattern))
    if not files:
        print(f"  No yoshiki1 files found for {year}")
        return pd.DataFrame()

    dfs = []
    for f in files:
        print(f"  Reading: {os.path.basename(f)}")
        df = pd.read_excel(f, header=None, skiprows=HEADER_ROWS)
        dfs.append(df)
    return pd.concat(dfs, ignore_index=True)


def load_yoshiki2_annual(year: str) -> pd.DataFrame:
    """様式2年間合計を読み込み"""
    year_dir = os.path.join(RAW_DIR, year)
    fpath = os.path.join(year_dir, "yoshiki2_annual.xlsx")
    if not os.path.exists(fpath):
        print(f"  No yoshiki2_annual.xlsx found for {year}")
        return pd.DataFrame()
    print(f"  Reading: yoshiki2_annual.xlsx")
    return pd.read_excel(fpath, header=None, skiprows=HEADER_ROWS)


def load_shisetsu(year: str) -> pd.DataFrame:
    """施設票を読み込み"""
    year_dir = os.path.join(RAW_DIR, year)
    fpath = os.path.join(year_dir, "shisetsu.xlsx")
    if not os.path.exists(fpath):
        print(f"  No shisetsu.xlsx found for {year}")
        return pd.DataFrame()
    print(f"  Reading: shisetsu.xlsx")
    return pd.read_excel(fpath, header=None, skiprows=HEADER_ROWS)


def process_year(year: str) -> dict:
    """1年度分のデータを処理し、集計結果を返す"""
    fiscal_year = YEAR_MAP[year]
    print(f"\n=== Processing {year} ({fiscal_year}) ===")

    # データ読み込み
    df_y1 = load_yoshiki1(year)
    df_y2 = load_yoshiki2_annual(year)
    df_sh = load_shisetsu(year)

    if df_y1.empty:
        print(f"  Skipping {year}: no data")
        return {}

    # --- 施設情報のマスタ作成 ---
    hospital_master = {}
    emergency_by_hospital = {}
    if not df_sh.empty:
        for _, row in df_sh.iterrows():
            code = safe_str(row.iloc[SHISETSU_COLS["hospital_code"]])
            if not code:
                continue
            hospital_master[code] = {
                "type": safe_str(row.iloc[SHISETSU_COLS["type"]]),
                "name": safe_str(row.iloc[SHISETSU_COLS["hospital_name"]]),
                "prefCode": safe_str(row.iloc[SHISETSU_COLS["pref_code"]]),
                "areaCode": safe_str(row.iloc[SHISETSU_COLS["area_code"]]),
                "areaName": safe_str(row.iloc[SHISETSU_COLS["area_name"]]),
                "cityCode": safe_str(row.iloc[SHISETSU_COLS["city_code"]]),
                "cityName": safe_str(row.iloc[SHISETSU_COLS["city_name"]]),
            }
            emergency_by_hospital[code] = safe_int(
                row.iloc[SHISETSU_COLS["emergency_transports_annual"]]
            )

    # --- 様式2（年間合計）から診療実績をインデックス ---
    # 病棟コードの11桁目が様式番号で異なるため、ward_key()で正規化してマッチング
    y2_cols = Y2_COLS_R6 if year == "R6" else Y2_COLS
    perf_by_ward = {}
    if not df_y2.empty:
        for _, row in df_y2.iterrows():
            raw_ward_code = safe_str(row.iloc[y2_cols["ward_code"]])
            if not raw_ward_code:
                continue
            wk = ward_key(raw_ward_code)
            perf_by_ward[wk] = {
                "surgeries": safe_int(row.iloc[y2_cols["surgeries_total"]]),
                "surgeriesGA": safe_int(row.iloc[y2_cols["surgeries_ga"]]),
                "heartLungSurgery": safe_int(row.iloc[y2_cols["heart_lung_surgery"]]),
                "cancerSurgery": safe_int(row.iloc[y2_cols["cancer_surgery"]]),
                "radiotherapy": safe_int(row.iloc[y2_cols["radiotherapy"]]),
                "chemotherapy": safe_int(row.iloc[y2_cols["chemotherapy"]]),
                "tpa": safe_int(row.iloc[y2_cols["tpa"]]),
                "dialysis": safe_int(row.iloc[y2_cols["dialysis"]]),
                "rehab": safe_int(row.iloc[y2_cols["rehab"]]),
            }

    # R6ではカラム構成が変更されている
    y1_cols = Y1_COLS_R6 if year == "R6" else Y1_COLS

    # --- 様式1（病棟票）を処理 ---
    # 病院ごとに病棟情報を集計
    hospitals = defaultdict(lambda: {
        "code": "",
        "name": "",
        "prefCode": "",
        "areaCode": "",
        "areaName": "",
        "totalBeds": 0,
        "bedsByFunction": {"high_acute": 0, "acute": 0, "recovery": 0, "chronic": 0},
        "futureBedsByFunction": {"high_acute": 0, "acute": 0, "recovery": 0, "chronic": 0},
        "recoveryRelatedBeds": 0,  # 回復期 + 地域包括ケア病棟の病床数
        "nurses": 0,
        "newAdmissions": 0,
        "plannedAdmissions": 0,
        "surgeries": 0,
        "surgeriesGA": 0,
        "heartLungSurgery": 0,
        "cancerSurgery": 0,
        "radiotherapy": 0,
        "chemotherapy": 0,
        "tpa": 0,
        "dialysis": 0,
        "rehab": 0,
        "emergencyTransports": 0,
        "wards": [],
    })

    for _, row in df_y1.iterrows():
        code = safe_str(row.iloc[y1_cols["hospital_code"]])
        if not code:
            continue

        h = hospitals[code]
        h["code"] = code
        h["name"] = safe_str(row.iloc[y1_cols["hospital_name"]])
        h["prefCode"] = safe_str(row.iloc[y1_cols["pref_code"]])
        h["areaCode"] = safe_str(row.iloc[y1_cols["area_code"]])
        h["areaName"] = safe_str(row.iloc[y1_cols["area_name"]])

        # 機能区分
        current_func_jp = safe_str(row.iloc[y1_cols["current_function"]])
        future_func_jp = safe_str(row.iloc[y1_cols["future_function"]])
        current_func = FUNCTION_MAP.get(current_func_jp)
        future_func = FUNCTION_MAP.get(future_func_jp)

        # 病床数（一般 + 療養の許可病床数合計）
        general_beds = safe_int(row.iloc[y1_cols["general_beds_permitted"]])
        therapy_beds = safe_int(row.iloc[y1_cols["therapy_beds_permitted"]])
        ward_beds = general_beds + therapy_beds

        h["totalBeds"] += ward_beds
        if current_func:
            h["bedsByFunction"][current_func] += ward_beds
        if future_func:
            h["futureBedsByFunction"][future_func] += ward_beds

        # 職員数
        h["nurses"] += safe_int(row.iloc[y1_cols["nurses"]])

        # 入院患者数
        h["newAdmissions"] += safe_int(row.iloc[y1_cols["new_admissions_annual"]])
        h["plannedAdmissions"] += safe_int(row.iloc[y1_cols["planned_admissions_annual"]])

        # 様式2からの診療実績（ward_keyで正規化してマッチング）
        raw_ward_code = safe_str(row.iloc[y1_cols["ward_code"]])
        wk = ward_key(raw_ward_code) if raw_ward_code else ""
        if wk and wk in perf_by_ward:
            perf = perf_by_ward[wk]
            h["surgeries"] += perf["surgeries"]
            h["surgeriesGA"] += perf["surgeriesGA"]
            h["heartLungSurgery"] += perf["heartLungSurgery"]
            h["cancerSurgery"] += perf["cancerSurgery"]
            h["radiotherapy"] += perf["radiotherapy"]
            h["chemotherapy"] += perf["chemotherapy"]
            h["tpa"] += perf["tpa"]
            h["dialysis"] += perf["dialysis"]
            h["rehab"] += perf["rehab"]

        # 算定入院料
        admission_fee = safe_str(row.iloc[y1_cols["admission_fee"]])

        # 回復期関連病床数の計算
        # 回復期として報告された病床 + 地域包括ケア病棟の病床を合算
        # 地域包括医療病棟は急性期側として扱うため含めない
        is_recovery_related = (
            current_func == "recovery"
            or "地域包括ケア病棟" in admission_fee
            or "地域包括ケア入院医療管理料" in admission_fee
        )
        if is_recovery_related:
            h["recoveryRelatedBeds"] += ward_beds

        # 病棟情報
        h["wards"].append({
            "wardName": safe_str(row.iloc[y1_cols["ward_name"]]),
            "functionType": current_func or "unknown",
            "futureFunctionType": future_func or "unknown",
            "beds": ward_beds,
            "admissionFee": admission_fee,
        })

    # 救急車搬送件数を施設票から追加
    for code, h in hospitals.items():
        h["emergencyTransports"] = emergency_by_hospital.get(code, 0)

    return dict(hospitals)


def normalize_hospital_name(name: str) -> str:
    """病院名を正規化してマッチング精度を向上"""
    name = unicodedata.normalize("NFKC", name)
    name = re.sub(r"\s+", "", name)
    prefixes = [
        "独立行政法人", "国立研究開発法人", "地方独立行政法人",
        "社会医療法人", "医療法人社団", "医療法人財団", "医療法人",
        "一般社団法人", "一般財団法人", "公益社団法人", "公益財団法人",
        "社会福祉法人", "学校法人", "宗教法人", "特定医療法人",
        "公立大学法人", "国立大学法人", "日本赤十字社", "株式会社", "有限会社",
    ]
    for p in prefixes:
        if name.startswith(p):
            name = name[len(p):]
            break
    return name


def load_iryo_info() -> dict:
    """医療情報ネットCSVを読み込み、(都道府県, 正規化病院名) → データのマップを返す"""
    iryo_dir = os.path.join(RAW_DIR, "iryo_info")
    csv_files = glob.glob(os.path.join(iryo_dir, "**", "*.csv"), recursive=True)
    if not csv_files:
        print("  No 医療情報ネット CSV found. Skipping psychiatric bed data.")
        return {}, {}, []

    # 最新のCSVを使用
    csv_path = sorted(csv_files)[-1]
    print(f"  Loading 医療情報ネット: {os.path.basename(csv_path)}")

    exact_map = {}  # (pref, name) -> data
    norm_map = {}   # (pref, normalized_name) -> data
    psych_only = [] # 精神科単科病院（一般+療養=0）

    with open(csv_path, encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        next(reader)  # skip header
        for row in reader:
            if len(row) < 65:
                continue
            name = row[1].strip()
            pref = row[7].strip().zfill(2)
            general = int(row[57]) if row[57] else 0
            therapy = int(row[58]) if row[58] else 0
            psychiatric = int(row[61]) if row[61] else 0
            tuberculosis = int(row[62]) if row[62] else 0
            infectious = int(row[63]) if row[63] else 0
            total = int(row[64]) if row[64] else 0

            data = {
                "name": name,
                "pref": pref,
                "generalBeds": general,
                "therapyBeds": therapy,
                "psychiatricBeds": psychiatric,
                "tuberculosisBeds": tuberculosis,
                "infectiousBeds": infectious,
                "totalAllBeds": total,
            }

            exact_map[(pref, name)] = data
            norm_map[(pref, normalize_hospital_name(name))] = data

            # 精神科単科（一般+療養=0で精神>0）
            if general + therapy == 0 and psychiatric > 0:
                psych_only.append(data)

    print(f"  医療情報ネット: {len(exact_map)} hospitals, {len(psych_only)} psychiatric-only")
    return exact_map, norm_map, psych_only


def match_iryo_info(name: str, pref: str, exact_map: dict, norm_map: dict):
    """病院名+都道府県でマッチング"""
    pref = pref.zfill(2)
    if (pref, name) in exact_map:
        return exact_map[(pref, name)]
    norm = normalize_hospital_name(name)
    if (pref, norm) in norm_map:
        return norm_map[(pref, norm)]
    return None


def generate_outputs(all_years_data: dict):
    """全年度のデータからJSON出力を生成"""
    os.makedirs(os.path.join(OUTPUT_DIR, "summary"), exist_ok=True)
    os.makedirs(os.path.join(OUTPUT_DIR, "areas"), exist_ok=True)
    os.makedirs(os.path.join(OUTPUT_DIR, "hospitals"), exist_ok=True)
    os.makedirs(os.path.join(OUTPUT_DIR, "ranking"), exist_ok=True)

    # --- 全国集計 ---
    national_summary = []
    prefecture_summary = defaultdict(list)
    area_index = {}  # 構想区域マスタ
    hospital_index = []  # 病院マスタ（検索用）
    area_data = defaultdict(lambda: defaultdict(list))  # area_code -> year -> hospitals

    for year_key, hospitals in sorted(all_years_data.items()):
        fiscal_year = YEAR_MAP[year_key]

        # 全国集計
        total_beds = 0
        beds_by_func = {"high_acute": 0, "acute": 0, "recovery": 0, "chronic": 0}
        total_hospitals = 0

        for code, h in hospitals.items():
            if h["totalBeds"] <= 0:
                continue
            total_hospitals += 1
            total_beds += h["totalBeds"]
            for func, count in h["bedsByFunction"].items():
                beds_by_func[func] += count

            # 構想区域マスタ
            if h["areaCode"] and h["areaCode"] not in area_index:
                area_index[h["areaCode"]] = {
                    "code": h["areaCode"],
                    "name": h["areaName"],
                    "prefecture": h["prefCode"],
                }

            # 構想区域別データ
            area_data[h["areaCode"]][fiscal_year].append({
                "code": code,
                "name": h["name"],
                "totalBeds": h["totalBeds"],
                "bedsByFunction": h["bedsByFunction"],
                "emergencyTransports": h["emergencyTransports"],
                "surgeriesGA": h["surgeriesGA"],
                "chemotherapy": h["chemotherapy"],
                "radiotherapy": h["radiotherapy"],
                "tpa": h["tpa"],
            })

            # 都道府県別集計
            # (後で集約)

        national_summary.append({
            "year": fiscal_year,
            "totalBeds": total_beds,
            "bedsByFunction": beds_by_func,
            "totalHospitals": total_hospitals,
        })

        # --- ランキングデータ ---
        ranking_data = {
            "year": fiscal_year,
            "surgeriesGA": [],
            "emergencyTransports": [],
            "chemotherapy": [],
            "radiotherapy": [],
            "tpa": [],
        }

        hospital_list = [
            (code, h) for code, h in hospitals.items() if h["totalBeds"] > 0
        ]

        for metric in ["surgeriesGA", "emergencyTransports", "chemotherapy", "radiotherapy", "tpa"]:
            sorted_hospitals = sorted(
                hospital_list, key=lambda x: x[1].get(metric, 0), reverse=True
            )[:100]  # Top 100
            ranking_data[metric] = [
                {
                    "rank": i + 1,
                    "hospitalCode": code,
                    "hospitalName": h["name"],
                    "areaCode": h["areaCode"],
                    "areaName": h["areaName"],
                    "prefecture": h["prefCode"],
                    "value": h.get(metric, 0),
                }
                for i, (code, h) in enumerate(sorted_hospitals)
                if h.get(metric, 0) > 0
            ]

        write_json(os.path.join(OUTPUT_DIR, "ranking", f"{fiscal_year}.json"), ranking_data)

    # 全国集計出力
    write_json(os.path.join(OUTPUT_DIR, "summary", "national.json"), national_summary)

    # 構想区域マスタ出力
    write_json(
        os.path.join(OUTPUT_DIR, "areas", "index.json"),
        sorted(area_index.values(), key=lambda x: x["code"]),
    )

    # 構想区域別データ出力
    for area_code, yearly_data in area_data.items():
        if not area_code:
            continue
        area_info = area_index.get(area_code, {})
        output = {
            "code": area_code,
            "name": area_info.get("name", ""),
            "prefecture": area_info.get("prefecture", ""),
            "yearlyData": {},
        }
        for fiscal_year, hosp_list in yearly_data.items():
            total_beds = sum(h["totalBeds"] for h in hosp_list)
            beds_by_func = {"high_acute": 0, "acute": 0, "recovery": 0, "chronic": 0}
            for h in hosp_list:
                for func, count in h["bedsByFunction"].items():
                    beds_by_func[func] += count

            output["yearlyData"][fiscal_year] = {
                "totalBeds": total_beds,
                "bedsByFunction": beds_by_func,
                "hospitals": hosp_list,
            }

        write_json(os.path.join(OUTPUT_DIR, "areas", f"{area_code}.json"), output)

    # 医療情報ネットデータの読み込み
    print("\n=== Loading 医療情報ネット data ===")
    iryo_exact, iryo_norm, psych_only_hospitals = load_iryo_info()

    # 病院個別データ出力 + 病院マスタ
    hospital_index_map = {}  # code -> index entry（最新年度で上書き）
    for year_key, hospitals in sorted(all_years_data.items()):
        fiscal_year = YEAR_MAP[year_key]
        for code, h in hospitals.items():
            if h["totalBeds"] <= 0:
                continue

            # 医療情報ネットから精神病床等を取得
            iryo_match = match_iryo_info(h["name"], h["prefCode"], iryo_exact, iryo_norm)
            psychiatric_beds = iryo_match["psychiatricBeds"] if iryo_match else 0

            # 病院マスタに追加（最新年度の情報で上書き）
            hospital_index_map[code] = {
                "code": code,
                "name": h["name"],
                "areaCode": h["areaCode"],
                "areaName": h["areaName"],
                "prefecture": h["prefCode"],
                "totalBeds": h["totalBeds"],
                "bedsByFunction": dict(h["bedsByFunction"]),
                "recoveryRelatedBeds": h["recoveryRelatedBeds"],
                "psychiatricBeds": psychiatric_beds,
            }

            # 病院個別JSON（年度ごとにマージ）
            hosp_file = os.path.join(OUTPUT_DIR, "hospitals", f"{code}.json")
            if os.path.exists(hosp_file):
                with open(hosp_file, "r") as f:
                    hosp_data = json.load(f)
            else:
                hosp_data = {
                    "code": code,
                    "name": h["name"],
                    "areaCode": h["areaCode"],
                    "areaName": h["areaName"],
                    "prefecture": h["prefCode"],
                    "yearlyData": {},
                }

            hosp_data["name"] = h["name"]  # 最新名称で更新
            hosp_data["yearlyData"][fiscal_year] = {
                "totalBeds": h["totalBeds"],
                "bedsByFunction": h["bedsByFunction"],
                "futureBedsByFunction": h["futureBedsByFunction"],
                "nurses": h["nurses"],
                "newAdmissions": h["newAdmissions"],
                "plannedAdmissions": h["plannedAdmissions"],
                "surgeries": h["surgeries"],
                "surgeriesGA": h["surgeriesGA"],
                "heartLungSurgery": h["heartLungSurgery"],
                "cancerSurgery": h["cancerSurgery"],
                "radiotherapy": h["radiotherapy"],
                "chemotherapy": h["chemotherapy"],
                "tpa": h["tpa"],
                "dialysis": h["dialysis"],
                "rehab": h["rehab"],
                "emergencyTransports": h["emergencyTransports"],
                "wards": h["wards"],
            }

            write_json(hosp_file, hosp_data)

    # 精神科単科病院を追加（病床機能報告に含まれないもの）
    existing_names = {(v["prefecture"].zfill(2), v["name"]) for v in hospital_index_map.values()}
    psych_added = 0
    for ph in psych_only_hospitals:
        if (ph["pref"], ph["name"]) not in existing_names:
            pseudo_code = f"P{ph['pref']}{psych_added:04d}"
            hospital_index_map[pseudo_code] = {
                "code": pseudo_code,
                "name": ph["name"],
                "areaCode": "",
                "areaName": "",
                "prefecture": ph["pref"],
                "totalBeds": ph["psychiatricBeds"],
                "bedsByFunction": {"high_acute": 0, "acute": 0, "recovery": 0, "chronic": 0},
                "recoveryRelatedBeds": 0,
                "psychiatricBeds": ph["psychiatricBeds"],
            }
            # 個別JSONも生成
            hosp_file = os.path.join(OUTPUT_DIR, "hospitals", f"{pseudo_code}.json")
            write_json(hosp_file, {
                "code": pseudo_code,
                "name": ph["name"],
                "areaCode": "",
                "areaName": "",
                "prefecture": ph["pref"],
                "yearlyData": {
                    "2024": {
                        "totalBeds": ph["psychiatricBeds"],
                        "bedsByFunction": {"high_acute": 0, "acute": 0, "recovery": 0, "chronic": 0},
                        "futureBedsByFunction": {"high_acute": 0, "acute": 0, "recovery": 0, "chronic": 0},
                        "psychiatricBeds": ph["psychiatricBeds"],
                        "nurses": 0,
                        "newAdmissions": 0,
                        "plannedAdmissions": 0,
                        "surgeries": 0,
                        "surgeriesGA": 0,
                        "heartLungSurgery": 0,
                        "cancerSurgery": 0,
                        "radiotherapy": 0,
                        "chemotherapy": 0,
                        "tpa": 0,
                        "dialysis": 0,
                        "rehab": 0,
                        "emergencyTransports": 0,
                        "wards": [],
                    },
                },
            })
            existing_names.add((ph["pref"], ph["name"]))
            psych_added += 1
    print(f"  Added {psych_added} psychiatric-only hospitals")

    # 病院マスタ出力（名前順ソート）
    hospital_index = sorted(hospital_index_map.values(), key=lambda x: x["name"])
    write_json(os.path.join(OUTPUT_DIR, "hospitals", "index.json"), hospital_index)

    # 都道府県別集計
    pref_summary = defaultdict(lambda: defaultdict(lambda: {
        "totalBeds": 0,
        "bedsByFunction": {"high_acute": 0, "acute": 0, "recovery": 0, "chronic": 0},
        "totalHospitals": 0,
    }))

    for year_key, hospitals in sorted(all_years_data.items()):
        fiscal_year = YEAR_MAP[year_key]
        for code, h in hospitals.items():
            if h["totalBeds"] <= 0 or not h["prefCode"]:
                continue
            p = pref_summary[h["prefCode"]][fiscal_year]
            p["totalBeds"] += h["totalBeds"]
            p["totalHospitals"] += 1
            for func, count in h["bedsByFunction"].items():
                p["bedsByFunction"][func] += count

    pref_output = {}
    for pref_code, yearly in pref_summary.items():
        pref_output[pref_code] = [
            {"year": y, **data} for y, data in sorted(yearly.items())
        ]
    write_json(os.path.join(OUTPUT_DIR, "summary", "prefectures.json"), pref_output)

    print(f"\nOutput complete! Files written to {OUTPUT_DIR}")


def write_json(path: str, data):
    """JSON出力（日本語対応）"""
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))


def main():
    target_years = None
    if "--year" in sys.argv:
        idx = sys.argv.index("--year")
        if idx + 1 < len(sys.argv):
            target_years = [sys.argv[idx + 1]]

    if target_years is None:
        target_years = [y for y in YEAR_MAP.keys() if os.path.exists(os.path.join(RAW_DIR, y))]

    if not target_years:
        print("No data found. Run download.py first.")
        return

    print(f"Processing years: {', '.join(target_years)}")
    all_years_data = {}
    for year in target_years:
        result = process_year(year)
        if result:
            all_years_data[year] = result

    if all_years_data:
        generate_outputs(all_years_data)
    else:
        print("No data processed.")


if __name__ == "__main__":
    main()
