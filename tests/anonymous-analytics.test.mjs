import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sources = await Promise.all([
  "../app/anonymous-analytics.tsx",
  "../app/layout.tsx",
  "../app/page.tsx",
  "../.github/workflows/deploy-pages.yml",
].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
const productionSource = sources.join("\n");

test("does not load or configure third-party analytics", () => {
  assert.doesNotMatch(productionSource, /G-DPB9VJT5Y6/);
  assert.doesNotMatch(productionSource, /googletagmanager|google-analytics/);
  assert.doesNotMatch(productionSource, /window\.gtag|analytics_storage/);
});

test("does not send feature-use events", () => {
  assert.doesNotMatch(productionSource, /trackAnonymousEvent/);
  assert.doesNotMatch(productionSource, /pwa_open|record_complete|analysis_view|data_export/);
});
