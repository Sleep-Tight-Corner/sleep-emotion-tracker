"use client";

import { useEffect } from "react";

type AnonymousAnalyticsEvent =
  | "pwa_open"
  | "record_complete"
  | "analysis_view"
  | "data_export";

declare global {
  interface Window {
    dataLayer?: unknown[][];
    gtag?: (...args: unknown[]) => void;
  }
}

const MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "G-DPB9VJT5Y6";

function isConfigured() {
  return /^G-[A-Z0-9]+$/.test(MEASUREMENT_ID);
}

export function trackAnonymousEvent(eventName: AnonymousAnalyticsEvent) {
  if (!isConfigured() || typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", eventName, { send_to: MEASUREMENT_ID });
}

export function AnonymousAnalytics() {
  useEffect(() => {
    if (!isConfigured()) return;

    window.dataLayer = window.dataLayer ?? [];
    window.gtag = (...args: unknown[]) => {
      window.dataLayer!.push(args);
    };

    window.gtag("consent", "default", {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      ads_data_redaction: true,
    });
    window.gtag("set", "allow_google_signals", false);
    window.gtag("set", "allow_ad_personalization_signals", false);
    window.gtag("js", new Date());
    window.gtag("config", MEASUREMENT_ID, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      page_location: `${window.location.origin}${window.location.pathname}`,
      page_referrer: "",
    });

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`;
    script.dataset.anshuiAnalytics = "true";
    document.head.appendChild(script);

    trackAnonymousEvent("pwa_open");

    return () => {
      script.remove();
    };
  }, []);

  return null;
}
