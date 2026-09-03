#!/usr/bin/env python3
"""受注CSVから Product_Master のひな形を作る。

    # 原価列が空のテンプレート（これに実原価を入力してもらう）
    python3 apps/cw-dashboard/tools/build_product_master.py \
        --csv data/RAW_B2B_sample.csv --out data/Product_Master_template.csv

    # 動作確認用のサンプル原価入り（実原価ではない）
    python3 apps/cw-dashboard/tools/build_product_master.py \
        --csv data/RAW_B2B_sample.csv --out data/Product_Master_sample.csv --sample-costs
"""

from __future__ import annotations

import argparse
import csv
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_preview import guess_product, parse_number  # noqa: E402

# 動作確認用のサンプル原価。実原価ではなく、下の一律ルールで機械的に置いた値。
SAMPLE_COST_RATE = 0.40          # 完成品：標準販売価格 × 40%
SAMPLE_MATERIAL_COST = {         # 資材：販売価格が常に¥0なので定額を置く
    "化粧箱": 250,
    "ギフト資材": 120,
    "同梱物": 30,
}
SAMPLE_NOTICE = (
    "この原価はサンプル値です（完成品＝標準販売価格×40%、資材＝カテゴリ別の定額）。"
    "実原価ではないため、粗利の金額は参考値です。"
)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--csv", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument(
        "--sample-costs",
        action="store_true",
        help="原価列に機械的なサンプル値を入れる（実原価ではない）",
    )
    args = ap.parse_args()

    with args.csv.open(encoding="utf-8-sig", newline="") as fh:
        rows = list(csv.DictReader(fh))

    # 商品ごとに、値のついた販売価格の最頻値を「標準販売価格」とみなす
    prices: dict[str, list[float]] = defaultdict(list)
    info: dict[str, dict] = {}

    for r in rows:
        raw = (r.get("商品名") or "").strip()
        if not raw or (r.get("ステータス") or "").strip() == "合計":
            continue
        resolved = guess_product(raw)
        info.setdefault(raw, resolved)
        p = parse_number(r.get("販売価格"))
        if p > 0:
            prices[raw].append(p)

    out_rows = []
    for raw in sorted(info, key=lambda k: (info[k]["category"], info[k]["name"])):
        g = info[raw]
        px = prices.get(raw, [])
        standard = max(set(px), key=px.count) if px else 0

        cost = ""
        if args.sample_costs:
            if g["itemType"] == "資材":
                cost = SAMPLE_MATERIAL_COST.get(g["category"], 100)
            elif standard > 0:
                cost = int(round(standard * SAMPLE_COST_RATE / 10) * 10)
            else:
                cost = ""

        out_rows.append({
            "商品名": raw,
            "正規化商品名": g["name"],
            "カテゴリ": g["category"],
            "品目区分": g["itemType"],
            "標準販売価格": int(standard) if standard else "",
            "原価": cost,
            "原価注記": SAMPLE_NOTICE if (args.sample_costs and not out_rows) else "",
        })

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8-sig", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(out_rows[0].keys()))
        w.writeheader()
        w.writerows(out_rows)

    filled = sum(1 for r in out_rows if r["原価"] != "")
    print(f"wrote {args.out}  products={len(out_rows)}  原価入力済み={filled}")
    if args.sample_costs:
        print("  NOTE:", SAMPLE_NOTICE)


if __name__ == "__main__":
    main()
