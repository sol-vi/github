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


def normalize_key(s: str) -> str:
    """Code.gs の normalizeKey_() と同じ突き合わせキー。"""
    s = re.sub(r"[　\s]", "", s)
    s = s.replace("（", "(").replace("）", ")")
    s = re.sub(r"[〈〉<>]", "", s)
    s = re.sub(r"Whisly", "Whisky", s, flags=re.I)
    return s.lower()


def load_product_master(path: Path | None) -> tuple[dict, str]:
    """Product_Master CSV を読む。無ければ空。"""
    if not path:
        return {}, ""
    with path.open(encoding="utf-8-sig", newline="") as fh:
        rows = list(csv.DictReader(fh))

    master, notice = {}, ""
    for r in rows:
        raw = (r.get("商品名") or "").strip()
        if not raw:
            continue
        cost_text = (r.get("原価") or "").strip()
        master[normalize_key(raw)] = {
            "name": (r.get("正規化商品名") or "").strip() or raw,
            "category": (r.get("カテゴリ") or "").strip(),
            "itemType": (r.get("品目区分") or "").strip(),
            "cost": parse_number(cost_text),
            # 空欄と「原価0円」を区別する
            "hasCost": cost_text != "",
        }
        if not notice:
            notice = (r.get("原価注記") or "").strip()
    return master, notice


def normalize(rows: list[dict], master: dict | None = None) -> tuple[list[dict], list[str]]:
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
        hit = (master or {}).get(normalize_key(product_raw))
        if hit:
            resolved = {
                "name": hit["name"] or resolved["name"],
                "category": hit["category"] or resolved["category"],
                "itemType": hit["itemType"] or resolved["itemType"],
                "cost": hit["cost"],
                "hasCost": hit["hasCost"],
            }
        else:
            resolved = dict(resolved, cost=0.0, hasCost=False)
        if resolved["name"] != product_raw:
            renamed.add(product_raw)

        # 原価は明細の「購入価格」を一次情報とする（Code.gs と同じ）
        purchase_text = (r.get("購入価格") or "").strip()
        unit_cost = parse_number(purchase_text) if purchase_text else resolved["cost"]
        has_cost = purchase_text != "" or resolved["hasCost"]

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
            "unitCost": unit_cost,
            "lineCost": unit_cost * parse_number(r.get("発注数")),
            "hasCost": has_cost,
            "sku": (r.get("SKU（在庫保管単位）") or "").strip(),
            "itemKind": (r.get("商品の種類") or "").strip(),
            "prefecture": (r.get("都道府県（納品先）") or "").strip(),
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
    if not master:
        warnings.append("Product_Master シートが無いため、商品カテゴリは商品名の【…】表記から自動判定しています。")

    # 購入価格の欠落・¥0 はスコープ絞り込み後の件数でバナーに出すため、
    # ここでは warnings に足さない（全データ基準になり数字が食い違う）。
    uncosted = sorted({r["product"] for r in out if not r["hasCost"]})
    zero_sold = sorted({
        r["product"] for r in out
        if r["hasCost"] and r["unitCost"] == 0 and r["lineSales"] > 0
    })

    return out, warnings, uncosted, zero_sold


def build_options(rows: list[dict]) -> dict:
    options = {}
    for key in OPTION_KEYS:
        counts = Counter(r[key] for r in rows if r.get(key))
        options[key] = [
            {"value": v, "count": c}
            for v, c in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
        ]
    return options


def build_payload(csv_path: Path, master_path: Path | None = None) -> dict:
    with csv_path.open(encoding="utf-8-sig", newline="") as fh:
        raw_rows = list(csv.DictReader(fh))

    master, cost_notice = load_product_master(master_path)
    rows, warnings, uncosted, zero_sold = normalize(raw_rows, master)

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
            "hasProductMaster": bool(master),
            "costCoverage": {
                "withCost": len({r["product"] for r in scoped if r["hasCost"]}),
                "total": len({r["product"] for r in scoped}),
                "uncosted": sorted({r["product"] for r in scoped if not r["hasCost"]}),
                "zeroCostSold": sorted({
                    r["product"] for r in scoped
                    if r["hasCost"] and r["unitCost"] == 0 and r["lineSales"] > 0
                }),
            },
            "costNotice": cost_notice,
            "warnings": warnings,
        },
        "options": build_options(scoped),
        "rows": scoped,
    }


# --- HTML 組み立て ----------------------------------------------------------

ARTIFACT_TITLE = "CW 業務店営業ダッシュボード"


def build_html(payload: dict, fmt: str = "standalone") -> str:
    """fmt="standalone" は完全なHTML文書、"artifact" は Artifact 公開用の断片。

    Artifact は公開時に doctype / html / head / body の骨組みを付けるので、
    こちらは <title> + <style> + 本文 + <script> だけを出す。
    """
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

    if fmt == "standalone":
        return html

    # Artifact 用に、外側の文書構造だけを剥がす
    body = re.search(r"<body>(.*)</body>", html, re.S)
    if not body:
        raise SystemExit("Index.html から <body> を取り出せませんでした")

    return (
        f"<title>{ARTIFACT_TITLE}</title>\n"
        + styles.strip()
        + "\n"
        + body.group(1).strip()
        + "\n"
    )


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--csv", required=True, type=Path)
    ap.add_argument("--master", type=Path, help="Product_Master CSV（原価・正規化商品名）")
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument(
        "--format",
        choices=["standalone", "artifact"],
        default="standalone",
        help="standalone=ブラウザで直接開けるHTML文書 / artifact=Artifact公開用の断片",
    )
    args = ap.parse_args()

    payload = build_payload(args.csv, args.master)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(build_html(payload, args.format), encoding="utf-8")

    meta = payload["meta"]
    print(f"wrote {args.out} ({args.out.stat().st_size:,} bytes)")
    print(f"  source rows : {meta['sourceRows']:,}")
    print(f"  scoped rows : {meta['rowCount']:,}  ({', '.join(B2B_CUSTOMER_TYPES)})")
    print(f"  orders      : {meta['orderCount']:,}")
    print(f"  customers   : {meta['customerCount']:,}")
    print(f"  coverage    : {meta['coverageFrom']} .. {meta['coverageTo']}")
    cov = meta["costCoverage"]
    print(f"  cost set    : {cov['withCost']} / {cov['total']} products")
    if meta["costNotice"]:
        print(f"  cost notice : {meta['costNotice']}")
    for w in meta["warnings"]:
        print(f"  warning     : {w}")


if __name__ == "__main__":
    main()
