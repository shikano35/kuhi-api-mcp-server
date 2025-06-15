# 句碑 API MCP Server

AI Agent から[句碑データベース API](https://github.com/shikano35/haiku_monument_api)を参照するための[MCP Server](http://modelcontextprotocol.io/specification)です。

句碑（俳句が刻まれた石碑）の検索、俳人情報の取得、地理的データの活用など、俳句文化に関する豊富なデータにアクセスできます。

> [!NOTE]
> 現在プレリリース版（β 版）として公開中です。
> 実験的な段階のため、仕様は今後変更される可能性があります。

## 機能概要

### 🏛️ 句碑データ

- 全句碑データの取得
- ID による特定句碑の詳細取得
- 条件指定による句碑検索
- 地域・都道府県による絞り込み
- 緯度経度による範囲検索
- GeoJSON 形式での地理データ出力

### 👨‍🎨 俳人データ

- 俳人一覧の取得
- 俳人の詳細情報取得
- 俳人名・経歴による検索
- 特定俳人の句碑一覧取得

### 📚 出典・参考文献

- 出典一覧の取得
- 出典の詳細情報取得
- タイトルによる検索

### 📍 設置場所情報

- 設置場所一覧の取得
- 場所の詳細情報取得
- 地域・都道府県による絞り込み

## Tools

### 句碑関連

1. **get_haiku_monuments**

   - 句碑データベースに登録されているすべての句碑の情報を表示

2. **get_haiku_monument_by_id**

   - 指定された ID の句碑の詳細情報を表示
   - パラメータ: `id` (number) - 句碑 ID

3. **search_haiku_monuments**

   - 検索条件を指定して句碑を検索
   - パラメータ:
     - `search` (string, optional) - 検索キーワード
     - `prefecture` (string, optional) - 都道府県名
     - `region` (string, optional) - 地域名
     - `title_contains` (string, optional) - 句に含まれる文字列
     - `description_contains` (string, optional) - 解説に含まれる文字列
     - `limit` (number, optional) - 取得件数
     - `offset` (number, optional) - 取得開始位置

4. **get_haiku_monuments_by_region**

   - 指定された地域の句碑を表示
   - パラメータ: `region` (string) - 地域名

5. **count_haiku_monuments_by_prefecture**

   - 指定された県の句碑の数を表示
   - パラメータ: `prefecture` (string) - 県名

6. **get_haiku_monuments_by_coordinates**

   - 指定された緯度経度範囲内の句碑を表示
   - パラメータ:
     - `lat` (number) - 緯度
     - `lon` (number) - 経度
     - `radius` (number) - 半径(m)

7. **get_haiku_monuments_geojson**
   - 句碑データベースに登録されているすべての句碑の情報を GeoJSON 形式で表示

### 俳人関連

8. **get_poets**

   - 俳人の一覧を表示
   - パラメータ:
     - `name_contains` (string, optional) - 俳人名に含まれる文字列
     - `biography_contains` (string, optional) - 経歴に含まれる文字列
     - `limit` (number, optional) - 取得件数

9. **get_poet_by_id**

   - 指定された ID の俳人の詳細情報を表示
   - パラメータ: `id` (number) - 俳人 ID

10. **get_haiku_monuments_by_poet**
    - 指定された俳人の句碑一覧を表示
    - パラメータ: `poetId` (number) - 俳人 ID

### 出典関連

11. **get_sources**

    - 出典の一覧を表示
    - パラメータ:
      - `title_contains` (string, optional) - タイトルに含まれる文字列
      - `limit` (number, optional) - 取得件数

12. **get_source_by_id**
    - 指定された ID の出典の詳細情報を表示
    - パラメータ: `id` (number) - 出典 ID

### 設置場所関連

13. **get_locations**

    - 設置場所の一覧を表示
    - パラメータ:
      - `prefecture` (string, optional) - 都道府県名
      - `region` (string, optional) - 地域名
      - `limit` (number, optional) - 取得件数

14. **get_location_by_id**
    - 指定された ID の設置場所の詳細情報を表示
    - パラメータ: `id` (number) - 設置場所 ID

### 統計・分析関連

15. **get_haiku_monuments_statistics**

    - 句碑データベースの統計情報を表示
    - 都道府県別、地域別、俳人別、季節別の集計データを提供

16. **find_similar_monuments**

    - 類似の句碑を検索
    - パラメータ:
      - `searchText` (string) - 検索テキスト
      - `limit` (number, optional) - 取得件数

17. **get_monuments_by_season_and_region**
    - 季節と地域で句碑を絞り込み
    - パラメータ:
      - `season` (string) - 季節
      - `region` (string, optional) - 地域名

## インストール

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

   **方法 1: npx を使用（推奨）**

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

### 型チェック

```bash
pnpm run type-check
```

### リント

```bash
pnpm run lint
```

## 使用例

### 基本的な句碑検索

```
松尾芭蕉の句碑を検索してください
```

### 地域指定検索

```
東海地方にある句碑を教えてください
```

### GeoJSON データの取得

```
すべての句碑をGeoJSON形式で取得してください
```

### 特定の俳人の情報

```
小林一茶について詳しく教えて、関連する句碑も表示してください
```

## API 仕様

この MCP サーバーは [句碑 API](https://api.kuhiapi.com) を使用しています。
詳細な API 仕様については、API ドキュメントを参照してください。

## ライセンス

MIT License

## 関連リンク

- [Model Context Protocol](https://modelcontextprotocol.io/)
- [句碑 API](https://developers.kuhiapi.com/)
- [Claude Desktop](https://claude.ai/download)
- [Cursor](https://www.cursor.com/)
