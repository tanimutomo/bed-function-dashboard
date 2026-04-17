"""
令和5年患者調査 受療率データ前処理スクリプト

厚生労働省「令和5年（2023）患者調査」から年齢階級別および疾病大分類別の
受療率（人口10万対）を抽出し、将来患者数推計に使える形式でJSONに出力する。

データソース:
  https://www.mhlw.go.jp/toukei/saikin/hw/kanja/23/index.html

入力ファイル (data/raw/patient_survey_2023/):
  toukei.xlsx  統計表1〜8本体（受療率テーブル含む）
  sankou.xlsx  受療率計算用人口統計（年齢階級別）

出力:
  public/data/summary/utilization_rates.json
"""

import json
import os

import pandas as pd

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(PROJECT_ROOT, "data", "raw", "patient_survey_2023")
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "public", "data", "summary")


def read_population(path):
    """sankou.xlsx から年齢階級別人口を抽出（単位: 千人）"""
    df = pd.read_excel(path, sheet_name=0, header=None)
    pops = {}
    for i in range(6, len(df)):
        total = df.iloc[i, 7]
        if pd.isna(total):
            continue
        age_parts = [df.iloc[i, c] for c in [2, 3, 4, 5] if not pd.isna(df.iloc[i, c])]
        age = "".join(str(a) for a in age_parts).strip()
        if not age:
            continue
        pops[age] = int(total)
    return pops


def read_age_rates(path):
    """
    統計表4 から 令和5年 年齢階級別 入院・外来 受療率を抽出。
    戻り値: {"total": {...}, "inpatient": {...}, "outpatient": {...}}
      各 dict は {"under15": ..., "15_34": ..., "35_64": ..., "over65": ..., "over75": ...}
    """
    df = pd.read_excel(path, sheet_name="統計表４", header=None)

    # 令和5年の行: row 18=総数, row 32=入院, row 46=外来
    # 再掲列: col 25=0-14歳, col 26=15-34歳, col 27=35-64歳, col 28=65歳以上, col 30=75歳以上
    COL_MAP = {
        "under15": 25,
        "15_34": 26,
        "35_64": 27,
        "over65": 28,
        "over75": 30,
    }

    def extract(row_idx):
        out = {}
        for k, c in COL_MAP.items():
            v = df.iloc[row_idx, c]
            try:
                out[k] = int(v)
            except (ValueError, TypeError):
                out[k] = 0  # '…' などの非数値は0扱い
        return out

    # 総数行（row18）は 0-14/15-34/35-64 が '…' なのでスキップ
    # 入院（row32）・外来（row46）のみ抽出
    return {
        "inpatient":  extract(32),
        "outpatient": extract(46),
    }


def read_disease_patient_counts(path):
    """
    統計表3 から 疾病大分類別 × 年齢階級別 推計患者数を抽出（単位: 千人）。
    主要カテゴリを個別抽出する。
    """
    df = pd.read_excel(path, sheet_name="統計表３", header=None)

    # 列レイアウト (row4 ヘッダ):
    #   総数ブロック    : col 4=総数, 5=0-14, 6=15-34, 7=35-64, 8=65+, 9=70+, 10=75+
    #   入院ブロック    : col 11=総数, 12=0-14, 13=15-34, 14=35-64, 15=65+, 16=70+, 17=75+
    #   外来ブロック    : col 18=総数, 19=0-14, 20=15-34, 21=35-64, 22=65+, 23=70+, 24=75+
    AGE_COL_OFFSETS = {"under15": 1, "15_34": 2, "35_64": 3, "over65": 4, "over75": 6}

    def extract_at(row_idx, block_start):
        out = {}
        for k, offset in AGE_COL_OFFSETS.items():
            val = df.iloc[row_idx, block_start + offset]
            out[k] = float(val) if not pd.isna(val) else 0.0
        return out

    diseases = {}
    categories = {
        "psychiatric":     ("Ⅴ",  "精神及び行動の障害"),
        "circulatory":     ("Ⅸ",  "循環器系の疾患"),
        "neoplasms":       ("Ⅱ",  "新生物＜腫瘍＞"),
        "respiratory":     ("Ⅹ",  "呼吸器系の疾患"),
        "musculoskeletal": ("ⅩⅢ", "筋骨格系及び結合組織の疾患"),
    }

    for key, (roman, name) in categories.items():
        for i in range(5, len(df)):
            v1 = df.iloc[i, 1]
            v2 = df.iloc[i, 2]
            if not pd.isna(v1) and str(v1).strip() == roman and not pd.isna(v2) and name in str(v2):
                diseases[key] = {
                    "label":      name,
                    "total":      extract_at(i, 4),
                    "inpatient":  extract_at(i, 11),
                    "outpatient": extract_at(i, 18),
                }
                break

    return diseases


def aggregate_population_by_bracket(pops):
    """
    age group 文字列 → 集計人口（千人）
    IPSSの4区分 + 細かい区分を返す
    """
    def sum_ranges(ranges):
        return sum(pops.get(r, 0) for r in ranges)

    return {
        "under15": sum_ranges(["０歳", "１～４歳", "５～９歳", "10～14歳"]),
        "15_34":   sum_ranges(["15～19歳", "20～24歳", "25～29歳", "30～34歳"]),
        "35_64":   sum_ranges(["35～39歳", "40～44歳", "45～49歳", "50～54歳", "55～59歳", "60～64歳"]),
        "over65":  pops.get("65歳以上", 0),
        "over75":  pops.get("75歳以上", 0),
    }


def compute_disease_rates_per_age(counts, pop_brackets):
    """
    疾病別患者数(千人) × 人口(千人) → 受療率(人口10万対)
    rate = count / pop × 100000 （どちらも千人単位なので係数は相殺）
    """
    def rate(key):
        pop = pop_brackets.get(key, 0)
        if pop <= 0:
            return 0
        return round(counts.get(key, 0) / pop * 100000, 1)

    return {
        "under15": rate("under15"),
        "15_34":   rate("15_34"),
        "35_64":   rate("35_64"),
        "over65":  rate("over65"),
        "over75":  rate("over75"),
    }


def normalize_to_ipss_brackets(rates_by_detailed, pop_brackets):
    """
    詳細ブラケット(under15, 15_34, 35_64, over65, over75)の受療率を
    IPSSの4ブラケット互換に変換:
      under15, age15_64 (15_34と35_64の人口加重平均), age65_74 (派生), over65, over75
    """
    pop_15_34 = pop_brackets["15_34"]
    pop_35_64 = pop_brackets["35_64"]
    pop_15_64 = pop_15_34 + pop_35_64
    pop_over65 = pop_brackets["over65"]
    pop_over75 = pop_brackets["over75"]
    pop_65_74 = pop_over65 - pop_over75

    if pop_15_64 > 0:
        age15_64 = (
            rates_by_detailed["15_34"] * pop_15_34 +
            rates_by_detailed["35_64"] * pop_35_64
        ) / pop_15_64
    else:
        age15_64 = 0

    if pop_65_74 > 0:
        patients_over65 = rates_by_detailed["over65"] * pop_over65 / 100000
        patients_over75 = rates_by_detailed["over75"] * pop_over75 / 100000
        patients_65_74 = patients_over65 - patients_over75
        age65_74 = patients_65_74 / pop_65_74 * 100000
    else:
        age65_74 = rates_by_detailed["over65"]

    return {
        "under15":  rates_by_detailed["under15"],
        "age15_64": round(age15_64, 1),
        "age65_74": round(age65_74, 1),
        "over65":   rates_by_detailed["over65"],
        "over75":   rates_by_detailed["over75"],
    }


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    toukei_path = os.path.join(RAW_DIR, "toukei.xlsx")
    sankou_path = os.path.join(RAW_DIR, "sankou.xlsx")

    if not os.path.exists(toukei_path) or not os.path.exists(sankou_path):
        print("[ERROR] 入力ファイルが見つかりません:")
        print(f"  {toukei_path}")
        print(f"  {sankou_path}")
        return

    print("Reading population reference ...")
    pops = read_population(sankou_path)
    pop_brackets = aggregate_population_by_bracket(pops)
    print(f"  under15={pop_brackets['under15']}千, 15_34={pop_brackets['15_34']}千, "
          f"35_64={pop_brackets['35_64']}千, over65={pop_brackets['over65']}千, "
          f"over75={pop_brackets['over75']}千")

    print("Reading age-specific rates (統計表4) ...")
    age_rates = read_age_rates(toukei_path)
    print(f"  入院受療率: {age_rates['inpatient']}")
    print(f"  外来受療率: {age_rates['outpatient']}")

    overall_inp = normalize_to_ipss_brackets(age_rates["inpatient"], pop_brackets)
    overall_out = normalize_to_ipss_brackets(age_rates["outpatient"], pop_brackets)

    print("Reading disease-specific counts (統計表3) ...")
    disease_counts = read_disease_patient_counts(toukei_path)

    diseases = {}
    for key, data in disease_counts.items():
        inp_rates = compute_disease_rates_per_age(data["inpatient"], pop_brackets)
        out_rates = compute_disease_rates_per_age(data["outpatient"], pop_brackets)
        diseases[key] = {
            "label":      data["label"],
            "inpatient":  normalize_to_ipss_brackets(inp_rates, pop_brackets),
            "outpatient": normalize_to_ipss_brackets(out_rates, pop_brackets),
        }
        inp = diseases[key]["inpatient"]
        print(f"  {data['label']}: 入院 65+={inp['over65']}, 75+={inp['over75']}")

    output = {
        "source": "厚生労働省「令和5年（2023）患者調査」",
        "sourceUrl": "https://www.mhlw.go.jp/toukei/saikin/hw/kanja/23/index.html",
        "surveyYear": "2023",
        "note": (
            "受療率は人口10万対。年齢区分はIPSS推計人口と整合するように "
            "under15/age15_64/over65/over75 を採用。age15_64 は令和5年時点の "
            "15-34歳と35-64歳の人口加重平均。age65_74 は over65 から over75 を "
            "差し引いた派生値。"
        ),
        "populationReference": pop_brackets,
        "overall": {
            "inpatient":  overall_inp,
            "outpatient": overall_out,
        },
        "diseases": diseases,
    }

    output_path = os.path.join(OUTPUT_DIR, "utilization_rates.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, separators=(",", ":"))

    print(f"\nWritten: {output_path}")
    print(f"Overall inpatient: {overall_inp}")
    print(f"Overall outpatient: {overall_out}")


if __name__ == "__main__":
    main()
