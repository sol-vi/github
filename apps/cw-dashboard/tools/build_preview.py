#!/usr/bin/env python3
"""CSV から、GAS 無しでブラウザで開けるプレビューHTMLを生成する。

Index.html / Styles.html / Scripts.html はGAS本番と同じものをそのまま使い、
`getDashboardData()` の返り値だけを `window.__CW_PREVIEW_DATA__` として注入する。
Scripts.html はこの変数があればGASを呼ばずにそちらを使う。

このスクリプトの正規化ロジックは Code.gs の移植（プレビュー専用のミラー）。
仕様の正は Code.gs 側にあるので、片方を直したらもう片方も合わせること。

    python3 apps/cw-dashboard/tools/build_preview.py \
        --csv data/RAW_B2B_sample.csv \
        --out apps/cw-dashboard/preview/b2b.html
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import re
from collections import Counter
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent.parent

# --- Code.gs と同じ設定 -----------------------------------------------------

B2B_CUSTOMER_TYPES = ["飲食店", "卸売", "量販店・百貨店", "酒販小売"]
INCLUDE_STATUSES = {"確定済み", "完了"}
EXCLUDE_STATUSES = {"合計"}
BLANK = "未入力"

CATEGORY_ALIASES = {
    "ビール": "ビール", "BEER": "ビール", "Beer": "ビール",
    "ウイスキー": "ウイスキー", "WHISKEY": "ウイスキー", "WHISKY": "ウイスキー",
    "Whisky": "ウイスキー", "Whiskey": "ウイスキー",
    "リキュール": "リキュール", "LIQUEUR": "リキュール", "Liqueur": "リキュール",
    "卸専売品": "リキュール",
    "化粧箱": "化粧箱", "同梱物": "同梱物", "ギフト資材": "ギフト資材",
    "業務用": "その他",
}
MATERIAL_CATEGORIES = {"化粧箱", "同梱物", "ギフト資材"}

OPTION_KEYS = [
    "customerType", "segment", "lead", "repeat",
    "customer", "product", "category", "owner",
]


# --- 正規化（Code.gs の移植） -----------------------------------------------

def parse_number(v) -> float:
    if v is None or v == "":
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    s = re.sub(r"[¥￥,\s]", "", str(v))
    s = re.sub(r"[（(]([\d.]+)[)）]", r"-\1", s)
    try:
        return float(s)
    except ValueError:
        return 0.0


def to_iso_date(v: str) -> str:
    s = (v or "").strip()
    m = re.match(r"^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})", s)
    if not m:
        return ""
    return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"


def guess_product(raw_name: str) -> dict:
    name = raw_name.replace("　", " ")
    name = re.sub(r"\s+", " ", name).strip()
    name = name.replace("Rice Whisly Wonder", "Rice Whisky Wonder")

    category = "その他"
    m = re.search(r"【([^】]+)】", name)
    if m:
        key = m.group(1).strip()
        category = CATEGORY_ALIASES.get(key) or CATEGORY_ALIASES.get(key.upper()) or "その他"

    return {
        "name": name,
        "category": category,
        "itemType": "資材" if category in MATERIAL_CATEGORIES else "完成品",
    }


def normalize(rows: list[dict]) -> tuple[list[dict], list[str]]:
    warnings: list[str] = []
    skipped_status = 0
    skipped_no_product = 0
    renamed: set[str] = set()
    trimmed_types = 0
    out: list[dict] = []

    for r in rows:
        status = (r.get("ステータス") or "").strip()
        if status in EXCLUDE_STATUSES or status not in INCLUDE_STATUSES:
            skipped_status += 1
            continue

        product_raw = (r.get("商品名") or "").strip()
        if not product_raw:
            skipped_no_product += 1
            continue

        resolved = guess_product(product_raw)
        if resolved["name"] != product_raw:
            renamed.add(product_raw)

        ctype_raw = (r.get("顧客種別") or "").strip()
        ctype = re.sub(r"\s+", " ", ctype_raw).strip()
        if ctype != ctype_raw:
            trimmed_types += 1

        out.append({
            "status": status,
            "orderDate": to_iso_date(r.get("日付", "")),
            "shipDate": to_iso_date(r.get("出荷予定日", "")),
            "invoiceDate": to_iso_date(r.get("請求日", "")),
            "orderNo": (r.get("受注書番号") or "").strip() or BLANK,
            "lead": (r.get("リード種別") or "").strip() or BLANK,
            "repeat": (r.get("新規/リピート") or "").strip() or BLANK,
            "customerType": ctype or BLANK,
            "customer": (r.get("顧客名") or "").strip() or BLANK,
            "owner": (r.get("営業担当者") or "").strip() or BLANK,
            "ecDetail": (r.get("EC（他社サイト）の詳細") or "").strip(),
            "product": resolved["name"],
            "productRaw": product_raw,
            "category": resolved["category"],
            "itemType": resolved["itemType"],
            "segment": (r.get("区分") or "").strip() or BLANK,
            "qty": parse_number(r.get("発注数")),
            "unitPrice": parse_number(r.get("販売価格")),
            "discountAmount": parse_number(r.get("割引額")),
            "lineSales": parse_number(r.get("小計")),
            "orderTotal": parse_number(r.get("合計")),
            "shipping": parse_number(r.get("配送料")),
        })

    if skipped_status:
        warnings.append(f"対象外ステータスの {skipped_status} 行を除外しました。")
    if skipped_no_product:
        warnings.append(f"商品名が空の {skipped_no_product} 行を除外しました。")
    if renamed:
        warnings.append(f"商品名の表記ゆれ {len(renamed)} 件を正規化しました。")
    if trimmed_types:
        warnings.append(f"顧客種別の前後空白 {trimmed_types} 件を補正しました。")
    warnings.append("Product_Master シートが無いため、商品カテゴリは商品名の【…】表記から自動判定しています。")

    return out, warnings


def build_options(rows: list[dict]) -> dict:
    options = {}
    for key in OPTION_KEYS:
        counts = Counter(r[key] for r in rows if r.get(key))
        options[key] = [
            {"value": v, "count": c}
            for v, c in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
        ]
    return options


def build_payload(csv_path: Path) -> dict:
    with csv_path.open(encoding="utf-8-sig", newline="") as fh:
        raw_rows = list(csv.DictReader(fh))

    rows, warnings = normalize(raw_rows)

    allow = set(B2B_CUSTOMER_TYPES)
    scoped = [r for r in rows if r["customerType"] in allow] if allow else rows

    dates = sorted(r["orderDate"] for r in scoped if r["orderDate"])

    return {
        "meta": {
            "page": "b2b",
            "title": "業務用・飲食店 受注売上ダッシュボード",
            "eyebrow": "CRAFT WONDER / B2B SALES",
            "generatedAt": dt.datetime.now().strftime("%Y/%m/%d %H:%M") + "（プレビュー生成時刻）",
            "sheet": f"{csv_path.name}（プレビュー / 本番は RAW_B2B シート）",
            "sourceRows": len(raw_rows),
            "rowCount": len(scoped),
            "orderCount": len({r["orderNo"] for r in scoped}),
            "customerCount": len({r["customer"] for r in scoped}),
            "coverageFrom": dates[0] if dates else "",
            "coverageTo": dates[-1] if dates else "",
            "scopeCustomerTypes": B2B_CUSTOMER_TYPES,
            "includeStatuses": sorted(INCLUDE_STATUSES),
            "hasProductMaster": False,
            "warnings": warnings,
        },
        "options": build_options(scoped),
        "rows": scoped,
    }


# --- HTML 組み立て ----------------------------------------------------------

def build_html(payload: dict) -> str:
    index = (APP_DIR / "Index.html").read_text(encoding="utf-8")
    styles = (APP_DIR / "Styles.html").read_text(encoding="utf-8")
    scripts = (APP_DIR / "Scripts.html").read_text(encoding="utf-8")

    # </script> がJSON内に現れてもタグが閉じないようにエスケープする
    data_json = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    banner = (
        "<script>window.__CW_PREVIEW_DATA__=" + data_json + ";</script>\n"
        "<!-- このファイルは自動生成されたプレビューです。編集は Index/Styles/Scripts.html 側で行ってください。 -->\n"
    )

    html = index.replace("<?!= include('Styles'); ?>", styles)
    html = html.replace("<?!= include('Scripts'); ?>", banner + scripts)
    return html


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--csv", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    args = ap.parse_args()

    payload = build_payload(args.csv)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(build_html(payload), encoding="utf-8")

    meta = payload["meta"]
    print(f"wrote {args.out} ({args.out.stat().st_size:,} bytes)")
    print(f"  source rows : {meta['sourceRows']:,}")
    print(f"  scoped rows : {meta['rowCount']:,}  ({', '.join(B2B_CUSTOMER_TYPES)})")
    print(f"  orders      : {meta['orderCount']:,}")
    print(f"  customers   : {meta['customerCount']:,}")
    print(f"  coverage    : {meta['coverageFrom']} .. {meta['coverageTo']}")
    for w in meta["warnings"]:
        print(f"  warning     : {w}")


if __name__ == "__main__":
    main()
