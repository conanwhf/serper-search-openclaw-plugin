# Serper Search Plugin for OpenClaw

> 🚀 Google Search API via [Serper.dev](https://serper.dev) — fast, cheap, structured SERP results for your OpenClaw agents.

## Features

- **Dual mode**: Registers as both a `web-search` provider (can replace Brave/Tavily as default) and a standalone `serper_search` tool
- **Config-based API key**: Store your key in plugin config, not in environment variables
- **Google-quality results**: Powered by Serper.dev's Google Search API
- **Caching**: Built-in result caching with configurable TTL
- **Country & language**: Supports `gl` (country) and `hl` (language) parameters
- **Related searches**: Returns "People Also Ask" suggestions
- **2500 free queries**: Serper.dev free tier included

## Requirements

- OpenClaw >= 2026.3.24-beta.2
- A Serper.dev API key ([get one here](https://serper.dev))

## Installation

### Option 1: Install from local path

```bash
git clone https://github.com/conanwhf/serper-search-openclaw-plugin.git
openclaw plugins install /path/to/serper-search-openclaw-plugin
```

### Option 2: Install directly from GitHub

```bash
openclaw plugins install https://github.com/conanwhf/serper-search-openclaw-plugin.git
```

## Configuration

### Step 1: Add your API key

Edit `~/.openclaw/openclaw.json` and add your Serper API key to the plugin config:

```json
{
  "plugins": {
    "entries": {
      "serper": {
        "enabled": true,
        "config": {
          "webSearch": {
            "apiKey": "your-serper-api-key"
          }
        }
      }
    }
  }
}
```

Or use the CLI:

```bash
openclaw configure --section web
```

### Step 2: Restart the gateway

```bash
openclaw gateway restart
```

### Optional: Set as default search provider

To make Serper your default `web_search` backend:

```json
{
  "tools": {
    "web": {
      "search": {
        "provider": "serper"
      }
    }
  }
}
```

### Optional: Default country and language

```json
{
  "plugins": {
    "entries": {
      "serper": {
        "enabled": true,
        "config": {
          "webSearch": {
            "apiKey": "your-serper-api-key",
            "defaultGl": "sg",
            "defaultHl": "en"
          }
        }
      }
    }
  }
}
```

## Usage

### As a standalone tool (`serper_search`)

The plugin registers a `serper_search` tool that is always available, regardless of which search provider is set as default:

```
# In your agent conversation:
Search the web for "OpenAI GPT-5 release date" using serper_search
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | ✅ | Search query string |
| `count` | number | ❌ | Number of results (1-10, default: 10) |
| `gl` | string | ❌ | Country code (e.g., `us`, `sg`, `cn`) |
| `hl` | string | ❌ | Language code (e.g., `en`, `zh`, `ja`) |

### As the default `web_search` provider

When set as the default search provider (`tools.web.search.provider: "serper"`), all `web_search` tool calls will route through Serper.

### As a web-search provider (non-default)

Even when not the default, the provider is registered and available. Other plugins or tools can reference it by id `serper`.

## Architecture

```
serper-search-openclaw-plugin/
├── index.js                              # Plugin entry point
├── openclaw.plugin.json                  # Plugin manifest
├── package.json                          # NPM package config
├── src/
│   └── serper-web-search-provider.js     # Core provider + tool logic
└── README.md                             # This file
```

### How it works

1. **`index.js`** — Plugin entry using `definePluginEntry()`. Registers both a web-search provider and a standalone tool.

2. **`src/serper-web-search-provider.js`** — Contains:
   - `createSerperWebSearchProvider()` — Registers the `serper` web-search provider with credential management, onboarding UI hints, and scoped config resolution.
   - `createSerperSearchToolDefinition()` — Creates the standalone `serper_search` tool.
   - `callSerperSearch()` — Core HTTP client calling Serper.dev's `/search` endpoint.
   - Built on OpenClaw's `plugin-sdk/provider-web-search` for caching, content wrapping, and config helpers.

3. **`openclaw.plugin.json`** — Manifest declaring the plugin id, capabilities, config schema, and UI hints.

## Serper.dev API Reference

This plugin uses the [Serper.dev Google Search API](https://docs.serper.dev):

- **Endpoint**: `POST https://google.serper.dev/search`
- **Auth**: `X-API-KEY` header
- **Free tier**: 2,500 queries
- **Pricing**: $2 per 1,000 queries after free tier

## Comparison with Other Search Providers

| Feature | Serper | Brave | Tavily |
|---------|--------|-------|--------|
| Backend | Google | Brave Index | Multiple |
| Free tier | 2,500 queries | 2,000 queries | 1,000 queries |
| Chinese queries | Moderate | Good | Good |
| English queries | Excellent | Good | Good |
| Related searches | ✅ People Also Ask | ❌ | ✅ |
| Country/language params | ✅ `gl`, `hl` | ✅ `country`, `search_lang` | ❌ |
| Price (after free) | $2/1K | $3/1K | Variable |

## Troubleshooting

### Plugin not loading

```bash
openclaw plugins list | grep -i serper
```

Check status is `loaded`. If `failed`, check logs:

```bash
openclaw gateway logs | grep serper
```

### API key not found

Make sure the key is in either:
- Plugin config: `plugins.entries.serper.config.webSearch.apiKey`
- Environment variable: `SERPER_API_KEY`

### "dangerous code patterns" error

This can happen if the plugin source directory contains raw `fetch` + `process.env` patterns. Use the installed version from `~/.openclaw/extensions/serper/` instead of the source directory.

## License

MIT

## Links

- [Serper.dev](https://serper.dev) — Get your API key
- [Serper.dev Docs](https://docs.serper.dev) — API documentation
- [OpenClaw Docs](https://docs.openclaw.ai) — OpenClaw documentation
- [OpenClaw Plugin SDK](https://docs.openclaw.ai/plugins/sdk-overview) — Plugin development guide
