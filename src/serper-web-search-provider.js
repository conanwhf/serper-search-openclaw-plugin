/**
 * Serper Web Search Provider for OpenClaw
 *
 * Calls the Serper.dev Google Search API.
 * Provides both a web-search provider and a standalone serper_search tool.
 *
 * Structure mirrors the GLM search plugin.
 */
import { Type } from "@sinclair/typebox";
import {
  DEFAULT_SEARCH_COUNT,
  MAX_SEARCH_COUNT,
  buildSearchCacheKey,
  formatCliCommand,
  mergeScopedSearchConfig,
  readCachedSearchPayload,
  readConfiguredSecretString,
  readNumberParam,
  readProviderEnvValue,
  readStringParam,
  resolveProviderWebSearchPluginConfig,
  resolveSearchCacheTtlMs,
  resolveSearchCount,
  resolveSearchTimeoutSeconds,
  resolveSiteName,
  setProviderWebSearchPluginConfigValue,
  setTopLevelCredentialValue,
  wrapWebContent,
  writeCachedSearchPayload,
} from "openclaw/plugin-sdk/provider-web-search";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SERPER_ENDPOINT = "https://google.serper.dev/search";

const SERPER_API_KEY_ENV_VARS = ["SERPER_API_KEY"] ;

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function resolveSerperApiKey(searchConfig) {
  return (
    readConfiguredSecretString(
      searchConfig?.apiKey,
      "tools.web.search.apiKey",
    ) ?? readProviderEnvValue([...SERPER_API_KEY_ENV_VARS])
  );
}

// ---------------------------------------------------------------------------
// Serper API client
// ---------------------------------------------------------------------------

async function callSerperSearch(params) {
  const { query, apiKey, count, timeoutSeconds, gl, hl } = params;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutSeconds * 1000);

  try {
    const body = { q: query, num: count || 10 };
    if (gl) body.gl = gl;
    if (hl) body.hl = hl;

    const res = await fetch(SERPER_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(
        `Serper API error (${res.status}): ${detail || res.statusText}`,
      );
    }

    const data = await res.json();

    // Serper returns organic results + knowledgeGraph + answerBox etc.
    const organic = Array.isArray(data.organic) ? data.organic : [];

    const results = organic.map((entry) => {
      const url = entry.link || "";
      const snippet = entry.snippet || "";
      return {
        title: entry.title ? wrapWebContent(entry.title, "web_search") : "",
        url,
        description: snippet
          ? wrapWebContent(snippet, "web_search")
          : "",
        published: entry.date || undefined,
        siteName:
          resolveSiteName(url) || undefined,
      };
    });

    // Collect related searches if present
    const relatedSearches = Array.isArray(data.peopleAlsoAsk)
      ? data.peopleAlsoAsk
          .map((r) => r.question)
          .filter((q) => typeof q === "string" && q.length > 0)
          .map((q) => wrapWebContent(q, "web_search"))
      : undefined;

    return { results, relatedSearches };
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Provider tool (for web-search provider registration)
// ---------------------------------------------------------------------------

const SerperSearchSchema = Type.Object({
  query: Type.String({ description: "Search query string." }),
  count: Type.Optional(
    Type.Number({
      description: "Number of results to return (1-10).",
      minimum: 1,
      maximum: MAX_SEARCH_COUNT,
    }),
  ),
});

function missingKeyPayload() {
  return {
    error: "missing_serper_api_key",
    message: `web_search (serper) needs a Serper API key. Run \`${formatCliCommand("openclaw configure --section web")}\` to store it, or set SERPER_API_KEY in the Gateway environment.`,
    docs: "https://serper.dev",
  };
}

function createSerperToolDefinition(searchConfig) {
  return {
    description:
      "Search the web using Serper.dev (Google Search API). Returns titles, URLs, and snippets.",
    parameters: SerperSearchSchema,
    execute: async (args) => {
      const apiKey = resolveSerperApiKey(searchConfig);
      if (!apiKey) return missingKeyPayload();

      const query = readStringParam(args, "query", { required: true });
      const count =
        readNumberParam(args, "count", { integer: true }) ??
        searchConfig?.maxResults ??
        undefined;

      const resolvedCount = resolveSearchCount(count, DEFAULT_SEARCH_COUNT);
      const cacheKey = buildSearchCacheKey(["serper", query, resolvedCount]);
      const cached = readCachedSearchPayload(cacheKey);
      if (cached) return cached;

      const start = Date.now();
      const timeoutSeconds = resolveSearchTimeoutSeconds(searchConfig);
      const cacheTtlMs = resolveSearchCacheTtlMs(searchConfig);

      const { results, relatedSearches } = await callSerperSearch({
        query,
        apiKey,
        count: resolvedCount,
        timeoutSeconds,
      });

      const payload = {
        query,
        provider: "serper",
        count: results.length,
        tookMs: Date.now() - start,
        externalContent: {
          untrusted: true,
          source: "web_search",
          provider: "serper",
          wrapped: true,
        },
        results: results.slice(0, resolvedCount),
        ...(relatedSearches?.length > 0 ? { relatedSearches } : {}),
      };

      writeCachedSearchPayload(cacheKey, payload, cacheTtlMs);
      return payload;
    },
  };
}

// ---------------------------------------------------------------------------
// Standalone tool (always available, regardless of default search provider)
// ---------------------------------------------------------------------------

export function createSerperSearchToolDefinition() {
  return {
    name: "serper_search",
    description:
      "Search the web using Serper.dev (Google Search API). Returns titles, URLs, and snippets. Use for fast, cheap Google-quality results.",
    parameters: Type.Object({
      query: Type.String({ description: "Search query string." }),
      count: Type.Optional(
        Type.Number({
          description: "Number of results to return (1-10).",
          minimum: 1,
          maximum: 10,
        }),
      ),
      gl: Type.Optional(
        Type.String({
          description: "Country code for results (e.g., 'us', 'sg', 'cn').",
        }),
      ),
      hl: Type.Optional(
        Type.String({
          description: "Language code for results (e.g., 'en', 'zh', 'ja').",
        }),
      ),
    }),
    async execute(_id, params) {
      // Resolve API key from plugin config first, then env
      const apiKey = readProviderEnvValue([...SERPER_API_KEY_ENV_VARS]);
      if (!apiKey) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(missingKeyPayload()),
            },
          ],
        };
      }

      const query = readStringParam(params, "query", { required: true });
      const count = readNumberParam(params, "count", { integer: true });
      const gl = readStringParam(params, "gl");
      const hl = readStringParam(params, "hl");
      const resolvedCount = resolveSearchCount(count, DEFAULT_SEARCH_COUNT);

      const cacheKey = buildSearchCacheKey([
        "serper-tool",
        query,
        resolvedCount,
        gl || "",
        hl || "",
      ]);
      const cached = readCachedSearchPayload(cacheKey);
      if (cached) {
        return { content: [{ type: "text", text: JSON.stringify(cached) }] };
      }

      const start = Date.now();
      const timeoutSeconds = 30;
      const cacheTtlMs = 15 * 60 * 1000;

      const { results, relatedSearches } = await callSerperSearch({
        query,
        apiKey,
        count: resolvedCount,
        timeoutSeconds,
        gl,
        hl,
      });

      const payload = {
        query,
        provider: "serper",
        count: results.length,
        tookMs: Date.now() - start,
        externalContent: {
          untrusted: true,
          source: "web_search",
          provider: "serper",
          wrapped: true,
        },
        results: results.slice(0, resolvedCount),
        ...(relatedSearches?.length > 0 ? { relatedSearches } : {}),
      };

      writeCachedSearchPayload(cacheKey, payload, cacheTtlMs);
      return { content: [{ type: "text", text: JSON.stringify(payload) }] };
    },
  };
}

// ---------------------------------------------------------------------------
// Provider registration
// ---------------------------------------------------------------------------

export function createSerperWebSearchProvider() {
  return {
    id: "serper",
    label: "Serper",
    hint: "Google Search API via Serper.dev · fast & cheap · 2500 free queries",
    credentialLabel: "Serper API key",
    envVars: [...SERPER_API_KEY_ENV_VARS],
    placeholder: "your-serper-api-key",
    signupUrl: "https://serper.dev",
    docsUrl: "https://docs.serper.dev",
    autoDetectOrder: 11,
    credentialPath: "plugins.entries.serper.config.webSearch.apiKey",
    inactiveSecretPaths: [
      "plugins.entries.serper.config.webSearch.apiKey",
    ],
    getCredentialValue: (searchConfig) => searchConfig?.apiKey,
    setCredentialValue: setTopLevelCredentialValue,
    getConfiguredCredentialValue: (config) =>
      resolveProviderWebSearchPluginConfig(config, "serper")?.apiKey,
    setConfiguredCredentialValue: (configTarget, value) => {
      setProviderWebSearchPluginConfigValue(
        configTarget,
        "serper",
        "apiKey",
        value,
      );
    },
    createTool: (ctx) =>
      createSerperToolDefinition(
        mergeScopedSearchConfig(
          ctx.searchConfig,
          "serper",
          resolveProviderWebSearchPluginConfig(ctx.config, "serper"),
          { mirrorApiKeyToTopLevel: true },
        ),
      ),
  };
}
