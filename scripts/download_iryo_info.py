"""
医療情報ネット オープンデータ ダウンロードスクリプト
精神病床・結核病床・感染症病床を含む全病院の病床種別データを取得

Usage:
    python download_iryo_info.py
"""

import os
import zipfile
import requests
import time

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(PROJECT_ROOT, "data", "raw", "iryo_info")

# 医療情報ネット オープンデータ（病院施設票）
# https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/kenkou_iryou/iryou/newpage_43373.html
DOWNLOADS = {
    "2024-12": "https://www.mhlw.go.jp/content/11121000/01-1_hospital_facility_info_20241201.zip",
}


def download_file(url: str, dest: str, retries: int = 3) -> bool:
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


def main():
    os.makedirs(RAW_DIR, exist_ok=True)

    for label, url in DOWNLOADS.items():
        print(f"\n=== {label} ===")
        zip_path = os.path.join(RAW_DIR, f"hospital_facility_{label}.zip")
        if download_file(url, zip_path):
            # ZIP展開
            extract_dir = os.path.join(RAW_DIR, label)
            if not os.path.exists(extract_dir):
                print(f"  Extracting ZIP...")
                with zipfile.ZipFile(zip_path, "r") as zf:
                    zf.extractall(extract_dir)
                print(f"  Extracted to {extract_dir}")
            else:
                print(f"  Already extracted: {extract_dir}")

    print("\nDone!")


if __name__ == "__main__":
    main()
