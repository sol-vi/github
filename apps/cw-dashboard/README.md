# CRAFT WONDER DASHBOARD

Google Spreadsheet をデータソース、Google Apps Script をバックエンド、
HTML / CSS / JavaScript をフロントエンドとする社内Dashboard。

`CW_Dashboard_Design_Handoff_Prompt` を共通Master UIとして実装している。

## 実装済みページ

- **業務店営業**（`?page=b2b`）— 受注売上ダッシュボード
- **在庫**（`?page=inventory`）— SCM 在庫ダッシュボード

## クイックスタート（GAS無しで見る）

```bash
python3 apps/cw-dashboard/tools/build_preview.py \
  --csv data/RAW_B2B_sample.csv \
  --out apps/cw-dashboard/preview/b2b.html
```

生成された `preview/b2b.html` をブラウザで開く。

## デプロイ・シート仕様

- 営業：`docs/cw-dashboard-b2b.md`
- 在庫：`docs/cw-dashboard-inventory.md`

在庫プレビューの生成:

```bash
python3 apps/cw-dashboard/tools/build_preview.py --page inventory \
  --inventory data/RAW_Inventory_sample.csv \
  --csv data/RAW_B2B_sample.csv \
  --out apps/cw-dashboard/preview/inventory.html
```

## 編集時の注意

- `preview/b2b.html` は**自動生成物**。編集は `Index.html` / `Styles.html` /
  `Scripts.html` 側で行い、ビルドし直すこと。
- `Styles.html` は全ページ共通。ページごとにデザインを変えない（引き継ぎ書 §22）。
- `tools/build_preview.py` の正規化は `Code.gs` の移植。仕様の正は `Code.gs`。

## 売上と粗利について

- **商品売上（税抜）** = 明細 **`総額`（AQ列）** の合計。販売価格×発注数 − 割引額。
  `小計`（AS列）は割引前なので使わない
- **粗利** = `総額 − 購入価格 × 発注数`
- **配送料** は売上・原価に含めず独立KPIとして別計算
- **対象顧客種別** は既定で全件。フィルターで絞り込む

ギフトセットは売上だけを持ち原価は構成品行にあるため、構成品の原価をセット商品へ
寄せている（区分が空欄の売上¥0行が構成品）。受注内の原価合計は変わらないので、
受注単位・店舗別の数値は不変で、商品別・カテゴリ別の粗利率だけが正確になる。
詳細は `docs/cw-dashboard-b2b.md` を参照。
