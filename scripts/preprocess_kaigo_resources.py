"""
介護リソース（介護保険施設）前処理スクリプト

厚生労働省「令和5年 介護サービス施設・事業所調査」の閲覧表から
都道府県別の介護保険3施設（特養・老健・介護医療院）の施設数・定員・従事者数を
集計する。

入力 (data/raw/kaigo_2023/, CSVはShift-JIS):
  tokuyo_facilities.csv  介護老人福祉施設(特養) 第1表 都道府県別施設数
  tokuyo_capacity.csv    介護老人福祉施設 第10表 都道府県別定員
  tokuyo_staff.csv       介護老人福祉施設 第16表 都道府県別従事者数
  roken_facilities.csv   介護老人保健施設 第35表 都道府県別施設数 (開設年月別)
  roken_staff.csv        介護老人保健施設 第32表 都道府県別従事者数
  iryo_facilities.csv    介護医療院 第45表 都道府県別施設数 (開設年月別)

出力:
  public/data/summary/kaigo_resources.json

各CSVは Shift-JIS で、行5以降にデータ。
col 0 = 地域名 (全国/47都道府県)、col 1 = 総数。
"""

import csv
import json
import os

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(PROJECT_ROOT, "data", "raw", "kaigo_2023")
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "public", "data", "summary")

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


def normalize_name(s):
    """「北　海　道」→「北海道」のように全角空白を除去"""
    if s is None:
        return ""
    return s.replace("\u3000", "").strip()


def safe_int(v):
    if v is None:
        return 0
    s = str(v).strip().replace(",", "")
    if s in ("", "-", "…", "X"):
        return 0
    try:
        return int(float(s))
    except (ValueError, TypeError):
        return 0


def read_csv_total_col(path, total_col_idx=1, header_rows=6):
    """
    CSV (Shift-JIS) から地域名 → 総数値 のマップを返す。
    """
    result = {}
    with open(path, encoding="shift-jis", errors="ignore") as f:
        reader = csv.reader(f)
        rows = list(reader)

    for i in range(header_rows, len(rows)):
        row = rows[i]
        if len(row) < total_col_idx + 1:
            continue
        name = normalize_name(row[0])
        if not name:
            continue
        val = safe_int(row[total_col_idx])
        if name == "全国":
            result["national"] = val
        elif name in PREF_NAME_TO_CODE:
            result[PREF_NAME_TO_CODE[name]] = val
    return result


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    sources = {
        "tokuyo_facilities": ("tokuyo_facilities.csv", 1),
        "tokuyo_capacity":   ("tokuyo_capacity.csv", 1),
        "tokuyo_staff":      ("tokuyo_staff.csv", 1),
        "roken_facilities":  ("roken_facilities.csv", 1),
        "roken_staff":       ("roken_staff.csv", 1),
        "iryo_facilities":   ("iryo_facilities.csv", 1),
    }

    # 一部のCSVはheaderがずれている可能性: headerrows 試行
    loaded = {}
    for key, (filename, col) in sources.items():
        path = os.path.join(RAW_DIR, filename)
        if not os.path.exists(path):
            print(f"[WARN] missing: {path}")
            continue
        # 複数 header 行数で試行 (5/6/7) し、全国が見つかる値を採用
        for hr in [6, 5, 7, 4]:
            data = read_csv_total_col(path, total_col_idx=col, header_rows=hr)
            if "national" in data:
                loaded[key] = data
                print(f"  {filename} (header_rows={hr}): {len(data)} entries, "
                      f"national={data['national']}")
                break
        else:
            loaded[key] = data
            print(f"  {filename}: no national found, {len(data)} entries")

    def gather(code):
        return {
            "facilities": {
                "specialCare": loaded.get("tokuyo_facilities", {}).get(code, 0),
                "healthCare":  loaded.get("roken_facilities", {}).get(code, 0),
                "medicalCare": loaded.get("iryo_facilities", {}).get(code, 0),
            },
            "specialCareCapacity": loaded.get("tokuyo_capacity", {}).get(code, 0),
            "staff": {
                "specialCare": loaded.get("tokuyo_staff", {}).get(code, 0),
                "healthCare":  loaded.get("roken_staff", {}).get(code, 0),
            },
        }

    national = gather("national")
    # 総施設数 (3タイプ合計)
    national["facilities"]["total"] = sum(national["facilities"].values())

    prefs = {}
    for code in PREF_NAME_TO_CODE.values():
        e = gather(code)
        e["facilities"]["total"] = sum(e["facilities"].values())
        if e["facilities"]["total"] > 0 or e["staff"]["specialCare"] > 0:
            prefs[code] = e

    output = {
        "source": "厚生労働省「令和5年(2023) 介護サービス施設・事業所調査」",
        "sourceUrl": "https://www.mhlw.go.jp/toukei/saikin/hw/kaigo/service23/index.html",
        "year": "2023",
        "definitions": {
            "specialCare": "介護老人福祉施設 (特別養護老人ホーム)",
            "healthCare":  "介護老人保健施設",
            "medicalCare": "介護医療院",
            "specialCareCapacity": "介護老人福祉施設の定員（人）",
            "staff": "各施設タイプの従事者数 (常勤換算ではなく実数)",
        },
        "national": national,
        "prefectures": prefs,
    }

    output_path = os.path.join(OUTPUT_DIR, "kaigo_resources.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, separators=(",", ":"))
    print(f"\nWritten: {output_path}")
    print(f"  National total 介護保険施設: {national['facilities']['total']:,}")
    print(f"  Prefectures: {len(prefs)}")


if __name__ == "__main__":
    main()
