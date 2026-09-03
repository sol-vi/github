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

粗利 = `(販売価格 − 購入価格) × 発注数`。原価は `RAW_B2B` の **`購入価格` 列**から
読むため、原価マスタを別途用意する必要はない。

販売粗利と無償提供原価は**受注単位**で分けている。ギフトセットは売上だけの行で、
その原価は同じ受注内の構成品行（売上¥0）に分かれているため、明細行単位で分けると
粗利率が約10ポイント過大に出る。詳細は `docs/cw-dashboard-b2b.md` を参照。
