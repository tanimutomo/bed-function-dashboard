"""
医療リソース（医師・歯科医師・薬剤師 + 医療施設）前処理スクリプト

2つの国統計を都道府県別に集計し、JMAP形式の人口10万対指標付きで出力する。

入力:
  data/raw/iryo_stats_2022/R04_DL-toukeihyo.xlsx
    統計表9-1: 都道府県別 医師/歯科医師/薬剤師数 (従業地ベース、令和4年)
    統計表10-1: 人口10万対 医師/歯科医師/薬剤師数
  data/raw/iryo_sisetsu_2023/07sisetutoukei05.xlsx
    統計表10-1: 都道府県別 病院数・一般診療所数・歯科診療所数 (令和5年)

出力:
  public/data/summary/medical_resources.json
"""

import json
import os

import pandas as pd

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PHYS_FILE = os.path.join(PROJECT_ROOT, "data", "raw", "iryo_stats_2022", "R04_DL-toukeihyo.xlsx")
FAC_FILE = os.path.join(PROJECT_ROOT, "data", "raw", "iryo_sisetsu_2023", "07sisetutoukei05.xlsx")
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "public", "data", "summary")

# 都道府県名 (統計表内での表記)→JIS2桁コード
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


def safe_int(v):
    if pd.isna(v):
        return 0
    try:
        return int(float(str(v).strip().replace(",", "")))
    except (ValueError, TypeError):
        return 0


def safe_float(v):
    if pd.isna(v):
        return 0.0
    try:
        return float(str(v).strip().replace(",", ""))
    except (ValueError, TypeError):
        return 0.0


def read_physicians(path):
    """
    医師・歯科医師・薬剤師統計 令和4年
      統計表9-1: 絶対数
      統計表10-1: 人口10万対
    """
    df_abs = pd.read_excel(path, sheet_name="統計表９-1", header=None)
    df_rate = pd.read_excel(path, sheet_name="統計表10-1", header=None)

    # row6 全国, row7+ 都道府県
    # col3: 都道府県名, col5: 医師総数, col6: 医師医療施設従事, col9: 歯科医師総数,
    # col10: 歯科医師医療施設従事, col13: 薬剤師総数, col14: 薬剤師薬局・医療施設従事
    out = {}
    for ri in range(6, len(df_abs)):
        name = df_abs.iloc[ri, 3]
        if pd.isna(name):
            continue
        name_str = str(name).strip()
        if name_str == "全国":
            code = "national"
        elif name_str in PREF_NAME_TO_CODE:
            code = PREF_NAME_TO_CODE[name_str]
        else:
            continue

        # 対応する rate 行も同じ index のはず
        rate_row = df_rate.iloc[ri] if ri < len(df_rate) else None

        out[code] = {
            "physiciansTotal":     safe_int(df_abs.iloc[ri, 5]),
            "physiciansInFacility":safe_int(df_abs.iloc[ri, 6]),
            "dentistsTotal":       safe_int(df_abs.iloc[ri, 9]),
            "dentistsInFacility":  safe_int(df_abs.iloc[ri, 10]),
            "pharmacistsTotal":    safe_int(df_abs.iloc[ri, 13]),
            "pharmacistsInFacility": safe_int(df_abs.iloc[ri, 14]),
            # per 100k
            "physiciansPer100k":     safe_float(rate_row[5]) if rate_row is not None else 0,
            "physiciansInFacilityPer100k": safe_float(rate_row[6]) if rate_row is not None else 0,
            "dentistsPer100k":       safe_float(rate_row[9]) if rate_row is not None else 0,
            "dentistsInFacilityPer100k": safe_float(rate_row[10]) if rate_row is not None else 0,
            "pharmacistsPer100k":    safe_float(rate_row[13]) if rate_row is not None else 0,
            "pharmacistsInFacilityPer100k": safe_float(rate_row[14]) if rate_row is not None else 0,
        }
    return out


def read_facilities(path):
    """
    医療施設調査 令和5年 統計表10-1
      col 2: 都道府県名 (row7=全国, row8+=都道府県)
      col 4: 病院総数, col 5: 精神科病院, col 6: 一般病院
      col 7: 一般診療所, col 8: 有床(再掲), col 9: 歯科診療所
      col 10-15: 人口10万対各値
    """
    df = pd.read_excel(path, sheet_name="統計表10-1", header=None)
    out = {}
    for ri in range(7, len(df)):
        name = df.iloc[ri, 2]
        if pd.isna(name):
            continue
        name_str = str(name).strip()
        if name_str == "全国":
            code = "national"
        elif name_str in PREF_NAME_TO_CODE:
            code = PREF_NAME_TO_CODE[name_str]
        else:
            continue

        out[code] = {
            "hospital":            safe_int(df.iloc[ri, 4]),
            "psychiatricHospital": safe_int(df.iloc[ri, 5]),
            "generalHospital":     safe_int(df.iloc[ri, 6]),
            "clinic":              safe_int(df.iloc[ri, 7]),
            "clinicWithBeds":      safe_int(df.iloc[ri, 8]),
            "dentalClinic":        safe_int(df.iloc[ri, 9]),
            # per 100k
            "hospitalPer100k":            safe_float(df.iloc[ri, 10]),
            "psychiatricHospitalPer100k": safe_float(df.iloc[ri, 11]),
            "generalHospitalPer100k":     safe_float(df.iloc[ri, 12]),
            "clinicPer100k":              safe_float(df.iloc[ri, 13]),
            "clinicWithBedsPer100k":      safe_float(df.iloc[ri, 14]),
            "dentalClinicPer100k":        safe_float(df.iloc[ri, 15]),
        }
    return out


def main():
    if not os.path.exists(PHYS_FILE):
        print(f"[ERROR] missing: {PHYS_FILE}")
        return
    if not os.path.exists(FAC_FILE):
        print(f"[ERROR] missing: {FAC_FILE}")
        return

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print("Reading 医師・歯科医師・薬剤師統計 令和4年 ...")
    phys = read_physicians(PHYS_FILE)
    print(f"  entries: {len(phys)}")

    print("Reading 医療施設調査 令和5年 ...")
    fac = read_facilities(FAC_FILE)
    print(f"  entries: {len(fac)}")

    # 結合
    def merge(code):
        entry = {
            "personnel":        {k: v for k, v in (phys.get(code, {}) or {}).items() if not k.endswith("Per100k")},
            "personnelPer100k": {k: v for k, v in (phys.get(code, {}) or {}).items() if k.endswith("Per100k")},
            "facilities":       {k: v for k, v in (fac.get(code, {}) or {}).items() if not k.endswith("Per100k")},
            "facilitiesPer100k":{k: v for k, v in (fac.get(code, {}) or {}).items() if k.endswith("Per100k")},
        }
        return entry

    national = merge("national")
    prefs = {}
    for code in PREF_NAME_TO_CODE.values():
        m = merge(code)
        if m["personnel"] or m["facilities"]:
            prefs[code] = m

    output = {
        "sources": {
            "personnel": {
                "name": "厚生労働省「令和4年(2022) 医師・歯科医師・薬剤師統計」",
                "url": "https://www.mhlw.go.jp/toukei/saikin/hw/ishi/22/index.html",
                "year": "2022",
            },
            "facilities": {
                "name": "厚生労働省「令和5年(2023) 医療施設（静態・動態）調査」",
                "url": "https://www.mhlw.go.jp/toukei/saikin/hw/iryosd/23/",
                "year": "2023",
            },
        },
        "national": national,
        "prefectures": prefs,
    }

    output_path = os.path.join(OUTPUT_DIR, "medical_resources.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, separators=(",", ":"))
    print(f"\nWritten: {output_path}")
    print(f"  National 医師 total: {national['personnel']['physiciansTotal']:,} "
          f"(人口10万対 {national['personnelPer100k']['physiciansPer100k']})")
    print(f"  National 病院数: {national['facilities']['hospital']:,} "
          f"(人口10万対 {national['facilitiesPer100k']['hospitalPer100k']})")
    print(f"  Prefectures: {len(prefs)}")


if __name__ == "__main__":
    main()
