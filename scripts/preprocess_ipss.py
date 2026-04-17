"""
IPSS 日本の地域別将来推計人口（令和5年推計）前処理スクリプト

国立社会保障・人口問題研究所が公表する都道府県別将来推計人口データを
JSONに変換し、病院ダッシュボードから利用できるようにする。

データソース:
  https://www.ipss.go.jp/pp-fuken/j/fuken2023/t-page.asp
  令和5（2023）年推計、基準年2020年、推計期間2020〜2050年（5年刻み）

期待する入力:
  data/raw/ipss/ipss_prefectures.xlsx
    IPSS公式サイトから「都道府県別 総人口および年齢3区分別人口」の詳細表を
    ダウンロードし、上記パスに配置する。
    （複数シート構成の場合は、都道府県別/年齢区分別のシートを自動認識）

  代替入力:
  data/raw/ipss/ipss_manual.csv
    手動集計した簡易CSV。列:
    prefCode, prefName, year, total, under15, age15_64, over65, over75

出力:
  public/data/summary/population_future.json
    {
      "source": "IPSS 日本の地域別将来推計人口（令和5年推計）",
      "baseYear": "2020",
      "years": ["2020", "2025", ...],
      "national": {"years": {"2020": {...}, ...}},
      "prefectures": {
        "01": {"name": "北海道", "years": {"2020": {...}, ...}},
        ...
      }
    }

Usage:
    python preprocess_ipss.py
"""

import csv
import glob
import json
import os
import re

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


def safe_int(val, default=0):
    if pd.isna(val) if hasattr(pd, "isna") else False:
        return default
    try:
        s = str(val).strip().replace(",", "").replace("-", "")
        if not s or s == "nan":
            return default
        return int(float(s))
    except (ValueError, TypeError):
        return default


def build_year_entry(total, under15, age15_64, over65, over75=None):
    """1年次分のエントリを構築"""
    total = int(total or 0)
    under15 = int(under15 or 0)
    age15_64 = int(age15_64 or 0)
    over65 = int(over65 or 0)
    entry = {
        "total": total,
        "under15": under15,
        "age15_64": age15_64,
        "over65": over65,
        "agingRate": round(over65 / total * 100, 1) if total > 0 else 0,
    }
    if over75 is not None:
        over75 = int(over75 or 0)
        entry["over75"] = over75
        entry["over75Rate"] = round(over75 / total * 100, 1) if total > 0 else 0
    return entry


def parse_manual_csv(path):
    """手動集計CSVから読み込み"""
    pref_years = {}
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            code = str(row.get("prefCode", "")).strip().zfill(2)
            if code not in PREFECTURE_NAMES:
                continue
            year = str(row.get("year", "")).strip()
            if year not in FORECAST_YEARS:
                continue
            total = safe_int(row.get("total"))
            under15 = safe_int(row.get("under15"))
            age15_64 = safe_int(row.get("age15_64"))
            over65 = safe_int(row.get("over65"))
            over75_raw = row.get("over75")
            over75 = safe_int(over75_raw) if over75_raw not in (None, "", "nan") else None
            pref_years.setdefault(code, {})[year] = build_year_entry(
                total, under15, age15_64, over65, over75
            )
    return pref_years


def parse_ipss_excel(path):
    """
    IPSS公表の Excel 詳細表を解析する。

    IPSSの詳細表は年次（2020, 2025, ...）ごとに、都道府県×年齢階級を集計した
    形をとることが多い。本関数は一般的な配置を仮定し、可能であれば抽出する。

    形式が合わない場合は空 dict を返す（上位で代替処理される）。
    """
    try:
        xls = pd.ExcelFile(path)
    except Exception as e:
        print(f"  Failed to open Excel: {e}")
        return {}

    pref_years = {}

    # シート名パターン: 都道府県コード (例: "01_hokkaido", "s01", "北海道") ごと
    for sheet_name in xls.sheet_names:
        code = extract_pref_code(sheet_name)
        if not code:
            continue
        try:
            df = pd.read_excel(path, sheet_name=sheet_name, header=None)
        except Exception:
            continue

        parsed = parse_pref_sheet(df)
        if parsed:
            pref_years[code] = parsed

    # 代替: 単一シートに全都道府県が並んでいるケース
    if not pref_years and xls.sheet_names:
        df = pd.read_excel(path, sheet_name=xls.sheet_names[0], header=None)
        pref_years = parse_combined_sheet(df)

    return pref_years


def extract_pref_code(text):
    """シート名やセル文字列から都道府県コードを抽出"""
    text = str(text or "").strip()
    # 数字2桁
    m = re.search(r"(\d{2})", text)
    if m:
        code = m.group(1)
        if code in PREFECTURE_NAMES:
            return code
    # 都道府県名
    for code, name in PREFECTURE_NAMES.items():
        if name in text or name.replace("県", "").replace("府", "").replace("都", "").replace("道", "") in text:
            return code
    return None


def parse_pref_sheet(df):
    """
    1都道府県分のシートを解析。年次 × 年齢階級の表を仮定。
    列ヘッダに年次が、行ヘッダに年齢階級が並ぶ想定。
    """
    # ヘッダ行を探す（2020, 2025 などを含む行）
    header_row_idx = None
    for i in range(min(10, len(df))):
        row = df.iloc[i].astype(str).tolist()
        if any("2020" in v for v in row) and any("2050" in v for v in row):
            header_row_idx = i
            break

    if header_row_idx is None:
        return {}

    header = df.iloc[header_row_idx].astype(str).tolist()
    year_cols = {}
    for ci, v in enumerate(header):
        m = re.search(r"(20\d{2})", v)
        if m and m.group(1) in FORECAST_YEARS:
            year_cols[m.group(1)] = ci

    if not year_cols:
        return {}

    # 行ラベル（A列）から 総数・0-14・15-64・65歳以上・75歳以上 を特定
    row_labels = {
        "total": None,
        "under15": None,
        "age15_64": None,
        "over65": None,
        "over75": None,
    }
    for ri in range(header_row_idx + 1, min(header_row_idx + 60, len(df))):
        label = str(df.iloc[ri, 0]).strip()
        label2 = str(df.iloc[ri, 1]).strip() if df.shape[1] > 1 else ""
        combined = label + label2
        if "総数" in combined or ("総人口" in combined and "万" not in combined):
            row_labels["total"] = ri
        elif "0" in combined and ("14" in combined or "〜14" in combined or "~14" in combined):
            row_labels["under15"] = ri
        elif "15" in combined and "64" in combined:
            row_labels["age15_64"] = ri
        elif ("65" in combined and "以上" in combined) and "75" not in combined:
            row_labels["over65"] = ri
        elif "75" in combined and "以上" in combined:
            row_labels["over75"] = ri

    if row_labels["total"] is None or row_labels["over65"] is None:
        return {}

    years_out = {}
    for year, col in year_cols.items():
        total = safe_int(df.iloc[row_labels["total"], col]) if row_labels["total"] is not None else 0
        under15 = safe_int(df.iloc[row_labels["under15"], col]) if row_labels["under15"] is not None else 0
        age15_64 = safe_int(df.iloc[row_labels["age15_64"], col]) if row_labels["age15_64"] is not None else 0
        over65 = safe_int(df.iloc[row_labels["over65"], col]) if row_labels["over65"] is not None else 0
        over75 = safe_int(df.iloc[row_labels["over75"], col]) if row_labels["over75"] is not None else None

        # IPSSは千人単位で公表されることがある: 総人口が極端に小さい場合は×1000
        if total and total < 10000:
            total *= 1000
            under15 *= 1000
            age15_64 *= 1000
            over65 *= 1000
            if over75 is not None:
                over75 *= 1000

        years_out[year] = build_year_entry(total, under15, age15_64, over65, over75)

    return years_out


def parse_combined_sheet(df):
    """単一シートに全都道府県が並ぶ形式を解析"""
    # 最初の数行から年列を特定
    header_row_idx = None
    for i in range(min(15, len(df))):
        row = df.iloc[i].astype(str).tolist()
        if sum(1 for v in row if re.search(r"20[2-5]\d", v)) >= 3:
            header_row_idx = i
            break

    if header_row_idx is None:
        return {}

    header = df.iloc[header_row_idx].astype(str).tolist()
    year_cols = {}
    for ci, v in enumerate(header):
        m = re.search(r"(20\d{2})", v)
        if m and m.group(1) in FORECAST_YEARS:
            year_cols.setdefault(m.group(1), ci)

    # 行ごとに都道府県名を探す
    pref_years = {}
    for ri in range(header_row_idx + 1, len(df)):
        label = " ".join(str(v) for v in df.iloc[ri, :3].tolist())
        code = extract_pref_code(label)
        if not code:
            continue

        # 合計/総数行のみ抽出（年齢区分別を含む場合、最初に出てくる総数行を使う）
        if code in pref_years:
            continue

        # 総数行のみ抽出: ラベルに "総数" or "計" が含まれる、または年齢指定が無い
        if not any(x in label for x in ["総数", "計", "合計"]):
            # 年齢行かもしれないのでスキップ（総数行を優先）
            # ただしシート全体に年齢がない場合もある → その場合は採用
            pass

        years_out = {}
        for year, col in year_cols.items():
            if col >= df.shape[1]:
                continue
            total = safe_int(df.iloc[ri, col])
            if total < 10000 and total > 0:
                total *= 1000  # 千人単位
            # 年齢区分は別行に存在する前提 → 総数のみ
            years_out[year] = build_year_entry(total, 0, 0, 0, None)

        if years_out:
            pref_years[code] = years_out

    return pref_years


def build_national_summary(pref_years):
    """都道府県データを合算して全国値を算出"""
    national = {}
    for year in FORECAST_YEARS:
        totals = {"total": 0, "under15": 0, "age15_64": 0, "over65": 0, "over75": 0}
        has75 = False
        for pref in pref_years.values():
            y = pref.get(year)
            if not y:
                continue
            totals["total"] += y.get("total", 0)
            totals["under15"] += y.get("under15", 0)
            totals["age15_64"] += y.get("age15_64", 0)
            totals["over65"] += y.get("over65", 0)
            if "over75" in y:
                totals["over75"] += y["over75"]
                has75 = True
        if totals["total"] == 0:
            continue
        national[year] = build_year_entry(
            totals["total"],
            totals["under15"],
            totals["age15_64"],
            totals["over65"],
            totals["over75"] if has75 else None,
        )
    return national


def main():
    os.makedirs(RAW_DIR, exist_ok=True)
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # 入力ソースを順に試す
    pref_years = {}
    used_source = None

    csv_path = os.path.join(RAW_DIR, "ipss_manual.csv")
    if os.path.exists(csv_path):
        print(f"Parsing CSV: {csv_path}")
        pref_years = parse_manual_csv(csv_path)
        used_source = "manual_csv"

    if not pref_years:
        excel_candidates = sorted(
            glob.glob(os.path.join(RAW_DIR, "*.xlsx"))
            + glob.glob(os.path.join(RAW_DIR, "*.xls"))
        )
        for path in excel_candidates:
            print(f"Parsing Excel: {path}")
            pref_years = parse_ipss_excel(path)
            if pref_years:
                used_source = os.path.basename(path)
                break

    if not pref_years:
        print("\n[WARN] IPSS 入力データが見つからないか、解析に失敗しました。")
        print(f"次のいずれかのファイルを配置してください:")
        print(f"  - {os.path.join(RAW_DIR, 'ipss_manual.csv')}")
        print(f"    列: prefCode,prefName,year,total,under15,age15_64,over65,over75")
        print(f"  - {os.path.join(RAW_DIR, 'ipss_prefectures.xlsx')}")
        print(f"    IPSS公式 https://www.ipss.go.jp/pp-fuken/j/fuken2023/t-page.asp")
        print("\nダッシュボードを動かすため、空のスケルトンJSONを出力します。")
        pref_years = {}

    # 全国合計
    national = build_national_summary(pref_years)

    # 都道府県データ整形
    prefectures = {}
    for code, name in PREFECTURE_NAMES.items():
        prefectures[code] = {
            "name": name,
            "years": pref_years.get(code, {}),
        }

    output = {
        "source": "国立社会保障・人口問題研究所「日本の地域別将来推計人口（令和5年推計）」",
        "sourceUrl": "https://www.ipss.go.jp/pp-fuken/j/fuken2023/t-page.asp",
        "baseYear": "2020",
        "years": FORECAST_YEARS,
        "inputSource": used_source,
        "national": {"years": national},
        "prefectures": prefectures,
    }

    output_path = os.path.join(OUTPUT_DIR, "population_future.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, separators=(",", ":"))

    print(f"\nWritten: {output_path}")

    filled = sum(1 for p in prefectures.values() if p["years"])
    print(f"  Prefectures with data: {filled}/47")
    if national:
        print(f"  National years: {sorted(national.keys())}")
        if "2020" in national and "2050" in national:
            y20 = national["2020"]["total"]
            y50 = national["2050"]["total"]
            delta = (y50 - y20) / y20 * 100 if y20 else 0
            print(f"  2020→2050 total pop change: {delta:+.1f}% ({y20:,} → {y50:,})")


if __name__ == "__main__":
    main()
