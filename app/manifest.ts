import type { MetadataRoute } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "孩子睡眠與情緒觀察工具｜安睡角落",
    short_name: "安睡觀察",
    description: "快速記錄孩子的睡眠、情緒、特殊事件與日常觀察。",
    start_url: `${basePath}/`,
    scope: `${basePath}/`,
    display: "standalone",
    background_color: "#FFFDF9",
    theme_color: "#FFFDF9",
    lang: "zh-Hant",
    icons: [
      { src: `${basePath}/brand/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${basePath}/brand/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: `${basePath}/brand/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${basePath}/brand/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
