# 句碑 API MCP Server

AI Agent から[句碑データベース](https://github.com/shikano35/haiku_monument_api)を参照するための[MCP Server](http://modelcontextprotocol.io/specification)

<br>

> [!NOTE]
> 現在プレリリース版（β 版）として公開中です。
> 実験的な段階のため、仕様は今後変更される可能性があります。

<br>

## Tools

1. **get_haiku_monuments**

   - 句碑データベースに登録されているすべての句碑の情報を表示

2. **get_haiku_monuments_by_region**

   - 指定された地域の句碑を表示

3. **count_haiku_monuments_by_prefecture**

   - 指定された県の句碑の数を表示

4. **get_haiku_monuments_by_coordinates**

   - 指定された緯度経度範囲内の句碑を表示

5. **get_haiku_monuments_geojson**

   - 句碑データベースに登録されているすべての句碑の情報を GeoJSON 形式で表示

<br>

## インストール

1. `pnpm install`

2. `pnpm run build`

3. `.cursor/mcp.json`または`claude_desktop_config.json`(MacOS: `~/Library/Application\ Support/Claude/claude_desktop_config.json`)に以下を追加します。

```json
{
  "mcpServers": {
    "kuhi-api-mcp": {
      "command": "node",
      "args": ["/path/to/kuhi-api-mcp-server/dist/index.js"]
    }
  }
}
```
