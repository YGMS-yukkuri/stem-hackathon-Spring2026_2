# STEM Hackathon Spring2026 - Module1/2 MVP

React + Node.js(Express) で、現在地周辺施設の検索・保存・ランダム選択を行うプロトタイプです。

## 実装済み機能
- 現在位置取得（Geolocation）と手動入力
- 周辺施設検索（Overpass API）
- 施設情報の表示（名称、住所、営業時間、電話番号、URL、距離、所要時間目安）
- 複数候補チェックとランダム選択
- 保存・閲覧・編集・削除（LocalStorage）
- 保存一覧の検索・ソート
- 保存済み複数選択からランダム選択
- 目的地までの距離/時間表示（OSRM + フォールバック）

## セットアップ
1. ルートで依存関係をインストール

```bash
npm install
npm --prefix server install
npm --prefix client install
```

2. 開発サーバー起動

```bash
npm run dev
```

- フロントエンド: http://localhost:5173
- バックエンド: http://localhost:3001

## API
- `GET /api/health`
- `GET /api/search?lat=35.68&lng=139.76&radius=1000&keyword=coffee&category=cafe`
- `GET /api/route?fromLat=35.68&fromLng=139.76&toLat=35.69&toLng=139.77`

## 注意
- 共有機能は仕様に基づきMVPでは未実装です。
- 外部API障害時は、検索でエラー表示、ルートは直線距離フォールバックを返します。
