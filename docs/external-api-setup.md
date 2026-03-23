# 外部API利用手順（無料API）

## 利用API
- 施設検索: Overpass API
- ルート距離/時間: OSRM public API

## このプロジェクトでの接続先
- Overpass: `https://overpass-api.de/api/interpreter`
- OSRM: `https://router.project-osrm.org`

## 実装ポイント
- 施設検索はバックエンドの `GET /api/search` で Overpass を呼び出す。
- ルート情報は `GET /api/route` で OSRM を呼び出す。
- OSRM が失敗した場合は、直線距離ベースで距離/時間を返却する。

## レート制限対策
- サーバー内で短時間キャッシュ（60秒）を実装済み。
- 半径やキーワードが同じ検索リクエストはキャッシュ結果を返す。

## ローカル動作確認
1. `npm install`
2. `npm --prefix server install`
3. `npm --prefix client install`
4. `npm run dev`
5. ブラウザで `http://localhost:5173` を開く

## トラブル時
- 検索が失敗する場合:
  - Overpass側の混雑が多いため、時間を置いて再実行
  - 半径やキーワードを狭める
- ルートが失敗する場合:
  - OSRMの代わりにフォールバック計算結果が返る
