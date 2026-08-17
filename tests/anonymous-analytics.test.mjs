import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const analyticsSource = await readFile(
  new URL("../app/anonymous-analytics.tsx", import.meta.url),
  "utf8",
);
const pageSource = await readFile(
  new URL("../app/page.tsx", import.meta.url),
  "utf8",
);

test("limits analytics to four parameter-free feature events", () => {
  for (const eventName of [
    "pwa_open",
    "record_complete",
    "analysis_view",
    "data_export",
  ]) {
    assert.match(analyticsSource, new RegExp(`\\|? \\\"${eventName}\\\"`));
    assert.match(pageSource + analyticsSource, new RegExp(`trackAnonymousEvent\\(\\\"${eventName}\\\"\\)`));
  }

  assert.match(
    analyticsSource,
    /gtag\("event", eventName, \{ send_to: MEASUREMENT_ID \}\)/,
  );
  assert.doesNotMatch(analyticsSource, /user_id|user_properties|childId|detail|response|emotionTags/);
});

test("uses cookieless analytics and disables advertising features", () => {
  assert.match(analyticsSource, /analytics_storage: "denied"/);
  assert.match(analyticsSource, /ad_storage: "denied"/);
  assert.match(analyticsSource, /ad_user_data: "denied"/);
  assert.match(analyticsSource, /ad_personalization: "denied"/);
  assert.match(analyticsSource, /allow_google_signals", false/);
  assert.match(analyticsSource, /allow_ad_personalization_signals", false/);
  assert.match(analyticsSource, /send_page_view: false/);
});
