# 🐕 DogTracker - 犬のお留守番記録アプリ

iOSで動作する犬のお留守番時間記録アプリです。

## 動作環境

| 項目 | 要件 |
|------|------|
| iOS | 17.0 以上 |
| Xcode | 15.0 以上 |
| Swift | 5.9 以上 |

## 機能一覧

- **タイマー記録** - スタート/ストップボタンでお留守番時間を計測
- **3段階評価** - 記録終了後に ○ / △ / × で評価
- **一言メモ** - 自由テキストで当日の様子を記録
- **月別・年別履歴** - 過去の記録をカレンダー形式で確認
- **棒グラフ・折れ線グラフ** - 日別・月別の時間を可視化
- **評価分布** - ○△× の割合をグラフ表示
- **CSVエクスポート** - 全データをCSVファイルで書き出し
- **バックグラウンド継続** - アプリを閉じても計測を継続

## セットアップ

### 1. Xcodeプロジェクト作成

1. Xcode を開き、**File → New → Project**
2. **iOS → App** を選択
3. 以下を設定：
   - Product Name: `DogTracker`
   - Team: 自分のApple Developer Team
   - Bundle Identifier: `com.yourname.DogTracker`
   - Interface: **SwiftUI**
   - Language: **Swift**
   - Storage: **SwiftData**
4. プロジェクトを作成

### 2. ソースファイルを追加

1. デフォルトの `ContentView.swift` と `Item.swift` を削除
2. このリポジトリの `DogTracker/` フォルダ内のファイルをすべてプロジェクトに追加
   - グループ構成（`Models/`, `Managers/`, `Views/`）を再現すること

### 3. ビルドして実行

シミュレーターまたは実機でビルドしてください。

---

## 画面構成

```
タブ1: タイマー    → スタート/ストップ / 評価シート
タブ2: 履歴        → 月別・年別リスト
タブ3: 統計        → 棒グラフ・折れ線グラフ
タブ4: 設定        → CSVエクスポート / 全削除
```

---

## データエクスポート

### CSVエクスポート（標準）

1. **設定タブ** → **CSVでエクスポート** をタップ
2. 共有シートから保存先を選択（ファイルアプリ / メール / AirDrop など）
3. UTF-8 BOM付きCSVのため Excel・Google Sheetsで文字化けなく開けます

### Google Sheetsへのインポート

1. エクスポートしたCSVをGoogle Driveにアップロード
2. Google Driveでファイルを右クリック → **アプリで開く → Google スプレッドシート**
3. データが自動的に列に展開されます

### CSVの列構成

| 列 | 内容 |
|----|------|
| 日付 | yyyy/MM/dd |
| 開始時刻 | HH:mm:ss |
| 終了時刻 | HH:mm:ss |
| 時間（分） | 小数点1桁 |
| 評価 | ○ / △ / × |
| メモ | フリーテキスト |

---

## Google Sheets API 自動連携（オプション）

`Managers/GoogleSheetsManager.swift` に実装スケルトンがあります。

### 追加手順

1. [Google Cloud Console](https://console.cloud.google.com) でプロジェクト作成
2. **Google Sheets API** を有効化
3. **OAuth 2.0 クライアントID**（iOSアプリ用）を作成し Bundle ID を登録
4. Swift Package Manager で [GoogleSignIn-iOS](https://github.com/google/GoogleSignIn-iOS) を追加
5. `Info.plist` にURLスキームを追加
6. `GoogleSheetsManager.swift` の `spreadsheetId` を実際のIDに書き換え
7. サインインフローを `SettingsView` に組み込む

---

## ファイル構成

```
DogTracker/
├── DogTrackerApp.swift          # アプリエントリーポイント
├── ContentView.swift            # タブナビゲーション
├── Models/
│   ├── DogSession.swift         # SwiftDataモデル
│   └── Rating.swift             # 評価enum（○△×）
├── Managers/
│   ├── DataManager.swift        # タイマー管理（@Observable）
│   ├── ExportManager.swift      # CSVエクスポート
│   └── GoogleSheetsManager.swift# Google Sheets API連携
└── Views/
    ├── TimerView.swift          # メインタイマー画面
    ├── RatingView.swift         # 評価入力シート
    ├── HistoryView.swift        # 履歴ブラウザ
    ├── StatisticsView.swift     # グラフ・統計
    └── SettingsView.swift       # 設定・エクスポート
```
