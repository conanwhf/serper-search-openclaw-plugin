import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import {
  createSerperWebSearchProvider,
  createSerperSearchToolDefinition,
} from "./src/serper-web-search-provider.js";

export default definePluginEntry({
  id: "serper",
  name: "Serper",
  description:
    "Google Search API via Serper.dev — fast, cheap, structured SERP results. Provides web-search provider + standalone serper_search tool.",
  register(api) {
    api.registerWebSearchProvider(createSerperWebSearchProvider());
    api.registerTool(createSerperSearchToolDefinition());
  },
});
