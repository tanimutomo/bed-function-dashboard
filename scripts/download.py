"""
厚生労働省 病床機能報告オープンデータ ダウンロードスクリプト

Usage:
    python download.py          # 全年度ダウンロード
    python download.py --year R5  # 特定年度のみ
"""

import os
import sys
import time
import zipfile
import requests

BASE_URL = "https://www.mhlw.go.jp/content/10800000"
RAW_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "raw")

# 各年度のダウンロードURL定義
# R1, R2はZIPファイル（中にCSV/XLSX含む）
# R3以降は個別のXLSXファイル

DOWNLOADS = {
    "R1": {
        "zip": f"{BASE_URL}/000755170.zip",
    },
    "R2": {
        "zip": f"{BASE_URL}/000799731.zip",
    },
    "R3": {
        "shisetsu": f"{BASE_URL}/000953853.xlsx",
        "shinryojo": f"{BASE_URL}/000953854.xlsx",
        "yoshiki2_annual": f"{BASE_URL}/000953855.xlsx",
        "yoshiki1_hokkaido_tohoku": f"{BASE_URL}/000953876.xlsx",
        "yoshiki1_kanto1": f"{BASE_URL}/000953878.xlsx",
        "yoshiki1_kanto2": f"{BASE_URL}/000953879.xlsx",
        "yoshiki1_chubu": f"{BASE_URL}/000953880.xlsx",
        "yoshiki1_kinki": f"{BASE_URL}/000953881.xlsx",
        "yoshiki1_chugoku_shikoku": f"{BASE_URL}/000953882.xlsx",
        "yoshiki1_kyushu_okinawa": f"{BASE_URL}/000953883.xlsx",
    },
    "R4": {
        "shisetsu": f"{BASE_URL}/001151957.xlsx",
        "shinryojo": f"{BASE_URL}/001151958.xlsx",
        "yoshiki2_annual": f"{BASE_URL}/001151972.xlsx",
        "yoshiki1_hokkaido_tohoku": f"{BASE_URL}/001151960.xlsx",
        "yoshiki1_kanto1": f"{BASE_URL}/001151962.xlsx",
        "yoshiki1_kanto2": f"{BASE_URL}/001151965.xlsx",
        "yoshiki1_chubu": f"{BASE_URL}/001151966.xlsx",
        "yoshiki1_kinki": f"{BASE_URL}/001151968.xlsx",
        "yoshiki1_chugoku": f"{BASE_URL}/001151969.xlsx",
        "yoshiki1_shikoku": f"{BASE_URL}/001151970.xlsx",
        "yoshiki1_kyushu_okinawa": f"{BASE_URL}/001151971.xlsx",
    },
    "R5": {
        "shisetsu": f"{BASE_URL}/001571863.xlsx",
        "shinryojo": f"{BASE_URL}/001571882.xlsx",
        "yoshiki2_annual": f"{BASE_URL}/001571903.xlsx",
        "yoshiki1_hokkaido_tohoku": f"{BASE_URL}/001571866.xlsx",
        "yoshiki1_kanto1": f"{BASE_URL}/001571868.xlsx",
        "yoshiki1_kanto2": f"{BASE_URL}/001571869.xlsx",
        "yoshiki1_chubu": f"{BASE_URL}/001571870.xlsx",
        "yoshiki1_kinki": f"{BASE_URL}/001571872.xlsx",
        "yoshiki1_chugoku_shikoku": f"{BASE_URL}/001571873.xlsx",
        "yoshiki1_kyushu_okinawa": f"{BASE_URL}/001571874.xlsx",
    },
    "R6": {
        "shisetsu": f"{BASE_URL}/001299890.xlsx",
        "shinryojo": f"{BASE_URL}/001299891.xlsx",
        "yoshiki2_annual": f"{BASE_URL}/001299957.xlsx",
        "yoshiki1_hokkaido_tohoku": f"{BASE_URL}/001299892.xlsx",
        "yoshiki1_kanto1": f"{BASE_URL}/001299893.xlsx",
        "yoshiki1_kanto2": f"{BASE_URL}/001299894.xlsx",
        "yoshiki1_chubu": f"{BASE_URL}/001299895.xlsx",
        "yoshiki1_kinki": f"{BASE_URL}/001299901.xlsx",
        "yoshiki1_chugoku_shikoku": f"{BASE_URL}/001299914.xlsx",
        "yoshiki1_kyushu_okinawa": f"{BASE_URL}/001299921.xlsx",
    },
}

# 和暦→西暦のマッピング
YEAR_MAP = {
    "R1": "2019",
    "R2": "2020",
    "R3": "2021",
    "R4": "2022",
    "R5": "2023",
    "R6": "2024",
}


def download_file(url: str, dest: str, retries: int = 3) -> bool:
    """ファイルをダウンロード（リトライ付き）"""
    if os.path.exists(dest):
        print(f"  Skip (exists): {os.path.basename(dest)}")
        return True

    for attempt in range(retries):
        try:
            print(f"  Downloading: {os.path.basename(dest)}...")
            resp = requests.get(url, stream=True, timeout=300)
            resp.raise_for_status()
            with open(dest, "wb") as f:
                for chunk in resp.iter_content(chunk_size=8192):
                    f.write(chunk)
            size_mb = os.path.getsize(dest) / (1024 * 1024)
            print(f"  Done: {size_mb:.1f} MB")
            return True
        except Exception as e:
            print(f"  Attempt {attempt + 1} failed: {e}")
            if os.path.exists(dest):
                os.remove(dest)
            if attempt < retries - 1:
                time.sleep(5)
    return False


def download_year(year: str):
    """指定年度のデータをダウンロード"""
    year_dir = os.path.join(RAW_DIR, year)
    os.makedirs(year_dir, exist_ok=True)

    files = DOWNLOADS.get(year)
    if not files:
        print(f"Unknown year: {year}")
        return

    print(f"\n=== {year} ({YEAR_MAP[year]}) ===")

    if "zip" in files:
        # R1, R2はZIPファイル
        zip_path = os.path.join(year_dir, f"{year}.zip")
        if download_file(files["zip"], zip_path):
            # ZIP展開
            extract_dir = os.path.join(year_dir, "extracted")
            if not os.path.exists(extract_dir):
                print(f"  Extracting ZIP...")
                with zipfile.ZipFile(zip_path, "r") as zf:
                    zf.extractall(extract_dir)
                print(f"  Extracted to {extract_dir}")
    else:
        # R3以降は個別ファイル
        for name, url in files.items():
            ext = url.split(".")[-1]
            dest = os.path.join(year_dir, f"{name}.{ext}")
            download_file(url, dest)


def main():
    target_years = None
    if "--year" in sys.argv:
        idx = sys.argv.index("--year")
        if idx + 1 < len(sys.argv):
            target_years = [sys.argv[idx + 1]]

    if target_years is None:
        target_years = list(DOWNLOADS.keys())

    print(f"Target years: {', '.join(target_years)}")
    for year in target_years:
        download_year(year)

    print("\nDone!")


if __name__ == "__main__":
    main()
