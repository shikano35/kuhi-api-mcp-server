# 句碑 API MCP Server

AI Agent から[句碑データベース API](https://github.com/shikano35/haiku_monument_api)を参照するための[MCP Server](http://modelcontextprotocol.io/specification)です。

句碑（俳句が刻まれた石碑）の検索、俳人情報の取得、地理的データの活用など、俳句文化に関する豊富なデータにアクセスできます。

<br>

> [!NOTE]
> 現在プレリリース版（β 版）として公開中です。
> 実験的な段階のため、仕様は今後変更される可能性があります。

## 機能概要

### 句碑データ

- 全句碑データの取得
- ID による特定句碑の詳細取得
- 条件指定による句碑検索
- 地域・都道府県による絞り込み
- 緯度経度による範囲検索
- GeoJSON 形式での地理データ出力

### 俳人データ

- 俳人一覧の取得
- 俳人の詳細情報取得
- 俳人名・経歴による検索
- 特定俳人の句碑一覧取得

### 出典・参考文献

- 出典一覧の取得
- 出典の詳細情報取得
- タイトルによる検索

### 設置場所情報

- 設置場所一覧の取得
- 場所の詳細情報取得
- 地域・都道府県による絞り込み

## Tools

### 観光・探索向け

1. **explore_monuments_for_tourism**

   - 観光向けの句碑探索を支援
   - 特定の俳人、季節、地域で絞り込み可能
   - 読みやすいフォーマットで結果を返却
   - パラメータ:
     - `poet_name` (string, optional) - 俳人名（例: 松尾芭蕉）
     - `region` (string, optional) - 地域名（例: 東海）
     - `prefecture` (string, optional) - 都道府県名
     - `season` (string, optional) - 季節（春/夏/秋/冬）
     - `max_results` (number, default: 10) - 最大取得件数

2. **learn_about_monument**

   - 特定の句碑について深く学ぶ
   - 関連俳人・句・背景情報を統合して提供
   - パラメータ: `id` (number) - 句碑 ID

3. **discover_nearby_monuments**

   - 現在地周辺の句碑を発見
   - 距離順にソートして表示
   - 観光ルート計画に最適
   - パラメータ:
     - `latitude` (number) - 緯度
     - `longitude` (number) - 経度
     - `radius_meters` (number, default: 5000) - 検索半径（メートル）
     - `max_results` (number, default: 10) - 最大取得件数

### 分析・統計向け

4. **analyze_monuments_statistics**

   - データベース全体の統計分析
   - 都道府県別・地域別・俳人別・季節別の集計
   - 要約版と詳細版を選択可能
   - パラメータ: `format` ("summary" | "detailed", default: "summary")

5. **compare_poets_styles**

   - 複数の俳人のスタイル比較分析
   - 季語や季節の使い方の傾向を比較
   - パラメータ: `poet_names` (array of strings, 2-5 名) - 俳人名の配列

### 特殊用途

6. **find_similar_monuments**

   - 類似の句碑を検索
   - パラメータ:
     - `searchText` (string) - 検索テキスト
     - `limit` (number, optional) - 取得件数

7. **get_haiku_monuments_geojson**
   - GeoJSON 形式でデータを取得
   - 地図アプリケーションとの連携に最適

---

## install

### 前提条件

- Node.js 20 以降
- pnpm (推奨) または npm

### セットアップ

1. **依存関係のインストール**

   ```bash
   pnpm install
   ```

2. **ビルド**

   ```bash
   pnpm run build
   ```

3. **MCP 設定ファイルへの追加**

   **Claude Desktop の場合 (macOS):**
   `~/Library/Application Support/Claude/claude_desktop_config.json` に以下を追加:

   **Cursor の場合:**
   `.cursor/mcp.json` に以下を追加:

   **方法 1: npx を使用**

   ```json
   {
     "mcpServers": {
       "kuhi-api-mcp-server": {
         "command": "npx",
         "args": ["kuhi-api-mcp-server"]
       }
     }
   }
   ```

   **方法 2: ローカルビルドを使用**

   ```json
   {
     "mcpServers": {
       "kuhi-api-mcp-server": {
         "command": "node",
         "args": ["/path/to/kuhi-api-mcp-server/dist/index.js"]
       }
     }
   }
   ```

   > **注意:** 方法 2 の場合、`/path/to/kuhi-api-mcp-server` は実際のプロジェクトパスに置き換えてください。

## 開発

### 開発モードでの実行

```bash
pnpm run dev
```

### MCP Inspector による検証

公式の MCP Inspector を使用して、ブラウザから対話的にテストできます：

```bash
pnpm run inspector
```

### 型チェック

```bash
pnpm run type-check
```

### リント

```bash
pnpm run lint
```

## API 仕様

この MCP サーバーは [句碑 API](https://api.kuhi.jp) を使用しています。
詳細な API 仕様については、API ドキュメントを参照してください。

## ライセンス

MIT License

## 関連リンク

- [Model Context Protocol](https://modelcontextprotocol.io/)
- [句碑 API](https://developers.kuhi.jp/)
- [Claude Desktop](https://claude.ai/download)
- [Cursor](https://www.cursor.com/)
