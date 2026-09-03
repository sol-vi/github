# CRAFT WONDER DASHBOARD

Google Spreadsheet をデータソース、Google Apps Script をバックエンド、
HTML / CSS / JavaScript をフロントエンドとする社内Dashboard。

`CW_Dashboard_Design_Handoff_Prompt` を共通Master UIとして実装している。

## 実装済みページ

- **業務店営業**（`?page=b2b`）— 業務用・飲食店 受注売上ダッシュボード

## クイックスタート（GAS無しで見る）

```bash
python3 apps/cw-dashboard/tools/build_preview.py \
  --csv data/RAW_B2B_sample.csv \
  --out apps/cw-dashboard/preview/b2b.html
```

生成された `preview/b2b.html` をブラウザで開く。

## デプロイ・シート仕様

`docs/cw-dashboard-b2b.md` を参照。

## 編集時の注意

- `preview/b2b.html` は**自動生成物**。編集は `Index.html` / `Styles.html` /
  `Scripts.html` 側で行い、ビルドし直すこと。
- `Styles.html` は全ページ共通。ページごとにデザインを変えない（引き継ぎ書 §22）。
- `tools/build_preview.py` の正規化は `Code.gs` の移植。仕様の正は `Code.gs`。

## 粗利について

粗利は `Product_Master` シートの `原価` 列（商品別の標準原価）から算出する。
原価が未入力のうちは「原価未設定」と表示され、数値は出ない。

入力用のひな形:

```bash
python3 apps/cw-dashboard/tools/build_product_master.py \
  --csv data/RAW_B2B_sample.csv --out data/Product_Master_template.csv
```

`data/Product_Master_sample.csv` の原価は動作確認用のサンプル値であり、実原価ではない。
