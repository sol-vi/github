#!/usr/bin/env python3
"""受注CSVから `Product_Master` のひな形を作る。

`Product_Master` は**商品名の正規化とカテゴリ整備**のためのシート。
粗利の原価は `RAW_B2B.購入価格` から読むので、このシートを原価のために
用意する必要はない（`原価` 列は購入価格が空の商品を補う予備）。

    python3 apps/cw-dashboard/tools/build_product_master.py \
        --csv data/RAW_B2B_sample.csv --out data/Product_Master.csv

出力列:
    商品名        受注CSVに現れる生の商品名（突合キー）
    正規化商品名   自動判定した正式名。語順ゆれの統合はここを手で直す
    カテゴリ      商品名の【…】表記から自動判定
    品目区分      完成品 / 資材
    標準販売価格   参考値（最頻の販売価格）。集計には使わない
    購入価格      参考値（受注CSVの値）。ダッシュボードはCSV側を直接読む
    原価          空欄。購入価格が空の商品だけ手で埋める
    原価注記      空欄。暫定原価を使うときだけ書く（画面に帯で出る）
"""

from __future__ import annotations

import argparse
import csv
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_preview import guess_product, parse_number  # noqa: E402

FIELDS = [
    "商品名", "正規化商品名", "カテゴリ", "品目区分",
    "標準販売価格", "購入価格", "原価", "原価注記",
]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--csv", required=True, type=Path, help="受注明細 CSV（RAW_B2B）")
    ap.add_argument("--out", required=True, type=Path)
    args = ap.parse_args()

    with args.csv.open(encoding="utf-8-sig", newline="") as fh:
        rows = list(csv.DictReader(fh))

    prices: dict[str, list[float]] = defaultdict(list)
    purchase: dict[str, float] = {}
    info: dict[str, dict] = {}

    for r in rows:
        raw = (r.get("商品名") or "").strip()
        if not raw or (r.get("ステータス") or "").strip() == "合計":
            continue
        info.setdefault(raw, guess_product(raw))

        p = parse_number(r.get("販売価格"))
        if p > 0:
            prices[raw].append(p)

        c = parse_number(r.get("購入価格"))
        if c > 0:
            purchase[raw] = c

    out_rows = []
    for raw in sorted(info, key=lambda k: (info[k]["category"], info[k]["name"])):
        g = info[raw]
        px = prices.get(raw, [])
        # 同じ商品でも取引先ごとに価格が違うので、最頻値を標準販売価格とみなす
        standard = max(set(px), key=px.count) if px else 0
        out_rows.append({
            "商品名": raw,
            "正規化商品名": g["name"],
            "カテゴリ": g["category"],
            "品目区分": g["itemType"],
            "標準販売価格": int(standard) if standard else "",
            "購入価格": int(purchase[raw]) if raw in purchase else "",
            "原価": "",
            "原価注記": "",
        })

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8-sig", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(out_rows)

    no_cost = [r["商品名"] for r in out_rows if r["購入価格"] == ""]
    print(f"wrote {args.out}  products={len(out_rows)}")
    print(f"  購入価格あり : {len(out_rows) - len(no_cost)} / {len(out_rows)}")
    if no_cost:
        print(f"  購入価格なし : {len(no_cost)} 件（粗利が過大に出るため確認を推奨）")
        for name in no_cost[:5]:
            print(f"    - {name}")
        if len(no_cost) > 5:
            print(f"    ... ほか {len(no_cost) - 5} 件")


if __name__ == "__main__":
    main()
