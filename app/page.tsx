"use client";

import {
  Archive,
  Baby,
  BarChart3,
  BedDouble,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Eraser,
  FileDown,
  FileSpreadsheet,
  Heart,
  Home,
  Info,
  Mail,
  MoonStar,
  NotebookPen,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  SmilePlus,
  Sparkles,
  Sun,
  Trophy,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { jsPDF } from "jspdf";
import { useEffect, useMemo, useRef, useState } from "react";
import { trackAnonymousEvent } from "./anonymous-analytics";

type RecordType =
  | "bed"
  | "sleep"
  | "wake"
  | "emotion"
  | "event"
  | "note"
  | "gratitude"
  | "success";
type Tab = "today" | "records" | "analysis" | "export" | "settings";

type Child = {
  id: string;
  name: string;
  birthday?: string;
  dueDate?: string;
  ageMode?: "chronological" | "corrected";
  color: string;
  archived?: boolean;
};

type SleepRecord = {
  id: string;
  childId: string;
  type: RecordType;
  at: string;
  endAt?: string;
  title?: string;
  detail?: string;
  intensity?: number;
  duration?: number;
  response?: string;
  tags?: string[];
  emotionTags?: string[];
};

type AppData = {
  children: Child[];
  records: SleepRecord[];
  activeChildId: string;
  lastBackup?: string;
  backupReminder: boolean;
};

type SleepSegment = {
  sleepId: string;
  wakeId: string;
  start: Date;
  end: Date;
  duration: number;
};

type SleepLatencySegment = {
  bedId: string;
  sleepId: string;
  start: Date;
  end: Date;
  duration: number;
};

const STORAGE_KEY = "anshui-sleep-observer-v1";
const APP_VERSION = "1.6.0";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const MAX_CHILDREN = 10;
const MULTILINE_TEXT_LIMIT = 500;
const CONTACT_EMAIL = "hello@sleeptightcorner.com";
const SUPPORT_URL = "https://portaly.cc/sleeptight/support";
const BUG_REPORT_MAILTO = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
  "孩子睡眠與情緒觀察工具｜問題回報",
)}&body=${encodeURIComponent(
  "您好，我在使用孩子睡眠與情緒觀察工具時遇到以下問題：\n\n發生問題的頁面：\n操作步驟：\n看到的結果：\n使用裝置／瀏覽器：\n\n如附上畫面截圖，請先遮住不必要的孩子個人資料。",
)}`;
const COLORS = ["#C77F67", "#7D9A8C", "#C79E58", "#8C7897", "#6D91A3"];

const recordMeta: Record<
  RecordType,
  { label: string; short: string; color: string; Icon: typeof BedDouble }
> = {
  bed: { label: "上床", short: "上床", color: "#5F7890", Icon: BedDouble },
  sleep: { label: "入睡", short: "入睡", color: "#5F766C", Icon: MoonStar },
  wake: { label: "起床", short: "起床", color: "#C18A39", Icon: Sun },
  emotion: { label: "情緒／行為", short: "情緒", color: "#C5675F", Icon: SmilePlus },
  event: { label: "特殊事件", short: "事件", color: "#6C7E9B", Icon: Sparkles },
  note: { label: "一般備註", short: "備註", color: "#756B63", Icon: NotebookPen },
  gratitude: { label: "感恩日記", short: "感恩", color: "#B7789A", Icon: Heart },
  success: { label: "成功日記", short: "成功", color: "#B28742", Icon: Trophy },
};

const emotionOptions = [
  { label: "焦躁", emoji: "😣" },
  { label: "哭泣", emoji: "😭" },
  { label: "黏人", emoji: "🤗" },
  { label: "興奮", emoji: "🤩" },
  { label: "抗拒", emoji: "🙅" },
  { label: "疲倦", emoji: "😴" },
  { label: "平穩", emoji: "😌" },
  { label: "開心", emoji: "😊" },
  { label: "其他", emoji: "💭" },
];
const eventOptions = ["長牙", "生病", "疫苗", "大動作發展", "旅行", "更換照顧者", "作息改變", "其他"];
const noteTags = ["飲食", "身體狀況", "活動", "環境", "作息", "照顧方式", "其他"];

const sleepRecommendations = [
  { label: "0－3 個月", minMonths: 0, maxMonths: 3, recommendedMin: 14, recommendedMax: 17, acceptableMin: 11, acceptableMax: 19 },
  { label: "4－11 個月", minMonths: 4, maxMonths: 11, recommendedMin: 12, recommendedMax: 15, acceptableMin: 10, acceptableMax: 18 },
  { label: "1－2 歲", minMonths: 12, maxMonths: 35, recommendedMin: 11, recommendedMax: 14, acceptableMin: 9, acceptableMax: 16 },
  { label: "3－5 歲", minMonths: 36, maxMonths: 71, recommendedMin: 10, recommendedMax: 13, acceptableMin: 8, acceptableMax: 14 },
  { label: "6－13 歲", minMonths: 72, maxMonths: 167, recommendedMin: 9, recommendedMax: 11, acceptableMin: 7, acceptableMax: 12 },
];

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function atLocal(dateKey: string, time: string) {
  return new Date(`${dateKey}T${time}:00`).toISOString();
}

function timeLabel(iso: string | Date) {
  return new Intl.DateTimeFormat("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function dateLabel(dateKey: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${dateKey}T12:00:00`));
}

function minutesLabel(minutes: number) {
  if (!minutes) return "0 分鐘";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (!h) return `${m} 分鐘`;
  return m ? `${h} 小時 ${m} 分` : `${h} 小時`;
}

function recordEmotionTags(record: SleepRecord) {
  return record.type === "emotion" ? record.tags ?? [] : record.emotionTags ?? [];
}

function emotionEmoji(label: string) {
  if (label === "平靜") return "😌";
  return emotionOptions.find((option) => option.label === label)?.emoji ?? "💭";
}

function ageInMonths(referenceDate?: string) {
  if (!referenceDate) return undefined;
  const birth = new Date(`${referenceDate}T12:00:00`);
  const now = new Date();
  let months =
    (now.getFullYear() - birth.getFullYear()) * 12 +
    now.getMonth() -
    birth.getMonth();
  if (now.getDate() < birth.getDate()) months--;
  return Math.max(0, months);
}

function ageReferenceDate(child?: Child) {
  if (!child) return undefined;
  return child.ageMode === "corrected" && child.dueDate
    ? child.dueDate
    : child.birthday;
}

function sleepRecommendation(child?: Child) {
  const months = ageInMonths(ageReferenceDate(child));
  if (months === undefined) return undefined;
  return sleepRecommendations.find(
    (item) => months >= item.minMonths && months <= item.maxMonths,
  );
}

function sleepRangeStatus(
  minutes: number,
  recommendation?: (typeof sleepRecommendations)[number],
) {
  if (!minutes || !recommendation) return undefined;
  const hours = minutes / 60;
  if (
    hours >= recommendation.recommendedMin &&
    hours <= recommendation.recommendedMax
  ) {
    return { label: "建議", icon: "✓", tone: "met" };
  }
  if (
    hours >= recommendation.acceptableMin &&
    hours <= recommendation.acceptableMax
  ) {
    return { label: "可接受", icon: "○", tone: "acceptable" };
  }
  return { label: "不建議", icon: "!", tone: "not-recommended" };
}

function pairSleepSegments(records: SleepRecord[]) {
  const sorted = [...records].sort((a, b) => +new Date(a.at) - +new Date(b.at));
  const segments: SleepSegment[] = [];
  let lastSleep: SleepRecord | null = null;

  for (const record of sorted) {
    if (record.type === "sleep") lastSleep = record;
    if (record.type === "wake" && lastSleep) {
      const start = new Date(lastSleep.at);
      const end = new Date(record.at);
      const duration = (+end - +start) / 60000;
      if (duration >= 0 && duration < 1440) {
        segments.push({
          sleepId: lastSleep.id,
          wakeId: record.id,
          start,
          end,
          duration,
        });
      }
      lastSleep = null;
    }
  }
  return segments;
}

function pairSleepLatencySegments(records: SleepRecord[]) {
  const sorted = [...records].sort((a, b) => +new Date(a.at) - +new Date(b.at));
  const segments: SleepLatencySegment[] = [];
  let lastBed: SleepRecord | null = null;

  for (const record of sorted) {
    if (record.type === "bed") lastBed = record;
    if (record.type === "sleep" && lastBed) {
      const start = new Date(lastBed.at);
      const end = new Date(record.at);
      const duration = (+end - +start) / 60000;
      if (duration >= 0 && duration < 720) {
        segments.push({
          bedId: lastBed.id,
          sleepId: record.id,
          start,
          end,
          duration,
        });
      }
      lastBed = null;
    }
    if (record.type === "wake") lastBed = null;
  }
  return segments;
}

function segmentsForDate(segments: SleepSegment[], date: string) {
  const dayStart = new Date(`${date}T00:00:00`);
  const dayEnd = new Date(`${date}T24:00:00`);
  return segments
    .filter((segment) => segment.start < dayEnd && segment.end > dayStart)
    .map((segment) => {
      const start = segment.start < dayStart ? dayStart : segment.start;
      const end = segment.end > dayEnd ? dayEnd : segment.end;
      const startMinute =
        start.getHours() * 60 + start.getMinutes() + start.getSeconds() / 60;
      const duration = (+end - +start) / 60000;
      return {
        ...segment,
        clippedStart: start,
        clippedEnd: end,
        startMinute,
        duration,
      };
    });
}

function averageClockLabel(records: SleepRecord[]) {
  const sleepTimes = records
    .filter((record) => record.type === "sleep")
    .map((record) => {
      const date = new Date(record.at);
      return date.getHours() * 60 + date.getMinutes();
    });
  if (!sleepTimes.length) return "尚無資料";
  const angles = sleepTimes.map((minutes) => (minutes / 1440) * Math.PI * 2);
  const x = angles.reduce((sum, angle) => sum + Math.cos(angle), 0);
  const y = angles.reduce((sum, angle) => sum + Math.sin(angle), 0);
  let averageAngle = Math.atan2(y, x);
  if (averageAngle < 0) averageAngle += Math.PI * 2;
  const totalMinutes = Math.round((averageAngle / (Math.PI * 2)) * 1440) % 1440;
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
}

function eventRangeLabel(record: SleepRecord) {
  const start = localDateKey(new Date(record.at)).replaceAll("-", "/");
  if (!record.endAt) return start;
  const end = localDateKey(new Date(record.endAt)).replaceAll("-", "/");
  return start === end ? start : `${start}－${end}`;
}

function daysBetween(start: string, end: string) {
  const dates: string[] = [];
  const cursor = new Date(`${start}T12:00:00`);
  const finish = new Date(`${end}T12:00:00`);
  while (cursor <= finish && dates.length < 366) {
    dates.push(localDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function shiftDateKey(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

function calendarAgeParts(referenceDate?: string) {
  if (!referenceDate) return undefined;
  const start = new Date(`${referenceDate}T12:00:00`);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  if (start > today) return { years: 0, months: 0, days: 0 };

  let years = today.getFullYear() - start.getFullYear();
  let months = today.getMonth() - start.getMonth();
  let days = today.getDate() - start.getDate();
  if (days < 0) {
    months--;
    days += new Date(today.getFullYear(), today.getMonth(), 0).getDate();
  }
  if (months < 0) {
    years--;
    months += 12;
  }
  return {
    years: Math.max(0, years),
    months: Math.max(0, months),
    days: Math.max(0, days),
  };
}

function ageLabel(child?: Child) {
  const corrected = child?.ageMode === "corrected" && Boolean(child.dueDate);
  const parts = calendarAgeParts(
    corrected ? child?.dueDate : child?.birthday,
  );
  if (!parts) {
    return corrected ? "預產期尚未設定" : "出生日期尚未設定";
  }
  return `${corrected ? "矯齡" : "出生"}${parts.years}歲${parts.months}月${parts.days}天`;
}

function compactMinutesLabel(minutes: number) {
  if (!minutes) return "";
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const remain = rounded % 60;
  return hours ? `${hours}時${remain}分` : `${remain}分`;
}

function analyze(records: SleepRecord[]) {
  const sorted = [...records].sort((a, b) => +new Date(a.at) - +new Date(b.at));
  let totalSleep = 0;
  let totalBed = 0;
  const sleepDurations: number[] = [];
  const awakeIntervals: number[] = [];
  const latencies: number[] = [];
  let lastBed: Date | null = null;
  let lastSleep: Date | null = null;
  let lastWake: Date | null = null;

  for (const record of sorted) {
    const current = new Date(record.at);
    if (record.type === "bed") lastBed = current;
    if (record.type === "sleep") {
      if (lastBed && current >= lastBed) {
        const latency = (+current - +lastBed) / 60000;
        if (latency < 720) latencies.push(latency);
      }
      if (lastWake && current >= lastWake) {
        const awake = (+current - +lastWake) / 60000;
        if (awake < 720) awakeIntervals.push(awake);
      }
      lastSleep = current;
    }
    if (record.type === "wake") {
      if (lastSleep && current >= lastSleep) {
        const duration = (+current - +lastSleep) / 60000;
        if (duration < 1440) {
          sleepDurations.push(duration);
          totalSleep += duration;
        }
      }
      if (lastBed && current >= lastBed) {
        const inBed = (+current - +lastBed) / 60000;
        if (inBed < 1440) totalBed += inBed;
      }
      lastWake = current;
      lastSleep = null;
      lastBed = null;
    }
  }
  return {
    totalSleep,
    totalBed,
    sleepDurations,
    awakeIntervals,
    latency: latencies.length
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length
      : 0,
  };
}

const initialData: AppData = {
  children: [],
  records: [],
  activeChildId: "",
  backupReminder: true,
};

export default function HomePage() {
  const [data, setData] = useState<AppData>(initialData);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>("today");
  const [selectedDate, setSelectedDate] = useState(localDateKey());
  const [showChildForm, setShowChildForm] = useState(false);
  const [editingChild, setEditingChild] = useState<Child | null>(null);
  const [showRecordForm, setShowRecordForm] = useState<RecordType | null>(null);
  const [editingRecord, setEditingRecord] = useState<SleepRecord | null>(null);
  const [toast, setToast] = useState<{ text: string; undo?: SleepRecord } | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<RecordType | "all">("all");
  const [analysisDays, setAnalysisDays] = useState(7);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setData(JSON.parse(stored));
    } catch {
      // Keep the clean state and let the user start again.
    }
    setLoaded(true);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register(`${BASE_PATH}/sw.js`);
    }
  }, []);

  useEffect(() => {
    if (loaded) localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data, loaded]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const activeChildren = data.children.filter((child) => !child.archived);
  const activeChild =
    activeChildren.find((child) => child.id === data.activeChildId) ??
    activeChildren[0];

  useEffect(() => {
    if (loaded && activeChildren.length && !activeChild) {
      setData((old) => ({ ...old, activeChildId: activeChildren[0].id }));
    }
  }, [activeChild, activeChildren, loaded]);

  const visibleRecords = useMemo(
    () =>
      data.records
        .filter((record) => record.childId === activeChild?.id)
        .sort((a, b) => +new Date(a.at) - +new Date(b.at)),
    [data.records, activeChild?.id],
  );

  const dayRecords = visibleRecords.filter(
    (record) => localDateKey(new Date(record.at)) === selectedDate,
  );
  const daySleepSegments = segmentsForDate(
    pairSleepSegments(visibleRecords),
    selectedDate,
  );
  const dayLatencySegments = pairSleepLatencySegments(visibleRecords).filter(
    (segment) => localDateKey(segment.start) === selectedDate,
  );
  const dayBaseAnalysis = analyze(dayRecords);
  const dayAnalysis = {
    ...dayBaseAnalysis,
    totalSleep: daySleepSegments.reduce(
      (sum, segment) => sum + segment.duration,
      0,
    ),
    sleepDurations: daySleepSegments.map((segment) => segment.duration),
    latency: dayLatencySegments.length
      ? dayLatencySegments.reduce((sum, segment) => sum + segment.duration, 0) /
        dayLatencySegments.length
      : 0,
  };
  const today = localDateKey();
  const isToday = selectedDate === today;
  const isFuture = selectedDate > today;

  function moveDate(delta: number) {
    const date = new Date(`${selectedDate}T12:00:00`);
    date.setDate(date.getDate() + delta);
    setSelectedDate(localDateKey(date));
  }

  function changeTab(nextTab: Tab) {
    if (nextTab === "analysis" && tab !== "analysis") {
      trackAnonymousEvent("analysis_view");
    }
    setTab(nextTab);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  }

  function addQuick(type: "bed" | "sleep" | "wake") {
    if (!activeChild || isFuture) return;
    if (!isToday) {
      setShowRecordForm(type);
      return;
    }
    const record: SleepRecord = {
      id: uid(),
      childId: activeChild.id,
      type,
      at: new Date().toISOString(),
    };
    setData((old) => ({ ...old, records: [...old.records, record] }));
    trackAnonymousEvent("record_complete");
    setToast({
      text: `已記錄 ${timeLabel(record.at)} ${recordMeta[type].label}`,
      undo: record,
    });
  }

  function saveJournal(type: "gratitude" | "success", detail: string) {
    if (!activeChild || isFuture) return;
    const existing = dayRecords.find((record) => record.type === type);
    setData((old) => ({
      ...old,
      records: detail.trim()
        ? existing
          ? old.records.map((record) =>
              record.id === existing.id
                ? { ...record, detail: detail.trim() }
                : record,
            )
          : [
              ...old.records,
              {
                id: uid(),
                childId: activeChild.id,
                type,
                at: atLocal(selectedDate, "12:00"),
                detail: detail.trim(),
              },
            ]
        : existing
          ? old.records.filter((record) => record.id !== existing.id)
          : old.records,
    }));
    if (detail.trim()) trackAnonymousEvent("record_complete");
    setToast({ text: detail.trim() ? "日記已保存" : "日記內容已清除" });
  }

  function deleteRecord(record: SleepRecord) {
    setData((old) => ({
      ...old,
      records: old.records.filter((item) => item.id !== record.id),
    }));
    setEditingRecord(null);
    setToast({ text: "紀錄已刪除" });
  }

  function restoreRecord(record: SleepRecord) {
    setData((old) => ({ ...old, records: [...old.records, record] }));
    setToast(null);
  }

  async function restoreBackup(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as AppData;
      if (!Array.isArray(parsed.children) || !Array.isArray(parsed.records)) {
        throw new Error();
      }
      const mergedChildIds = new Set([
        ...data.children.map((child) => child.id),
        ...parsed.children.map((child) => child.id),
      ]);
      if (mergedChildIds.size > MAX_CHILDREN) {
        window.alert(
          `每個家庭最多可建立 ${MAX_CHILDREN} 位孩子。這份備份合併後會有 ${mergedChildIds.size} 位，因此尚未匯入；請先刪除不需要的孩子資料後再試一次。`,
        );
        return;
      }
      const merge = window.confirm(
        "要將這份備份合併到目前資料嗎？相同的孩子與紀錄不會重複加入。",
      );
      if (!merge) return;
      setData((old) => {
        const childMap = new Map(
          [...old.children, ...parsed.children].map((item) => [
            item.id,
            {
              ...item,
              color: item.color || COLORS[0],
            },
          ]),
        );
        const recordMap = new Map(
          [...old.records, ...parsed.records].map((item) => [item.id, item]),
        );
        const children = [...childMap.values()];
        return {
          ...old,
          children,
          records: [...recordMap.values()],
          activeChildId:
            old.activeChildId ||
            parsed.activeChildId ||
            children.find((child) => !child.archived)?.id ||
            children[0]?.id ||
            "",
        };
      });
      setToast({ text: "備份已成功匯入" });
    } catch {
      window.alert("這個檔案不是可用的安睡角落備份檔。");
    } finally {
      event.target.value = "";
    }
  }

  function deleteChild(child: Child) {
    if (data.children.length <= 1) {
      window.alert("至少需要保留一位孩子，無法刪除唯一一位孩子。");
      return;
    }
    const recordCount = data.records.filter(
      (record) => record.childId === child.id,
    ).length;
    if (
      !window.confirm(
        `確定要刪除「${child.name}」嗎？與這位孩子相關的 ${recordCount} 筆紀錄也會一併刪除，且無法復原。`,
      )
    ) {
      return;
    }
    setData((old) => {
      let children = old.children.filter((item) => item.id !== child.id);
      let activeChildId = old.activeChildId;
      if (activeChildId === child.id) {
        const next = children.find((item) => !item.archived) ?? children[0];
        activeChildId = next.id;
        if (next.archived) {
          children = children.map((item) =>
            item.id === next.id ? { ...item, archived: false } : item,
          );
        }
      }
      return {
        ...old,
        children,
        activeChildId,
        records: old.records.filter((record) => record.childId !== child.id),
      };
    });
    setToast({ text: `已刪除 ${child.name} 與相關紀錄` });
  }

  function openAddChild() {
    if (data.children.length >= MAX_CHILDREN) {
      window.alert(`每個家庭最多可建立 ${MAX_CHILDREN} 位孩子。`);
      return;
    }
    setShowChildForm(true);
  }

  function saveNewChild(child: Child) {
    if (data.children.length >= MAX_CHILDREN) {
      window.alert(`每個家庭最多可建立 ${MAX_CHILDREN} 位孩子。`);
      return;
    }
    setData((old) => ({
      ...old,
      children: [...old.children, child],
      activeChildId: child.id,
    }));
    setShowChildForm(false);
    setToast({ text: `已新增 ${child.name}` });
  }

  if (!loaded) return <div className="loading-screen">正在準備安睡角落…</div>;

  if (!data.children.length) {
    return (
      <>
        <Onboarding
          onCreate={(child) => {
            setData({
              ...initialData,
              children: [child],
              activeChildId: child.id,
            });
          }}
          onImport={() => fileInput.current?.click()}
        />
        <input
          ref={fileInput}
          hidden
          type="file"
          accept=".json,application/json"
          onChange={restoreBackup}
        />
      </>
    );
  }

  return (
    <main className="app-shell">
      <div className="desktop-rail">
        <img
          src={`${BASE_PATH}/brand/anshui-logo-horizontal.png`}
          alt="安睡角落"
          className="brand-logo"
        />
        <p>孩子睡眠與情緒觀察工具</p>
        <nav aria-label="主要功能">
          <NavItems tab={tab} onChange={changeTab} />
        </nav>
        <div className="privacy-chip">
          <ShieldCheck size={17} />
          紀錄內容僅留在此瀏覽器
        </div>
      </div>

      <section className="workspace">
        <header className="topbar">
          <div className={tab === "today" ? undefined : "single-page-title"}>
            {tab === "today" && <span className="eyebrow">今日總覽</span>}
            <h1>
              {tab === "today"
                ? "從日常中看見孩子的節奏"
                : tabLabels[tab]}
            </h1>
          </div>
          <div className="child-switcher">
            <span
              className="child-dot"
              style={{ background: activeChild?.color }}
            />
            <div className="child-switcher-copy">
              <select
                aria-label="選擇孩子"
                value={activeChild?.id}
                onChange={(event) =>
                  setData((old) => ({
                    ...old,
                    activeChildId: event.target.value,
                  }))
                }
              >
                {activeChildren.map((child) => (
                  <option key={child.id} value={child.id}>
                    {child.name}
                  </option>
                ))}
              </select>
              <small>{ageLabel(activeChild)}</small>
            </div>
          </div>
        </header>

        {tab === "today" && (
          <TodayView
            activeChild={activeChild}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            moveDate={moveDate}
            isFuture={isFuture}
            dayRecords={dayRecords}
            allRecords={visibleRecords}
            analysis={dayAnalysis}
            addQuick={addQuick}
            saveJournal={saveJournal}
            openForm={setShowRecordForm}
            editRecord={setEditingRecord}
          />
        )}

        {tab === "records" && (
          <RecordsView
            records={visibleRecords}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            search={search}
            setSearch={setSearch}
            filter={filter}
            setFilter={setFilter}
            editRecord={setEditingRecord}
          />
        )}

        {tab === "analysis" && (
          <AnalysisView
            records={visibleRecords}
            child={activeChild}
            days={analysisDays}
            setDays={setAnalysisDays}
          />
        )}

        {tab === "export" && (
          <ExportView
            child={activeChild}
            records={visibleRecords}
            data={data}
            setData={setData}
            importBackup={() => fileInput.current?.click()}
          />
        )}

        {tab === "settings" && (
          <SettingsView
            data={data}
            setData={setData}
            activeChild={activeChild}
            onAddChild={openAddChild}
            onEditChild={setEditingChild}
            onDeleteChild={deleteChild}
          />
        )}
      </section>

      <nav className="bottom-nav" aria-label="主要功能">
        <NavItems tab={tab} onChange={changeTab} />
      </nav>

      <input
        ref={fileInput}
        hidden
        type="file"
        accept=".json,application/json"
        onChange={restoreBackup}
      />

      {showChildForm && (
        <ChildModal
          onClose={() => setShowChildForm(false)}
          onSave={saveNewChild}
        />
      )}

      {editingChild && (
        <ChildModal
          child={editingChild}
          onClose={() => setEditingChild(null)}
          onSave={(child) => {
            setData((old) => ({
              ...old,
              children: old.children.map((item) =>
                item.id === child.id ? child : item,
              ),
            }));
            setEditingChild(null);
            setToast({ text: "孩子資料已更新" });
          }}
        />
      )}

      {(showRecordForm || editingRecord) && activeChild && (
        <RecordModal
          child={activeChild}
          date={selectedDate}
          type={showRecordForm ?? editingRecord!.type}
          record={editingRecord}
          onClose={() => {
            setShowRecordForm(null);
            setEditingRecord(null);
          }}
          onSave={(record) => {
            setData((old) => ({
              ...old,
              records: editingRecord
                ? old.records.map((item) =>
                    item.id === record.id ? record : item,
                  )
                : [...old.records, record],
            }));
            setShowRecordForm(null);
            setEditingRecord(null);
            trackAnonymousEvent("record_complete");
            setToast({ text: editingRecord ? "紀錄已更新" : "紀錄已新增" });
          }}
          onDelete={editingRecord ? deleteRecord : undefined}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          <span>{toast.text}</span>
          {toast.undo && (
            <button
              onClick={() => {
                setData((old) => ({
                  ...old,
                  records: old.records.filter(
                    (record) => record.id !== toast.undo!.id,
                  ),
                }));
                setToast({
                  text: "已復原",
                  undo: undefined,
                });
              }}
            >
              <RotateCcw size={15} /> 復原
            </button>
          )}
        </div>
      )}
    </main>
  );
}

const tabLabels: Record<Tab, string> = {
  today: "今日",
  records: "所有紀錄",
  analysis: "趨勢分析",
  export: "匯出與備份",
  settings: "設定",
};

const navItems: { id: Tab; label: string; Icon: typeof Home }[] = [
  { id: "today", label: "今日", Icon: Home },
  { id: "records", label: "紀錄", Icon: CalendarDays },
  { id: "analysis", label: "分析", Icon: BarChart3 },
  { id: "export", label: "匯出", Icon: FileDown },
  { id: "settings", label: "設定", Icon: Settings },
];

function NavItems({
  tab,
  onChange,
}: {
  tab: Tab;
  onChange: (tab: Tab) => void;
}) {
  return (
    <>
      {navItems.map(({ id, label, Icon }) => (
        <button
          key={id}
          className={tab === id ? "active" : ""}
          onClick={() => onChange(id)}
        >
          <Icon size={20} strokeWidth={1.8} />
          <span>{label}</span>
        </button>
      ))}
    </>
  );
}

function DatePartsInput({
  value,
  onChange,
  ariaLabel,
  allowFuture = false,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  allowFuture?: boolean;
}) {
  const initial = value ? value.split("-") : ["", "", ""];
  const [year, setYear] = useState(initial[0] ?? "");
  const [month, setMonth] = useState(initial[1] ?? "");
  const [day, setDay] = useState(initial[2] ?? "");
  const currentYear = new Date().getFullYear();
  const years = Array.from(
    { length: 15 + (allowFuture ? 2 : 0) },
    (_, index) => currentYear + (allowFuture ? 1 : 0) - index,
  );
  const daysInMonth =
    year && month ? new Date(Number(year), Number(month), 0).getDate() : 31;

  const update = (nextYear: string, nextMonth: string, nextDay: string) => {
    const safeDay =
      nextYear && nextMonth && nextDay
        ? String(
            Math.min(
              Number(nextDay),
              new Date(Number(nextYear), Number(nextMonth), 0).getDate(),
            ),
          ).padStart(2, "0")
        : nextDay;
    setYear(nextYear);
    setMonth(nextMonth);
    setDay(safeDay);
    onChange(
      nextYear && nextMonth && safeDay
        ? `${nextYear}-${nextMonth.padStart(2, "0")}-${safeDay.padStart(2, "0")}`
        : "",
    );
  };

  return (
    <div className="date-parts" role="group" aria-label={ariaLabel}>
      <select
        value={year}
        aria-label={`${ariaLabel}年份`}
        onChange={(event) => update(event.target.value, month, day)}
      >
        <option value="">年份</option>
        {years.map((item) => (
          <option key={item} value={item}>{item} 年</option>
        ))}
      </select>
      <select
        value={month}
        aria-label={`${ariaLabel}月份`}
        onChange={(event) => update(year, event.target.value, day)}
      >
        <option value="">月份</option>
        {Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0")).map((item) => (
          <option key={item} value={item}>{Number(item)} 月</option>
        ))}
      </select>
      <select
        value={day}
        aria-label={`${ariaLabel}日期`}
        onChange={(event) => update(year, month, event.target.value)}
      >
        <option value="">日期</option>
        {Array.from({ length: daysInMonth }, (_, index) => String(index + 1).padStart(2, "0")).map((item) => (
          <option key={item} value={item}>{Number(item)} 日</option>
        ))}
      </select>
    </div>
  );
}

function Onboarding({
  onCreate,
  onImport,
}: {
  onCreate: (child: Child) => void;
  onImport: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [birthday, setBirthday] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [ageMode, setAgeMode] = useState<"chronological" | "corrected">(
    "chronological",
  );
  const [color, setColor] = useState(COLORS[0]);

  return (
    <main className="onboarding">
      <section className="welcome-card">
        <img
          src={`${BASE_PATH}/brand/anshui-logo-horizontal.png`}
          alt="安睡角落"
          className="welcome-logo"
        />
        {step === 1 ? (
          <>
            <div className="welcome-illustration">
              <div className="moon-orb">
                <MoonStar size={54} strokeWidth={1.3} />
              </div>
              <span className="star star-one">✦</span>
              <span className="star star-two">✧</span>
            </div>
            <span className="eyebrow">孩子睡眠與情緒觀察工具</span>
            <h1>把每天的變化，<br />溫柔地記下來</h1>
            <p>
              快速記錄睡眠、情緒與特殊事件，
              <br />
              <span className="tagline-nowrap">陪你從日常中看見孩子的節奏。</span>
            </p>
            <div className="local-note">
              <ShieldCheck size={20} />
              <div>
                <strong>免登入，本機保存</strong>
                <span>資料只儲存在目前裝置的這個瀏覽器中，不會自動上傳。</span>
              </div>
            </div>
            <button className="primary-button" onClick={() => setStep(2)}>
              開始建立紀錄 <ChevronRight size={18} />
            </button>
            <button className="text-button import-existing" onClick={onImport}>
              <Upload size={16} /> 匯入原有備份
            </button>
          </>
        ) : (
          <>
            <span className="eyebrow">第一步</span>
            <h1>先認識第一位孩子</h1>
            <p>之後仍可在首頁加入其他孩子，每位孩子的資料會分開保存。</p>
            <label className="field">
              <span>暱稱或姓名 *</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="例如：小安"
                autoFocus
              />
            </label>
            <label className="field">
              <span>出生日期（選填）</span>
              <DatePartsInput
                value={birthday}
                onChange={setBirthday}
                ariaLabel="出生日期"
              />
            </label>
            <label className="field">
              <span>預產期（選填）</span>
              <DatePartsInput
                value={dueDate}
                onChange={(value) => {
                  setDueDate(value);
                  if (!value) setAgeMode("chronological");
                }}
                ariaLabel="預產期"
                allowFuture
              />
            </label>
            <label className="field">
              <span>年齡顯示方式</span>
              <select
                value={ageMode}
                onChange={(event) =>
                  setAgeMode(
                    event.target.value as "chronological" | "corrected",
                  )
                }
              >
                <option value="chronological">依出生日期（實際年齡）</option>
                <option value="corrected" disabled={!dueDate}>
                  依預產期（矯正年齡）
                </option>
              </select>
            </label>
            <fieldset className="color-picker">
              <legend>識別顏色</legend>
              <div>
                {COLORS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-label={`選擇顏色 ${item}`}
                    className={color === item ? "selected" : ""}
                    style={{ background: item }}
                    onClick={() => setColor(item)}
                  />
                ))}
              </div>
            </fieldset>
            <button
              className="primary-button"
              disabled={!name.trim()}
              onClick={() =>
                onCreate({
                  id: uid(),
                  name: name.trim(),
                  birthday: birthday || undefined,
                  dueDate: dueDate || undefined,
                  ageMode: dueDate ? ageMode : "chronological",
                  color,
                })
              }
            >
              進入今日紀錄 <ChevronRight size={18} />
            </button>
            <button className="text-button" onClick={() => setStep(1)}>
              返回說明
            </button>
          </>
        )}
      </section>
    </main>
  );
}

function TodayView({
  activeChild,
  selectedDate,
  setSelectedDate,
  moveDate,
  isFuture,
  dayRecords,
  allRecords,
  analysis,
  addQuick,
  saveJournal,
  openForm,
  editRecord,
}: {
  activeChild?: Child;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  moveDate: (delta: number) => void;
  isFuture: boolean;
  dayRecords: SleepRecord[];
  allRecords: SleepRecord[];
  analysis: ReturnType<typeof analyze>;
  addQuick: (type: "bed" | "sleep" | "wake") => void;
  saveJournal: (type: "gratitude" | "success", detail: string) => void;
  openForm: (type: RecordType) => void;
  editRecord: (record: SleepRecord) => void;
}) {
  return (
    <div className="view-stack">
      <section className="date-strip">
        <button aria-label="前一天" onClick={() => moveDate(-1)}>
          <ChevronLeft size={20} />
        </button>
        <label>
          <CalendarDays size={18} />
          <span>{dateLabel(selectedDate)}</span>
          <input
            type="date"
            aria-label="選擇日期"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
          />
        </label>
        <button aria-label="後一天" onClick={() => moveDate(1)}>
          <ChevronRight size={20} />
        </button>
        {selectedDate !== localDateKey() && (
          <button className="today-link" onClick={() => setSelectedDate(localDateKey())}>
            今天
          </button>
        )}
      </section>

      <section className="summary-grid">
        <article className="summary-card featured">
          <div className="summary-icon"><MoonStar size={22} /></div>
          <div>
            <span>總睡眠時數</span>
            <strong>{minutesLabel(analysis.totalSleep)}</strong>
          </div>
        </article>
        <article className="summary-card">
          <span>平均入睡時間</span>
          <strong>{analysis.latency ? minutesLabel(analysis.latency) : "尚無資料"}</strong>
        </article>
        <article className="summary-card">
          <span>其他紀錄</span>
          <strong>{dayRecords.filter((r) => !["bed", "sleep", "wake"].includes(r.type)).length} 筆</strong>
          <small>情緒、事件、備註與日記</small>
        </article>
      </section>

      <section className="quick-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">{activeChild?.name}的紀錄</span>
            <h2>{isFuture ? "未來日期僅供瀏覽" : "現在發生了什麼？"}</h2>
          </div>
          <p>
            {isFuture ? (
              "請切換到今天或過去日期新增紀錄。"
            ) : (
              <>
                前三項點一下
                <br />
                就會記錄時間
              </>
            )}
          </p>
        </div>
        <div className="quick-grid">
          {(["bed", "sleep", "wake", "emotion", "event", "note"] as RecordType[]).map((type) => {
            const { Icon, label, color } = recordMeta[type];
            const isInstant = ["bed", "sleep", "wake"].includes(type);
            return (
              <button
                key={type}
                disabled={isFuture}
                style={{ "--action-color": color } as React.CSSProperties}
                onClick={() =>
                  isInstant
                    ? addQuick(type as "bed" | "sleep" | "wake")
                    : openForm(type)
                }
              >
                <span className="action-icon"><Icon size={25} strokeWidth={1.7} /></span>
                <strong>{label}</strong>
                <small>{isInstant ? "快速記錄" : "補充觀察"}</small>
              </button>
            );
          })}
        </div>
      </section>

      <Timeline
        records={dayRecords}
        sleepSegments={pairSleepSegments(allRecords)}
        latencySegments={pairSleepLatencySegments(allRecords)}
        editRecord={editRecord}
      />

      <DailyJournal
        records={dayRecords}
        disabled={isFuture}
        onSave={saveJournal}
      />
    </div>
  );
}

function DailyJournal({
  records,
  disabled,
  onSave,
}: {
  records: SleepRecord[];
  disabled: boolean;
  onSave: (type: "gratitude" | "success", detail: string) => void;
}) {
  const gratitude = records.find((record) => record.type === "gratitude")?.detail ?? "";
  const success = records.find((record) => record.type === "success")?.detail ?? "";
  const [gratitudeText, setGratitudeText] = useState(gratitude);
  const [successText, setSuccessText] = useState(success);

  useEffect(() => setGratitudeText(gratitude), [gratitude]);
  useEffect(() => setSuccessText(success), [success]);

  return (
    <section className="journal-section">
      <div className="section-heading compact">
        <div>
          <span className="eyebrow">照顧者的小小回顧</span>
          <h2>感恩與成功日記</h2>
        </div>
        <p>記下孩子，也記得看見自己</p>
      </div>
      <div className="journal-grid">
        <label>
          <span><Heart size={17} /> 感恩日記</span>
          <div className="counted-textarea">
            <textarea
              value={gratitudeText}
              disabled={disabled}
              maxLength={MULTILINE_TEXT_LIMIT}
              onChange={(event) => setGratitudeText(event.target.value)}
              placeholder="例如：孩子今天自己在嬰兒床裡睡著了！"
              rows={3}
            />
            <span className="character-count" aria-hidden="true">
              {gratitudeText.length}/{MULTILINE_TEXT_LIMIT}
            </span>
          </div>
          <button
            type="button"
            disabled={disabled || gratitudeText === gratitude}
            onClick={() => onSave("gratitude", gratitudeText)}
          >
            儲存感恩日記
          </button>
        </label>
        <label>
          <span><Trophy size={17} /> 成功日記</span>
          <div className="counted-textarea">
            <textarea
              value={successText}
              disabled={disabled}
              maxLength={MULTILINE_TEXT_LIMIT}
              onChange={(event) => setSuccessText(event.target.value)}
              placeholder="例如：孩子發脾氣時，我保持穩定沒有慌張。"
              rows={3}
            />
            <span className="character-count" aria-hidden="true">
              {successText.length}/{MULTILINE_TEXT_LIMIT}
            </span>
          </div>
          <button
            type="button"
            disabled={disabled || successText === success}
            onClick={() => onSave("success", successText)}
          >
            儲存成功日記
          </button>
        </label>
      </div>
    </section>
  );
}

function Timeline({
  records,
  sleepSegments,
  latencySegments,
  editRecord,
}: {
  records: SleepRecord[];
  sleepSegments: SleepSegment[];
  latencySegments: SleepLatencySegment[];
  editRecord: (record: SleepRecord) => void;
}) {
  const segmentBySleepId = new Map(
    sleepSegments.map((segment) => [segment.sleepId, segment]),
  );
  const latencyByBedId = new Map(
    latencySegments.map((segment) => [segment.bedId, segment]),
  );
  return (
    <section className="timeline-section">
      <div className="section-heading compact">
        <div>
          <span className="eyebrow">依時間排列</span>
          <h2>當日時間軸</h2>
        </div>
        <span className="record-count">{records.length} 筆紀錄</span>
      </div>
      {records.length ? (
        <div className="timeline">
          {records.map((record) => {
            const { Icon, label, color } = recordMeta[record.type];
            const emotions = recordEmotionTags(record);
            const sleepSegment = segmentBySleepId.get(record.id);
            const latencySegment = latencyByBedId.get(record.id);
            return (
              <div className="timeline-entry" key={record.id}>
                <button
                  className="timeline-row"
                  onClick={() => editRecord(record)}
                >
                  <time>{timeLabel(record.at)}</time>
                  <span className="timeline-mark" style={{ background: color }}>
                    <Icon size={17} />
                  </span>
                  <span className="timeline-copy">
                    <strong>{record.title || label}</strong>
                    {(record.detail || record.response || record.duration || record.tags?.length || record.emotionTags?.length) && (
                      <small>
                        {[
                          record.tags?.length ? record.tags.join("、") : undefined,
                          record.emotionTags?.length ? `情緒：${record.emotionTags.join("、")}` : undefined,
                          record.duration ? `持續 ${minutesLabel(record.duration)}` : undefined,
                          record.detail,
                          record.response,
                        ]
                          .filter(Boolean)
                          .join("｜")}
                      </small>
                    )}
                  </span>
                  <span className="timeline-badges">
                    {emotions.length > 0 && (
                      <span
                        className="emotion-badge emotion-emoji-badge"
                        title={`情緒／行為：${emotions.join("、")}`}
                        aria-label={`情緒／行為：${emotions.join("、")}`}
                      >
                        {emotions.slice(0, 3).map((emotion) => emotionEmoji(emotion)).join("")}
                        {emotions.length > 3 ? "…" : ""}
                      </span>
                    )}
                    {record.intensity && <span className="intensity">程度 {record.intensity}</span>}
                    {record.duration ? (
                      <span className="duration-badge">持續 {minutesLabel(record.duration)}</span>
                    ) : null}
                  </span>
                  <Pencil size={15} className="edit-icon" />
                </button>
                {latencySegment && (
                  <div
                    className="sleep-segment latency-segment"
                    aria-label={`入睡時間 ${minutesLabel(latencySegment.duration)}`}
                  >
                    <span />
                    <i />
                    <strong>
                      入睡時間 {minutesLabel(latencySegment.duration)}
                      <small>
                        {timeLabel(latencySegment.start)}－{timeLabel(latencySegment.end)}
                      </small>
                    </strong>
                  </div>
                )}
                {sleepSegment && (
                  <div className="sleep-segment" aria-label={`睡眠區段 ${minutesLabel(sleepSegment.duration)}`}>
                    <span />
                    <i />
                    <strong>
                      睡眠 {minutesLabel(sleepSegment.duration)}
                      <small>
                        {timeLabel(sleepSegment.start)}－{timeLabel(sleepSegment.end)}
                      </small>
                    </strong>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          <div><MoonStar size={29} /></div>
          <strong>今天還沒有紀錄</strong>
          <p>從上方選一個按鈕，記下第一個時刻。</p>
        </div>
      )}
    </section>
  );
}

function RecordsView({
  records,
  selectedDate,
  setSelectedDate,
  search,
  setSearch,
  filter,
  setFilter,
  editRecord,
}: {
  records: SleepRecord[];
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  search: string;
  setSearch: (value: string) => void;
  filter: RecordType | "all";
  setFilter: (value: RecordType | "all") => void;
  editRecord: (record: SleepRecord) => void;
}) {
  const filtered = records
    .filter(
      (record) => localDateKey(new Date(record.at)) === selectedDate,
    )
    .filter((record) => filter === "all" || record.type === filter)
    .filter((record) =>
      `${record.title} ${record.detail} ${record.response} ${record.tags?.join(" ")} ${record.emotionTags?.join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .sort((a, b) => +new Date(b.at) - +new Date(a.at));

  return (
    <div className="view-stack">
      <section className="toolbar-card">
        <label className="search-box">
          <Search size={18} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜尋備註、情緒或事件"
          />
        </label>
        <label className="date-input">
          <CalendarDays size={18} />
          <input
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
          />
        </label>
      </section>
      <div className="filter-chips">
        <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>全部</button>
        {(Object.keys(recordMeta) as RecordType[]).map((type) => (
          <button
            key={type}
            className={filter === type ? "active" : ""}
            onClick={() => setFilter(type)}
          >
            {recordMeta[type].short}
          </button>
        ))}
      </div>
      <section className="record-list">
        <div className="section-heading compact">
          <h2>當日紀錄</h2>
          <span className="record-count">{filtered.length} 筆</span>
        </div>
        {filtered.length ? (
          filtered.map((record) => (
            <button className="record-card" key={record.id} onClick={() => editRecord(record)}>
              <span
                className="record-icon"
                style={{ background: `${recordMeta[record.type].color}18`, color: recordMeta[record.type].color }}
              >
                {(() => {
                  const Icon = recordMeta[record.type].Icon;
                  return <Icon size={20} />;
                })()}
              </span>
              <span>
                <strong>{record.title || recordMeta[record.type].label}</strong>
                <small>
                  {new Intl.DateTimeFormat("zh-TW", {
                    month: "numeric",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  }).format(new Date(record.at))}
                </small>
                {record.detail && <p>{record.detail}</p>}
              </span>
              <ChevronRight size={17} />
            </button>
          ))
        ) : (
          <div className="empty-state"><strong>找不到符合的紀錄</strong><p>請調整篩選條件或搜尋文字。</p></div>
        )}
      </section>
    </div>
  );
}

function AnalysisView({
  records,
  child,
  days,
  setDays,
}: {
  records: SleepRecord[];
  child?: Child;
  days: number;
  setDays: (days: number) => void;
}) {
  const presetStart = (rangeDays: number) => {
    const date = new Date();
    date.setDate(date.getDate() - rangeDays + 1);
    return localDateKey(date);
  };
  const [start, setStart] = useState(() => presetStart(days));
  const [end, setEnd] = useState(localDateKey());
  const [customRange, setCustomRange] = useState(false);
  const [weekStart, setWeekStart] = useState(() => presetStart(7));
  const [selectedEmotion, setSelectedEmotion] = useState("全部");
  const dates = daysBetween(start, end);
  const dateCount = dates.length;
  const sleepSegments = pairSleepSegments(records);
  const daily = dates.map((date) => {
    const items = records.filter((record) => localDateKey(new Date(record.at)) === date);
    const timelineSegments = segmentsForDate(sleepSegments, date);
    return {
      date,
      analysis: analyze(items),
      timelineSegments,
      totalSleep: timelineSegments.reduce(
        (sum, segment) => sum + segment.duration,
        0,
      ),
      emotions: items.reduce(
        (sum, item) => sum + (item.type === "emotion" ? 1 : item.emotionTags?.length ? 1 : 0),
        0,
      ),
      events: items.filter((item) => item.type === "event"),
    };
  });
  const latestWeekStart = dateCount > 7 ? shiftDateKey(end, -6) : start;
  const safeWeekStart =
    weekStart < start
      ? start
      : weekStart > latestWeekStart
        ? latestWeekStart
        : weekStart;
  const weekEnd =
    shiftDateKey(safeWeekStart, 6) > end
      ? end
      : shiftDateKey(safeWeekStart, 6);
  const shownDaily = daily.filter(
    (item) => item.date >= safeWeekStart && item.date <= weekEnd,
  );
  const maxSleep = Math.max(
    ...shownDaily.map((item) => item.totalSleep),
    1,
  );
  const total = daily.reduce((sum, item) => sum + item.totalSleep, 0);
  const daysWithSleep = daily.filter((item) => item.totalSleep > 0).length;
  const average = daysWithSleep ? total / daysWithSleep : 0;
  const emotions = daily.reduce((sum, item) => sum + item.emotions, 0);
  const periodRecords = records.filter((record) => {
    const date = localDateKey(new Date(record.at));
    return date >= dates[0] && date <= dates[dates.length - 1];
  });
  const emotionRecords = periodRecords.filter(
    (record) =>
      record.type === "emotion" || (record.emotionTags?.length ?? 0) > 0,
  );
  const emotionCounts = emotionRecords.reduce<Record<string, number>>(
    (counts, record) => {
      const tags = recordEmotionTags(record);
      (tags.length ? tags : ["未分類"]).forEach((tag) => {
        counts[tag] = (counts[tag] ?? 0) + 1;
      });
      return counts;
    },
    {},
  );
  const emotionRanking = Object.entries(emotionCounts).sort(
    (a, b) => b[1] - a[1],
  );
  const maxEmotionCount = Math.max(...emotionRanking.map(([, count]) => count), 1);
  const shownEmotionFrequency = shownDaily.map((item) => {
    if (selectedEmotion === "全部") return item.emotions;
    return records.filter((record) => {
      const sameDate = localDateKey(new Date(record.at)) === item.date;
      return sameDate && recordEmotionTags(record).includes(selectedEmotion);
    }).length;
  });
  const maxDailyEmotionCount = Math.max(...shownEmotionFrequency, 1);
  const intensityCounts = emotionRecords.reduce(
    (counts, record) => {
      const key = record.intensity ? String(record.intensity) : "none";
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    },
    {} as Record<string, number>,
  );
  const periodEvents = daily
    .flatMap((item) => item.events)
    .sort((a, b) => +new Date(a.at) - +new Date(b.at));
  const recommendation = sleepRecommendation(child);
  const averageStatus = sleepRangeStatus(average, recommendation);

  const selectPreset = (value: number) => {
    const nextStart = presetStart(value);
    const nextEnd = localDateKey();
    setDays(value);
    setStart(nextStart);
    setEnd(nextEnd);
    setWeekStart(value > 7 ? shiftDateKey(nextEnd, -6) : nextStart);
    setCustomRange(false);
  };

  const chooseWeekByDate = (dateKey: string) => {
    if (!dateKey) return;
    const rangeStartDate = new Date(`${start}T12:00:00`);
    const chosenDate = new Date(`${dateKey}T12:00:00`);
    const offset = Math.max(
      0,
      Math.floor((+chosenDate - +rangeStartDate) / 86400000),
    );
    const candidate = shiftDateKey(start, Math.floor(offset / 7) * 7);
    setWeekStart(candidate > latestWeekStart ? latestWeekStart : candidate);
  };

  return (
    <div className="view-stack">
      <div className="period-tabs">
        {[7, 14, 21, 30].map((value) => (
          <button
            className={!customRange && days === value ? "active" : ""}
            key={value}
            onClick={() => selectPreset(value)}
          >
            最近 {value} 天
          </button>
        ))}
      </div>
      <section className="analysis-range">
        <strong>自訂分析日期</strong>
        <div className="range-fields">
          <label>
            <span>開始日期</span>
            <input
              type="date"
              value={start}
              max={end}
              onChange={(event) => {
                setStart(event.target.value);
                setWeekStart(event.target.value);
                setCustomRange(true);
              }}
            />
          </label>
          <span>至</span>
          <label>
            <span>結束日期</span>
            <input
              type="date"
              value={end}
              min={start}
              max={localDateKey()}
              onChange={(event) => {
                setEnd(event.target.value);
                setWeekStart(
                  daysBetween(start, event.target.value).length > 7
                    ? shiftDateKey(event.target.value, -6)
                    : start,
                );
                setCustomRange(true);
              }}
            />
          </label>
        </div>
        <small>目前分析 {dateCount} 天；每日圖表固定以 7 天為一週顯示。</small>
      </section>
      <section className="analysis-overview">
        <article>
          <span>平均每日睡眠</span>
          <strong>{minutesLabel(average)}</strong>
          <small>依完整「入睡 → 起床」區段計算</small>
        </article>
        <article>
          <span>情緒／行為紀錄</span>
          <strong>{emotions} 筆</strong>
          <small>僅呈現紀錄，不推斷因果</small>
        </article>
        <article>
          <span>平均入睡時間</span>
          <strong>{averageClockLabel(periodRecords)}</strong>
          <small>依期間內所有「入睡」紀錄計算</small>
        </article>
      </section>
      <nav className="week-navigator" aria-label="選擇圖表顯示週">
        <button
          type="button"
          aria-label="上一週"
          disabled={safeWeekStart <= start}
          onClick={() =>
            setWeekStart(
              shiftDateKey(safeWeekStart, -7) < start
                ? start
                : shiftDateKey(safeWeekStart, -7),
            )
          }
        >
          <ChevronLeft size={18} />
        </button>
        <label>
          <span>圖表顯示週</span>
          <strong>
            {safeWeekStart.slice(5).replace("-", "/")}－
            {weekEnd.slice(5).replace("-", "/")}
          </strong>
          <input
            type="date"
            min={start}
            max={end}
            value={safeWeekStart}
            onChange={(event) => chooseWeekByDate(event.target.value)}
            aria-label="選擇要顯示的週"
          />
        </label>
        <button
          type="button"
          aria-label="下一週"
          disabled={safeWeekStart >= latestWeekStart}
          onClick={() =>
            setWeekStart(
              shiftDateKey(safeWeekStart, 7) > latestWeekStart
                ? latestWeekStart
                : shiftDateKey(safeWeekStart, 7),
            )
          }
        >
          <ChevronRight size={18} />
        </button>
      </nav>
      <section className="chart-card">
        <div className="section-heading compact">
          <div>
            <span className="eyebrow">睡眠趨勢</span>
            <h2>每日總睡眠時數</h2>
          </div>
          {recommendation ? (
            <p className="recommendation-note">
              <span>{recommendation.label}建議：</span>
              <span>每日 {recommendation.recommendedMin}－{recommendation.recommendedMax} 小時</span>
            </p>
          ) : (
            <p>{child?.birthday ? "目前年齡超出 0－12 歲參考範圍" : "設定出生日期後可顯示年齡參考"}</p>
          )}
        </div>
        <div className="bar-chart" aria-label="每日總睡眠時數圖表">
          {shownDaily.map((item) => (
            <div
              className="bar-column"
              key={item.date}
            >
              <span
                className="bar-value"
                title={item.totalSleep ? minutesLabel(item.totalSleep) : undefined}
              >
                {compactMinutesLabel(item.totalSleep)}
              </span>
              <div className="bar-track">
                <div style={{ height: `${Math.max(3, (item.totalSleep / maxSleep) * 100)}%` }} />
              </div>
              <small>{item.date.slice(5).replace("-", "/")}</small>
              {sleepRangeStatus(item.totalSleep, recommendation) ? (
                <span className={`daily-range-status ${sleepRangeStatus(item.totalSleep, recommendation)!.tone}`}>
                  {sleepRangeStatus(item.totalSleep, recommendation)!.icon}
                  {sleepRangeStatus(item.totalSleep, recommendation)!.label}
                </span>
              ) : (
                <span className="daily-range-status empty">—</span>
              )}
            </div>
          ))}
        </div>
        <div className="sleep-guidance">
          {averageStatus ? (
            <div className={`range-result ${averageStatus.tone}`}>
              <span>{averageStatus.icon}</span>
              <div>
                <small>依有完整紀錄日期的平均</small>
                <strong>{averageStatus.label}</strong>
              </div>
            </div>
          ) : (
            <div className="range-result neutral">
              <Info size={18} />
              <span>{recommendation ? "完整睡眠區段不足，暫不判定" : "補上出生日期後才會顯示參考判定"}</span>
            </div>
          )}
          <p>
            睡眠時數需要長期觀察，也要搭配孩子的生長曲線、白天精神與整體情緒判斷；如有疑慮，請和醫師討論。
          </p>
          <details>
            <summary>查看各年齡層建議的總睡眠時數</summary>
            <div className="recommendation-table">
              {sleepRecommendations.map((item) => (
                <div key={item.label}>
                  <strong>{item.label}</strong>
                  <span>
                    建議 {item.recommendedMin}－{item.recommendedMax} 小時｜可接受 {item.acceptableMin}－{item.acceptableMax} 小時
                  </span>
                </div>
              ))}
            </div>
            <div className="understand-range">
              <strong>如何理解這個範圍</strong>
              <p>
                這是健康兒童在 24 小時內的規律睡眠參考區間，不是每一天都必須達成的硬性標準。先觀察至少一至兩週的趨勢，再一起看孩子白天是否有精神、情緒是否穩定，以及生長與健康狀況。
              </p>
              <small>參考：美國國家睡眠基金會（National Sleep Foundation）；「可接受」代表可能適合部分孩子，不等同每位孩子都建議採用。</small>
            </div>
          </details>
        </div>
      </section>
      <section className="chart-card">
        <div className="section-heading compact">
          <div>
            <span className="eyebrow">睡眠規律</span>
            <h2>每日睡眠時間軸</h2>
          </div>
          <p>色塊代表睡眠區段</p>
        </div>
        <div className="sleep-pattern-scroller">
          <div
            className="sleep-pattern-chart"
            style={{
              "--pattern-days": shownDaily.length,
              "--pattern-total-days": shownDaily.length,
            } as React.CSSProperties}
          >
            <div className="sleep-pattern-axis" aria-hidden="true">
              {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((hour) => (
                <span key={hour} style={{ top: `${(hour / 24) * 100}%` }}>
                  {String(hour).padStart(2, "0")}
                </span>
              ))}
            </div>
            <div className="sleep-pattern-columns">
              {shownDaily.map((item) => (
                <div className="sleep-pattern-day" key={item.date}>
                  <div className="sleep-pattern-track">
                    {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((hour) => (
                      <i
                        key={hour}
                        style={{ top: `${(hour / 24) * 100}%` }}
                      />
                    ))}
                    {item.timelineSegments.map((segment) => (
                      <span
                        key={`${segment.sleepId}-${segment.clippedStart.toISOString()}`}
                        title={`${timeLabel(segment.clippedStart)}－${timeLabel(segment.clippedEnd)}（${minutesLabel(segment.duration)}）`}
                        style={{
                          top: `${(segment.startMinute / 1440) * 100}%`,
                          height: `${Math.max(0.7, (segment.duration / 1440) * 100)}%`,
                        }}
                      />
                    ))}
                  </div>
                  <time>{item.date.slice(5).replace("-", "/")}</time>
                  <small>{item.totalSleep ? minutesLabel(item.totalSleep) : "無完整區段"}</small>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="chart-card">
        <div className="section-heading compact">
          <div>
            <span className="eyebrow">情緒觀察</span>
            <h2>情緒／行為統計</h2>
          </div>
          <span className="record-count">{emotionRecords.length} 筆紀錄</span>
        </div>
        <div className="emotion-frequency">
          <div className="emotion-frequency-heading">
            <div>
              <h3>每日紀錄頻率</h3>
              <span>{selectedEmotion === "全部" ? "全部情緒／行為" : `${emotionEmoji(selectedEmotion)} ${selectedEmotion}`}</span>
            </div>
            <small>
              {safeWeekStart.slice(5).replace("-", "/")}－
              {weekEnd.slice(5).replace("-", "/")}
            </small>
          </div>
          <div
            className="emotion-frequency-chart"
            aria-label={`每日情緒或行為紀錄頻率，${safeWeekStart} 至 ${weekEnd}`}
          >
            {shownDaily.map((item, index) => (
              <div className="emotion-frequency-day" key={item.date}>
                <strong>{shownEmotionFrequency[index]}</strong>
                <span className="emotion-frequency-track">
                  <i
                    style={{
                      height: `${Math.max(
                        shownEmotionFrequency[index] ? 12 : 2,
                        (shownEmotionFrequency[index] / maxDailyEmotionCount) * 100,
                      )}%`,
                    }}
                  />
                </span>
                <time>{item.date.slice(5).replace("-", "/")}</time>
              </div>
            ))}
          </div>
        </div>
        {emotionRanking.length ? (
          <div className="emotion-summary-grid">
            <div className="emotion-ranking">
              <h3>情緒／行為類型</h3>
              <button
                type="button"
                className={`emotion-filter-button all ${selectedEmotion === "全部" ? "selected" : ""}`}
                onClick={() => setSelectedEmotion("全部")}
                aria-pressed={selectedEmotion === "全部"}
              >
                <span>全部</span>
                <strong>{emotionRecords.length}</strong>
              </button>
              {emotionRanking.map(([label, count]) => (
                <button
                  type="button"
                  className={`emotion-stat emotion-filter-button ${selectedEmotion === label ? "selected" : ""}`}
                  key={label}
                  onClick={() => setSelectedEmotion(label)}
                  aria-pressed={selectedEmotion === label}
                >
                  <span>{emotionEmoji(label)} {label}</span>
                  <i>
                    <b style={{ width: `${(count / maxEmotionCount) * 100}%` }} />
                  </i>
                  <strong>{count}</strong>
                </button>
              ))}
            </div>
            <div className="intensity-summary">
              <h3>表現程度分布</h3>
              {[
                ["未選擇", "none"],
                ["1 輕微", "1"],
                ["2 明顯", "2"],
                ["3 強烈", "3"],
              ].map(([label, key]) => (
                <span key={key}>
                  <strong>{intensityCounts[key] ?? 0}</strong>
                  <small>{label}</small>
                </span>
              ))}
            </div>
          </div>
        ) : (
          <p className="muted">此期間尚無情緒／行為紀錄。</p>
        )}
        <p className="emotion-score-note">
          這裡的分數不是評價孩子「乖不乖」，只是協助家長用較客觀一致的方式描述情緒反應。建議家長連續紀錄 7～14 天，先觀察趨勢，不需要因為單一天的狀況下結論。
        </p>
      </section>
      <section className="event-summary">
        <div className="section-heading compact"><h2>期間特殊事件</h2></div>
        {periodEvents.length ? (
          <div className="event-list">
            {periodEvents.map((event) => (
              <article key={event.id}>
                <time>{eventRangeLabel(event)}</time>
                <strong>{event.tags?.join("、") || event.title || "特殊事件"}</strong>
                {event.title && event.tags?.length ? <small>{event.title}</small> : null}
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">此期間尚無特殊事件紀錄。</p>
        )}
      </section>
    </div>
  );
}

function ExportView({
  child,
  records,
  data,
  setData,
  importBackup,
}: {
  child?: Child;
  records: SleepRecord[];
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  importBackup: () => void;
}) {
  const endDefault = localDateKey();
  const startDefaultDate = new Date();
  startDefaultDate.setDate(startDefaultDate.getDate() - 6);
  const [start, setStart] = useState(localDateKey(startDefaultDate));
  const [end, setEnd] = useState(endDefault);
  const [busy, setBusy] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [reportContent, setReportContent] = useState<"records" | "analysis" | "both">("both");
  const [analysisCharts, setAnalysisCharts] = useState({
    totalSleep: true,
    sleepPattern: true,
    emotions: true,
    events: true,
  });

  const ranged = records.filter((record) => {
    const day = localDateKey(new Date(record.at));
    return day >= start && day <= end;
  });
  const rangedEmotionOptions = Array.from(
    new Set(ranged.flatMap((record) => recordEmotionTags(record))),
  ).sort();
  const [pdfEmotionFilter, setPdfEmotionFilter] = useState("全部");

  function downloadBlob(content: BlobPart, filename: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    trackAnonymousEvent("data_export");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  function exportCsv() {
    const header = ["日期時間", "結束日期時間", "孩子", "紀錄類型", "狀況／內容", "表現程度", "持續時間(分鐘)", "家長回應", "標籤", "情緒／行為"];
    const rows = ranged.map((record) => [
      new Date(record.at).toLocaleString("zh-TW", { hour12: false }),
      record.endAt ? new Date(record.endAt).toLocaleString("zh-TW", { hour12: false }) : "",
      child?.name ?? "",
      recordMeta[record.type].label,
      record.title || record.detail || "",
      record.intensity ?? "",
      record.duration ?? "",
      record.response ?? "",
      record.tags?.join("、") ?? "",
      record.emotionTags?.join("、") ?? "",
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    downloadBlob(`\uFEFF${csv}`, `${child?.name}_觀察紀錄_${start}至${end}.csv`, "text/csv;charset=utf-8");
  }

  function exportPdf() {
    if (!child) return;
    setBusy(true);
    setPdfError("");
    try {
      const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
      const pageWidth = 1240;
      const pageHeight = 1754;
      const includeAnalysis = reportContent !== "records";
      const includeRecords = reportContent !== "analysis";
      const rangedSegments = pairSleepSegments(records).filter(
        (segment) =>
          localDateKey(segment.end) >= start &&
          localDateKey(segment.start) <= end,
      );
      let hasPage = false;
      const addCanvasPage = (canvas: HTMLCanvasElement) => {
        if (hasPage) pdf.addPage();
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, 210, 297);
        hasPage = true;
      };
      const drawHeader = (
        ctx: CanvasRenderingContext2D,
        subtitle: string,
      ) => {
        ctx.fillStyle = "#FFFDF9";
        ctx.fillRect(0, 0, pageWidth, pageHeight);
        ctx.fillStyle = "#704E42";
        ctx.font = "700 42px Arial, sans-serif";
        ctx.fillText("安睡角落｜孩子睡眠與情緒觀察報告", 74, 90);
        ctx.font = "700 54px Arial, sans-serif";
        ctx.fillStyle = "#332B27";
        ctx.fillText(`${child.name}｜${subtitle}`, 74, 170);
        ctx.font = "28px Arial, sans-serif";
        ctx.fillStyle = "#746A64";
        ctx.fillText(`紀錄期間：${start} 至 ${end}　｜　產生日期：${localDateKey()}`, 74, 220);
        ctx.strokeStyle = "#E7DDD5";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(74, 260);
        ctx.lineTo(pageWidth - 74, 260);
        ctx.stroke();
      };

      if (includeAnalysis) {
        const rangeDates = daysBetween(start, end);
        const daily = rangeDates.map((date) => ({
          date,
          segments: segmentsForDate(rangedSegments, date),
          value: segmentsForDate(rangedSegments, date).reduce(
            (sum, segment) => sum + segment.duration,
            0,
          ),
        }));
        const maxValue = Math.max(...daily.map((item) => item.value), 1);
        const daysWithSleep = daily.filter((item) => item.value > 0);
        const averageSleep = daysWithSleep.length
          ? daily.reduce((sum, item) => sum + item.value, 0) / daysWithSleep.length
          : 0;
        const drawSummaryCards = (ctx: CanvasRenderingContext2D) => {
          ctx.fillStyle = "#F4E7E1";
          ctx.fillRect(74, 310, 500, 170);
          ctx.fillStyle = "#776D67";
          ctx.font = "26px Arial, sans-serif";
          ctx.fillText("平均每日睡眠", 110, 360);
          ctx.fillStyle = "#332B27";
          ctx.font = "700 52px Arial, sans-serif";
          ctx.fillText(minutesLabel(averageSleep), 110, 430);
          ctx.fillStyle = "#E7F0EB";
          ctx.fillRect(598, 310, 568, 170);
          ctx.fillStyle = "#776D67";
          ctx.font = "26px Arial, sans-serif";
          ctx.fillText("平均入睡時間", 634, 360);
          ctx.fillStyle = "#332B27";
          ctx.font = "700 52px Arial, sans-serif";
          ctx.fillText(averageClockLabel(ranged), 634, 430);
        };
        let summaryPlaced = false;
        if (analysisCharts.totalSleep) {
          const canvas = document.createElement("canvas");
          canvas.width = pageWidth;
          canvas.height = pageHeight;
          const ctx = canvas.getContext("2d")!;
          drawHeader(ctx, "分析圖");
          drawSummaryCards(ctx);
          summaryPlaced = true;
          ctx.fillStyle = "#332B27";
          ctx.font = "700 34px Arial, sans-serif";
          ctx.fillText("每日總睡眠時數", 74, 560);
          const chartTop = 625;
          const chartHeight = 640;
          const barWidth = Math.max(8, Math.min(42, 960 / Math.max(daily.length, 1) - 8));
          const step = 1030 / Math.max(daily.length, 1);
          daily.forEach((item, index) => {
            const x = 85 + index * step;
            const height = Math.max(3, (item.value / maxValue) * chartHeight);
            ctx.fillStyle = "#EBDDD5";
            ctx.fillRect(x, chartTop, barWidth, chartHeight);
            ctx.fillStyle = "#C77F67";
            ctx.fillRect(x, chartTop + chartHeight - height, barWidth, height);
            if (daily.length <= 14 || index % Math.ceil(daily.length / 10) === 0) {
              ctx.save();
              ctx.translate(x + barWidth / 2, chartTop + chartHeight + 32);
              ctx.rotate(-0.55);
              ctx.fillStyle = "#746A64";
              ctx.font = "20px Arial, sans-serif";
              ctx.fillText(item.date.slice(5).replace("-", "/"), 0, 0);
              ctx.restore();
            }
          });
          addCanvasPage(canvas);
        }

        if (analysisCharts.sleepPattern) {
          for (let offset = 0; offset < daily.length; offset += 14) {
            const patternCanvas = document.createElement("canvas");
            patternCanvas.width = pageWidth;
            patternCanvas.height = pageHeight;
            const patternCtx = patternCanvas.getContext("2d")!;
            const shown = daily.slice(offset, offset + 14);
            drawHeader(
              patternCtx,
              daily.length > 14
                ? `每日睡眠時間軸（${offset + 1}－${offset + shown.length} 天）`
                : "每日睡眠時間軸",
            );
            const isFirstAnalysisPage = !summaryPlaced && offset === 0;
            if (isFirstAnalysisPage) {
              drawSummaryCards(patternCtx);
              summaryPlaced = true;
            }
            patternCtx.fillStyle = "#332B27";
            patternCtx.font = "700 34px Arial, sans-serif";
            const patternTitleY = isFirstAnalysisPage ? 560 : 325;
            const patternTop = isFirstAnalysisPage ? 640 : 400;
            const patternHeight = isFirstAnalysisPage ? 820 : 1100;
            patternCtx.fillText("每日 0－24 小時睡眠區段", 74, patternTitleY);
            const columnWidth = 1010 / Math.max(shown.length, 1);
            shown.forEach((item, index) => {
              const x = 120 + index * columnWidth;
              patternCtx.fillStyle = "#F2ECE7";
              patternCtx.fillRect(x, patternTop, Math.max(22, columnWidth - 12), patternHeight);
              item.segments.forEach((segment) => {
                patternCtx.fillStyle = "#718D7F";
                patternCtx.fillRect(
                  x,
                  patternTop + (segment.startMinute / 1440) * patternHeight,
                  Math.max(22, columnWidth - 12),
                  Math.max(4, (segment.duration / 1440) * patternHeight),
                );
              });
              patternCtx.save();
              patternCtx.translate(x + 5, patternTop + patternHeight + 50);
              patternCtx.rotate(-0.5);
              patternCtx.fillStyle = "#746A64";
              patternCtx.font = "20px Arial, sans-serif";
              patternCtx.fillText(item.date.slice(5).replace("-", "/"), 0, 0);
              patternCtx.restore();
            });
            [0, 6, 12, 18, 24].forEach((hour) => {
              patternCtx.fillStyle = "#746A64";
              patternCtx.font = "20px Arial, sans-serif";
              patternCtx.fillText(`${hour}:00`, 55, patternTop + 5 + (hour / 24) * patternHeight);
            });
            addCanvasPage(patternCanvas);
          }
        }

        if (analysisCharts.emotions || analysisCharts.events) {
          let insightCanvas = document.createElement("canvas");
          insightCanvas.width = pageWidth;
          insightCanvas.height = pageHeight;
          let insightCtx = insightCanvas.getContext("2d")!;
          drawHeader(insightCtx, "情緒與事件");
          const summaryOnInsight = !summaryPlaced;
          if (summaryOnInsight) {
            drawSummaryCards(insightCtx);
            summaryPlaced = true;
          }
          let y = summaryOnInsight ? 550 : 330;
          if (analysisCharts.emotions) {
            insightCtx.fillStyle = "#332B27";
            insightCtx.font = "700 34px Arial, sans-serif";
            insightCtx.fillText("情緒／行為統計", 74, y);
            y += 55;
            const counts = ranged.reduce<Record<string, number>>((result, record) => {
              recordEmotionTags(record).forEach((tag) => {
                result[tag] = (result[tag] ?? 0) + 1;
              });
              return result;
            }, {});
            const ranking = Object.entries(counts).sort((a, b) => b[1] - a[1]);
            const frequencyValues = rangeDates.map((date) =>
              ranged.filter((record) => {
                if (localDateKey(new Date(record.at)) !== date) return false;
                const tags = recordEmotionTags(record);
                return pdfEmotionFilter === "全部"
                  ? record.type === "emotion" || tags.length > 0
                  : tags.includes(pdfEmotionFilter);
              }).length,
            );
            const frequencyMax = Math.max(...frequencyValues, 1);
            insightCtx.font = "700 26px Arial, sans-serif";
            insightCtx.fillStyle = "#704E42";
            insightCtx.fillText(
              `每日紀錄頻率｜${pdfEmotionFilter === "全部" ? "全部情緒／行為" : `${emotionEmoji(pdfEmotionFilter)} ${pdfEmotionFilter}`}`,
              88,
              y,
            );
            const frequencyTop = y + 58;
            const frequencyHeight = 150;
            const frequencyStep = 1030 / Math.max(rangeDates.length, 1);
            rangeDates.forEach((date, index) => {
              const x = 88 + index * frequencyStep;
              const barWidth = Math.max(5, Math.min(30, frequencyStep - 6));
              const height = (frequencyValues[index] / frequencyMax) * frequencyHeight;
              insightCtx.fillStyle = "#F5E9EC";
              insightCtx.fillRect(x, frequencyTop, barWidth, frequencyHeight);
              insightCtx.fillStyle = "#A76B78";
              insightCtx.fillRect(x, frequencyTop + frequencyHeight - height, barWidth, Math.max(2, height));
              insightCtx.save();
              insightCtx.fillStyle = "#5F454A";
              insightCtx.font = `700 ${rangeDates.length > 21 ? 16 : 20}px Arial, sans-serif`;
              insightCtx.textAlign = "center";
              insightCtx.textBaseline = "bottom";
              insightCtx.fillText(
                String(frequencyValues[index]),
                x + barWidth / 2,
                Math.max(
                  frequencyTop + 24,
                  frequencyTop + frequencyHeight - height - 8,
                ),
              );
              insightCtx.restore();
              if (rangeDates.length <= 14 || index % Math.ceil(rangeDates.length / 10) === 0) {
                insightCtx.fillStyle = "#746A64";
                insightCtx.font = "17px Arial, sans-serif";
                insightCtx.fillText(date.slice(5).replace("-", "/"), x - 4, frequencyTop + frequencyHeight + 25);
              }
            });
            y += 260;
            const visibleRanking = ranking.slice(0, summaryOnInsight ? 6 : 10);
            if (visibleRanking.length) {
              visibleRanking.forEach(([label, count], index) => {
                insightCtx.font = "26px Arial, sans-serif";
                insightCtx.fillStyle = "#746A64";
                insightCtx.fillText(`${emotionEmoji(label)} ${label}`, 88, y + index * 52);
                insightCtx.fillStyle = "#A76B78";
                insightCtx.fillRect(330, y - 22 + index * 52, Math.min(650, count * 70), 28);
                insightCtx.fillStyle = "#332B27";
                insightCtx.fillText(`${count} 次`, 1010, y + index * 52);
              });
              y += visibleRanking.length * 52 + 70;
            } else {
              insightCtx.font = "25px Arial, sans-serif";
              insightCtx.fillStyle = "#746A64";
              insightCtx.fillText("此期間尚無情緒／行為紀錄。", 88, y);
              y += 85;
            }
            const intensityCounts = ranged
              .filter(
                (record) =>
                  record.type === "emotion" ||
                  (record.emotionTags?.length ?? 0) > 0,
              )
              .reduce<Record<string, number>>((result, record) => {
                const key = record.intensity ? String(record.intensity) : "none";
                result[key] = (result[key] ?? 0) + 1;
                return result;
              }, {});
            insightCtx.fillStyle = "#332B27";
            insightCtx.font = "700 30px Arial, sans-serif";
            insightCtx.fillText("表現程度分布", 74, y);
            y += 38;
            [
              ["未選擇", "none"],
              ["輕微", "1"],
              ["明顯", "2"],
              ["強烈", "3"],
            ].forEach(([label, key], index) => {
              const x = 74 + index * 274;
              insightCtx.fillStyle = "#FAF0F2";
              insightCtx.fillRect(x, y, 248, 124);
              insightCtx.fillStyle = "#A76B78";
              insightCtx.font = "700 38px Arial, sans-serif";
              insightCtx.fillText(String(intensityCounts[key] ?? 0), x + 28, y + 52);
              insightCtx.fillStyle = "#746A64";
              insightCtx.font = "23px Arial, sans-serif";
              insightCtx.fillText(label, x + 28, y + 92);
            });
            y += 175;
          }
          if (analysisCharts.events) {
            if (analysisCharts.emotions && y > 1250) {
              addCanvasPage(insightCanvas);
              insightCanvas = document.createElement("canvas");
              insightCanvas.width = pageWidth;
              insightCanvas.height = pageHeight;
              insightCtx = insightCanvas.getContext("2d")!;
              drawHeader(insightCtx, "期間特殊事件");
              y = 330;
            }
            const events = ranged.filter((record) => record.type === "event");
            insightCtx.fillStyle = "#332B27";
            insightCtx.font = "700 34px Arial, sans-serif";
            insightCtx.fillText("期間特殊事件", 74, y);
            insightCtx.font = "25px Arial, sans-serif";
            insightCtx.fillStyle = "#746A64";
            if (events.length) {
              events.slice(0, 12).forEach((event, index) => {
                insightCtx.fillText(
                  `${eventRangeLabel(event)}　${event.tags?.join("、") || event.title || "特殊事件"}`,
                  88,
                  y + 55 + index * 44,
                );
              });
            } else {
              insightCtx.fillText("此期間尚無特殊事件紀錄。", 88, y + 55);
            }
          }
          addCanvasPage(insightCanvas);
        }
        if (!summaryPlaced) {
          const summaryCanvas = document.createElement("canvas");
          summaryCanvas.width = pageWidth;
          summaryCanvas.height = pageHeight;
          const summaryCtx = summaryCanvas.getContext("2d")!;
          drawHeader(summaryCtx, "分析摘要");
          drawSummaryCards(summaryCtx);
          addCanvasPage(summaryCanvas);
        }
      }

      if (includeRecords) {
        const grouped = new Map<string, SleepRecord[]>();
        [...ranged]
          .sort((a, b) => +new Date(a.at) - +new Date(b.at))
          .forEach((record) => {
            const key = localDateKey(new Date(record.at));
            grouped.set(key, [...(grouped.get(key) ?? []), record]);
          });
        const recordPages: HTMLCanvasElement[] = [];
        let canvas = document.createElement("canvas");
        let ctx = canvas.getContext("2d")!;
        let y = 330;

        const startRecordPage = () => {
          canvas = document.createElement("canvas");
          canvas.width = pageWidth;
          canvas.height = pageHeight;
          ctx = canvas.getContext("2d")!;
          drawHeader(ctx, "紀錄明細");
          recordPages.push(canvas);
          y = 330;
        };
        const drawDateHeading = (date: string, continued = false) => {
          ctx.fillStyle = "#F4E7E1";
          ctx.fillRect(74, y - 34, pageWidth - 148, 58);
          ctx.fillStyle = "#704E42";
          ctx.font = "700 27px Arial, sans-serif";
          ctx.fillText(
            `${dateLabel(date)}${continued ? "（續）" : ""}`,
            94,
            y + 4,
          );
          y += 76;
        };

        startRecordPage();
        if (!ranged.length) {
          ctx.font = "30px Arial, sans-serif";
          ctx.fillStyle = "#746A64";
          ctx.fillText("此期間尚無紀錄。", 74, 350);
        } else {
          for (const [date, dateRecords] of grouped) {
            if (y + 76 + 87 > pageHeight - 100) startRecordPage();
            drawDateHeading(date);
            for (const record of dateRecords) {
              if (y + 87 > pageHeight - 100) {
                startRecordPage();
                drawDateHeading(date, true);
              }
              const recordY = y + 28;
              ctx.fillStyle = recordMeta[record.type].color;
              ctx.beginPath();
              ctx.arc(91, recordY - 7, 8, 0, Math.PI * 2);
              ctx.fill();
              ctx.font = "700 26px Arial, sans-serif";
              ctx.fillStyle = "#332B27";
              ctx.fillText(
                `${timeLabel(record.at)}　${record.title || recordMeta[record.type].label}`,
                120,
                recordY,
              );
              ctx.font = "23px Arial, sans-serif";
              ctx.fillStyle = "#746A64";
              const detail = [
                record.tags?.join("、"),
                record.emotionTags?.length ? `情緒：${record.emotionTags.join("、")}` : undefined,
                record.detail,
                record.response,
              ].filter(Boolean).join("｜");
              if (detail) ctx.fillText(detail.slice(0, 62), 120, recordY + 35);
              y += 87;
            }
            ctx.strokeStyle = "#E7DDD5";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(74, y - 8);
            ctx.lineTo(pageWidth - 74, y - 8);
            ctx.stroke();
            y += 28;
          }
        }
        recordPages.forEach((recordCanvas, index) => {
          const pageCtx = recordCanvas.getContext("2d")!;
          pageCtx.font = "22px Arial, sans-serif";
          pageCtx.fillStyle = "#8B817A";
          pageCtx.fillText(
            `紀錄明細 ${index + 1} / ${recordPages.length} 頁`,
            pageWidth - 310,
            pageHeight - 60,
          );
          addCanvasPage(recordCanvas);
        });
      }
      const filename = `${child.name}_睡眠觀察報告_${start}至${end}.pdf`;
      downloadBlob(pdf.output("blob"), filename, "application/pdf");
    } catch (error) {
      console.error("PDF export failed", error);
      setPdfError("PDF 產生失敗，請重新整理頁面後再試一次。");
    } finally {
      setBusy(false);
    }
  }

  function backupAll() {
    const next = { ...data, lastBackup: new Date().toISOString() };
    setData(next);
    downloadBlob(JSON.stringify(next, null, 2), `安睡角落_完整備份_${localDateKey()}.json`, "application/json");
  }

  return (
    <div className="view-stack">
      <section className="range-card">
        <div>
          <span className="eyebrow">報告範圍</span>
          <h2>{child?.name}的觀察資料</h2>
        </div>
        <div className="range-fields">
          <label><span>開始日期</span><input type="date" value={start} onChange={(e) => { setStart(e.target.value); setPdfEmotionFilter("全部"); }} /></label>
          <span>至</span>
          <label><span>結束日期</span><input type="date" value={end} onChange={(e) => { setEnd(e.target.value); setPdfEmotionFilter("全部"); }} /></label>
        </div>
        <div className="report-content-picker">
          <span>報告內容</span>
          <div>
            {([
              ["both", "紀錄＋分析圖"],
              ["records", "僅紀錄"],
              ["analysis", "僅分析圖"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={reportContent === value ? "selected" : ""}
                onClick={() => setReportContent(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {reportContent !== "records" && (
          <>
          <fieldset className="analysis-export-picker">
            <legend>選擇要匯出的分析圖</legend>
            {([
              ["totalSleep", "每日總睡眠時數"],
              ["sleepPattern", "每日睡眠時間軸"],
              ["emotions", "情緒／行為統計"],
              ["events", "期間特殊事件"],
            ] as const).map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={analysisCharts[key]}
                  onChange={(event) =>
                    setAnalysisCharts((old) => ({
                      ...old,
                      [key]: event.target.checked,
                    }))
                  }
                />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
          {analysisCharts.emotions && (
            <label className="pdf-emotion-filter">
              <span>PDF 情緒每日頻率</span>
              <select
                value={pdfEmotionFilter}
                onChange={(event) => setPdfEmotionFilter(event.target.value)}
              >
                <option value="全部">全部情緒／行為</option>
                {rangedEmotionOptions.map((emotion) => (
                  <option key={emotion} value={emotion}>
                    {emotionEmoji(emotion)} {emotion}
                  </option>
                ))}
              </select>
              <small>報告會保留所有情緒類型總次數，並呈現這個選項的每日頻率。</small>
            </label>
          )}
          </>
        )}
        <p>此範圍共有 {ranged.length} 筆紀錄；PDF 會依上方選擇輸出。</p>
      </section>
      <section className="export-grid">
        <article>
          <span className="export-icon peach"><FileDown size={24} /></span>
          <h3>閱讀／列印版報告</h3>
          <p>產生排版完成的 PDF，可直接下載到手機或電腦。</p>
          <div className="button-row">
            <button
              className="primary-button full"
              onClick={exportPdf}
              disabled={
                busy ||
                (reportContent !== "records" &&
                  !Object.values(analysisCharts).some(Boolean))
              }
            >
              <Download size={17} /> {busy ? "產生中…" : "下載 PDF"}
            </button>
          </div>
          {pdfError && <p className="export-error" role="alert">{pdfError}</p>}
        </article>
        <article>
          <span className="export-icon sage"><FileSpreadsheet size={24} /></span>
          <h3>試算表資料</h3>
          <p>匯出客觀單筆紀錄，可用 Excel 或 Google 試算表開啟。</p>
          <button className="secondary-button full" onClick={exportCsv}><Download size={17} /> 匯出 CSV</button>
        </article>
        <article>
          <span className="export-icon blue"><Archive size={24} /></span>
          <h3>完整家庭備份</h3>
          <p>按下按鈕會立即下載一份包含所有孩子、設定與全部紀錄的完整備份檔。</p>
          <button className="secondary-button full" onClick={backupAll}><Download size={17} /> 一鍵備份全部資料</button>
          <button className="text-button inline" onClick={importBackup}><Upload size={16} /> 從備份檔合併還原</button>
        </article>
      </section>
      <section className="insight-card warm">
        <ShieldCheck size={22} />
        <div>
          <strong>本機版不會自動同步雲端</strong>
          <p>建議至少每 14 天下載一次完整備份。上次備份：{data.lastBackup ? new Date(data.lastBackup).toLocaleDateString("zh-TW") : "尚未備份"}</p>
        </div>
      </section>
    </div>
  );
}

function ReportPreview({
  child,
  records,
  start,
  end,
  content,
}: {
  child: Child;
  records: SleepRecord[];
  start: string;
  end: string;
  content: "records" | "analysis" | "both";
}) {
  const summary = analyze(records);
  const dates = daysBetween(start, end);
  const daily = dates.map((date) => ({
    date,
    value: analyze(
      records.filter((record) => localDateKey(new Date(record.at)) === date),
    ).totalSleep,
  }));
  const maxSleep = Math.max(...daily.map((item) => item.value), 1);
  const events = records.filter((record) => record.type === "event");
  return (
    <article className="print-report">
      <header className="print-report-header">
        <span>安睡角落｜孩子睡眠與情緒觀察報告</span>
        <h1>{child.name}</h1>
        <p>紀錄期間：{start} 至 {end}｜產生日期：{localDateKey()}</p>
      </header>
      {content !== "records" && (
        <section className="print-analysis">
          <h2>分析圖</h2>
          <div className="print-summary">
            <div><span>期間總睡眠</span><strong>{minutesLabel(summary.totalSleep)}</strong></div>
            <div><span>完整睡眠區段</span><strong>{summary.sleepDurations.length} 段</strong></div>
          </div>
          <h3>每日總睡眠時數</h3>
          <div className="print-chart">
            {daily.map((item) => (
              <div key={item.date}>
                <span>{item.value ? minutesLabel(item.value) : ""}</span>
                <i style={{ height: `${Math.max(2, item.value / maxSleep * 100)}%` }} />
                <small>{item.date.slice(5).replace("-", "/")}</small>
              </div>
            ))}
          </div>
          <h3>期間特殊事件</h3>
          {events.length ? (
            <ul className="print-events">
              {events.map((event) => (
                <li key={event.id}>
                  <time>{eventRangeLabel(event)}</time>
                  {event.tags?.join("、") || event.title || "特殊事件"}
                </li>
              ))}
            </ul>
          ) : <p className="muted">此期間尚無特殊事件紀錄。</p>}
        </section>
      )}
      {content !== "analysis" && (
        <section className="print-records">
          <h2>紀錄明細</h2>
          {records.length ? records.map((record) => (
            <div key={record.id}>
              <time>{new Date(record.at).toLocaleString("zh-TW", { hour12: false })}</time>
              <strong>{record.title || recordMeta[record.type].label}</strong>
              <span>{[
                record.tags?.join("、"),
                record.emotionTags?.length ? `情緒：${record.emotionTags.join("、")}` : undefined,
                record.detail,
                record.response,
              ].filter(Boolean).join("｜")}</span>
            </div>
          )) : <p className="muted">此期間尚無紀錄。</p>}
        </section>
      )}
    </article>
  );
}

function SettingsView({
  data,
  setData,
  activeChild,
  onAddChild,
  onEditChild,
  onDeleteChild,
}: {
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  activeChild?: Child;
  onAddChild: () => void;
  onEditChild: (child: Child) => void;
  onDeleteChild: (child: Child) => void;
}) {
  return (
    <div className="view-stack">
      <section className="settings-section">
        <div className="section-heading compact">
          <div>
            <span className="eyebrow">家庭成員</span>
            <h2>管理孩子</h2>
            <small className="child-limit-note">
              已建立 {data.children.length}／{MAX_CHILDREN} 位
            </small>
          </div>
          <button
            className="secondary-button"
            onClick={onAddChild}
            disabled={data.children.length >= MAX_CHILDREN}
            title={
              data.children.length >= MAX_CHILDREN
                ? `已達 ${MAX_CHILDREN} 位上限`
                : undefined
            }
          >
            <Plus size={17} />
            {data.children.length >= MAX_CHILDREN
              ? `已達 ${MAX_CHILDREN} 位上限`
              : "新增孩子"}
          </button>
        </div>
        <div className="child-list">
          {data.children.map((child) => (
            <article key={child.id} className={child.archived ? "archived" : ""}>
              <span className="avatar" style={{ background: `${child.color}22`, color: child.color }}><Baby size={22} /></span>
              <div><strong>{child.name}</strong><small>{ageLabel(child)}{child.archived ? "｜已封存" : ""}</small></div>
              {child.id !== activeChild?.id && !child.archived && (
                <button className="text-button inline" onClick={() => setData((old) => ({ ...old, activeChildId: child.id }))}>切換</button>
              )}
              <span className="child-actions">
                <button className="icon-button" aria-label={`編輯 ${child.name}`} onClick={() => onEditChild(child)}>
                  <Pencil size={17} />
                </button>
                <button
                  className="icon-button"
                  aria-label={child.archived ? "取消封存" : "封存孩子"}
                  onClick={() => setData((old) => ({
                    ...old,
                    children: old.children.map((item) => item.id === child.id ? { ...item, archived: !item.archived } : item),
                  }))}
                >
                  <Archive size={17} />
                </button>
                <button className="icon-button child-delete" aria-label={`刪除 ${child.name}`} onClick={() => onDeleteChild(child)}>
                  <Trash2 size={17} />
                </button>
              </span>
            </article>
          ))}
        </div>
      </section>
      <section className="settings-section">
        <div className="setting-row">
          <span className="setting-icon"><ShieldCheck size={20} /></span>
          <div>
            <strong>資料與隱私說明</strong>
            <p>此工具內輸入的孩子資料與紀錄僅儲存在目前瀏覽器，不會由工具自動上傳給安睡角落。</p>
            <details className="privacy-details">
              <summary>查看完整說明</summary>
              <ul>
                <li>不需註冊帳號，安睡角落無法從其他裝置查看你輸入的紀錄。</li>
                <li>工具會以不使用分析 Cookie 的方式，向 Google Analytics 傳送「開啟工具、完成紀錄、查看分析、匯出資料」四種匿名功能事件。</li>
                <li>不會傳送孩子姓名、生日、睡眠或情緒內容、特殊事件、備註、日記、家長回應、備份檔及匯出內容。</li>
                <li>已關閉 Google signals、廣告個人化、自動頁面瀏覽及加強型評估。</li>
                <li>清除瀏覽資料、更換裝置或移除 PWA，可能造成紀錄遺失；請定期下載完整家庭備份。</li>
                <li>PDF、試算表與備份檔由你自行保管，是否分享由你決定。</li>
                <li>若主動使用 Email 聯絡，訊息與聯絡資料會由電子郵件服務處理。</li>
              </ul>
            </details>
          </div>
        </div>
        <div className="setting-row contact-setting">
          <span className="setting-icon"><Mail size={20} /></span>
          <div>
            <strong>聯絡安睡角落</strong>
            <p>遇到操作錯誤、畫面異常或有功能建議，都可以回報；免費使用也歡迎聯絡。</p>
            <div className="contact-actions">
              <a href={BUG_REPORT_MAILTO}>Email 問題回報</a>
            </div>
          </div>
        </div>
        <div className="setting-row support-setting">
          <span className="setting-icon"><Heart size={20} /></span>
          <div>
            <strong>支持工具持續維護</strong>
            <p>《孩子睡眠與情緒觀察工具》會持續免費提供。如果這份工具對你有幫助，也願意支持後續維護與改進，可以自由支持安睡角落。無論是否支持，都不影響任何功能。</p>
            <p>自由支持不包含睡眠諮詢、個別問題回覆或其他服務。</p>
            <div className="contact-actions">
              <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer">自由支持安睡角落</a>
            </div>
          </div>
        </div>
        <div className="setting-row">
          <span className="setting-icon"><Clock3 size={20} /></span>
          <div><strong>備份提醒</strong><p>紀錄累積後，在工具內溫和提醒備份。</p></div>
          <label className="switch"><input type="checkbox" checked={data.backupReminder} onChange={(e) => setData((old) => ({ ...old, backupReminder: e.target.checked }))} /><span /></label>
        </div>
        <div className="setting-row">
          <span className="setting-icon"><Info size={20} /></span>
          <div><strong>版本資訊</strong><p>孩子睡眠與情緒觀察工具 v{APP_VERSION}</p></div>
        </div>
      </section>
      <section className="danger-zone">
        <div><strong>清除全部資料</strong><p>此操作無法復原，請先下載完整備份。</p></div>
        <button
          onClick={() => {
            if (window.confirm("確定要清除所有孩子與紀錄嗎？此操作無法復原。") && window.confirm("最後確認：真的要清除全部資料嗎？")) {
              localStorage.removeItem(STORAGE_KEY);
              window.location.reload();
            }
          }}
        >
          <Eraser size={17} strokeWidth={1.8} /> 清除
        </button>
      </section>
    </div>
  );
}

function ChildModal({
  child,
  onClose,
  onSave,
}: {
  child?: Child;
  onClose: () => void;
  onSave: (child: Child) => void;
}) {
  const [name, setName] = useState(child?.name ?? "");
  const [birthday, setBirthday] = useState(child?.birthday ?? "");
  const [dueDate, setDueDate] = useState(child?.dueDate ?? "");
  const [ageMode, setAgeMode] = useState<"chronological" | "corrected">(
    child?.ageMode === "corrected" && child?.dueDate
      ? "corrected"
      : "chronological",
  );
  const [color, setColor] = useState(child?.color ?? COLORS[1]);
  return (
    <Modal title={child ? "編輯孩子資料" : "新增孩子"} onClose={onClose}>
      <label className="field"><span>暱稱或姓名 *</span><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：小樂" /></label>
      <label className="field"><span>出生日期（選填）</span><input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} /></label>
      <label className="field">
        <span>預產期（選填）</span>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => {
            setDueDate(e.target.value);
            if (!e.target.value) setAgeMode("chronological");
          }}
        />
      </label>
      <label className="field">
        <span>年齡顯示方式</span>
        <select
          value={ageMode}
          onChange={(e) =>
            setAgeMode(e.target.value as "chronological" | "corrected")
          }
        >
          <option value="chronological">依出生日期（實際年齡）</option>
          <option value="corrected" disabled={!dueDate}>
            依預產期（矯正年齡）
          </option>
        </select>
      </label>
      <fieldset className="color-picker"><legend>代表顏色</legend><div>{COLORS.map((item) => <button key={item} type="button" aria-label={`選擇顏色 ${item}`} className={color === item ? "selected" : ""} style={{ background: item }} onClick={() => setColor(item)} />)}</div></fieldset>
      <button className="primary-button" disabled={!name.trim()} onClick={() => onSave({ id: child?.id ?? uid(), name: name.trim(), birthday: birthday || undefined, dueDate: dueDate || undefined, ageMode: dueDate ? ageMode : "chronological", color, archived: child?.archived })}>{child ? "儲存變更" : "完成新增"}</button>
    </Modal>
  );
}

function RecordModal({
  child,
  date,
  type,
  record,
  onClose,
  onSave,
  onDelete,
}: {
  child: Child;
  date: string;
  type: RecordType;
  record: SleepRecord | null;
  onClose: () => void;
  onSave: (record: SleepRecord) => void;
  onDelete?: (record: SleepRecord) => void;
}) {
  const initialTime = record ? timeLabel(record.at) : new Date().toTimeString().slice(0, 5);
  const [recordDate, setRecordDate] = useState(record ? localDateKey(new Date(record.at)) : date);
  const [time, setTime] = useState(initialTime);
  const [title, setTitle] = useState(record?.title ?? "");
  const [detail, setDetail] = useState(record?.detail ?? "");
  const [response, setResponse] = useState(record?.response ?? "");
  const [intensity, setIntensity] = useState<number | undefined>(
    record?.intensity,
  );
  const [durationHours, setDurationHours] = useState(
    record?.duration ? String(Math.floor(record.duration / 60)) : "",
  );
  const [durationMinutes, setDurationMinutes] = useState(
    record?.duration ? String(record.duration % 60) : "",
  );
  const [tags, setTags] = useState<string[]>(
    type === "emotion" ? [] : record?.tags ?? [],
  );
  const [emotions, setEmotions] = useState<string[]>(
    type === "emotion" ? record?.tags ?? [] : record?.emotionTags ?? [],
  );
  const [isContinuous, setIsContinuous] = useState(Boolean(record?.endAt));
  const [endDate, setEndDate] = useState(
    record?.endAt ? localDateKey(new Date(record.endAt)) : recordDate,
  );
  const [endTime, setEndTime] = useState(
    record?.endAt ? timeLabel(record.endAt) : time,
  );
  const supportsEmotion = type === "emotion" || type === "bed" || type === "wake";
  const tagOptions = type === "event" ? eventOptions : type === "note" ? noteTags : [];

  function toggleSelection(
    value: string,
    setter: React.Dispatch<React.SetStateAction<string[]>>,
  ) {
    setter((old) =>
      old.includes(value)
        ? old.filter((item) => item !== value)
        : [...old, value],
    );
  }

  return (
    <Modal title={`${record ? "編輯" : "新增"}${recordMeta[type].label}`} subtitle={`記錄給 ${child.name}`} onClose={onClose}>
      <div className="two-fields">
        <label className="field"><span>日期</span><input type="date" value={recordDate} max={localDateKey()} onChange={(e) => {
          const nextDate = e.target.value;
          setRecordDate(nextDate);
          if (endDate < nextDate) setEndDate(nextDate);
        }} /></label>
        <label className="field"><span>時間</span><input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
      </div>
      {type === "event" && (
        <fieldset className="occurrence-picker">
          <legend>事件時間</legend>
          <div>
            <button type="button" className={!isContinuous ? "selected" : ""} onClick={() => setIsContinuous(false)}>單次事件</button>
            <button type="button" className={isContinuous ? "selected" : ""} onClick={() => setIsContinuous(true)}>連續期間</button>
          </div>
        </fieldset>
      )}
      {type === "event" && isContinuous && (
        <div className="two-fields">
          <label className="field"><span>結束日期</span><input type="date" value={endDate} min={recordDate} onChange={(e) => setEndDate(e.target.value)} /></label>
          <label className="field"><span>結束時間</span><input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></label>
        </div>
      )}
      {tagOptions.length > 0 && (
        <fieldset className="option-group">
          <legend>{type === "note" ? "分類標籤（可多選）" : `${recordMeta[type].label}（可多選）`}</legend>
          <div>{tagOptions.map((option) => <button key={option} type="button" className={tags.includes(option) ? "selected" : ""} onClick={() => toggleSelection(option, setTags)}>{option}</button>)}</div>
        </fieldset>
      )}
      {supportsEmotion && (
        <>
          <fieldset className="option-group emotion-options">
            <legend>情緒／行為選項（可多選）</legend>
            <div>
              {emotionOptions.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  className={emotions.includes(option.label) ? "selected" : ""}
                  onClick={() => toggleSelection(option.label, setEmotions)}
                >
                  <span aria-hidden="true">{option.emoji}</span>
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="intensity-picker">
            <legend>表現程度（選填）</legend>
            <div>
              <button
                type="button"
                className={intensity === undefined ? "selected" : ""}
                onClick={() => setIntensity(undefined)}
              >
                不選擇
              </button>
              {[1, 2, 3].map((value) => (
                <button
                  key={value}
                  type="button"
                  className={intensity === value ? "selected" : ""}
                  onClick={() => setIntensity(value)}
                >
                  {value}
                  <small>{["輕微", "明顯", "強烈"][value - 1]}</small>
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="duration-picker">
            <legend>持續時間（選填）</legend>
            <div>
              <label>
                <input
                  inputMode="numeric"
                  type="number"
                  min="0"
                  value={durationHours}
                  onChange={(e) => setDurationHours(e.target.value)}
                  placeholder="0"
                />
                <span>小時</span>
              </label>
              <label>
                <input
                  inputMode="numeric"
                  type="number"
                  min="0"
                  max="59"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                  placeholder="0"
                />
                <span>分鐘</span>
              </label>
            </div>
          </fieldset>
        </>
      )}
      {(type === "emotion" || type === "event") && (
        <label className="field"><span>名稱或情境（選填）</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={type === "emotion" ? "例如：洗澡後、準備關燈時" : "例如：家庭旅行、感冒開始"} /></label>
      )}
      {(type === "bed" || type === "wake") && <label className="field"><span>{type === "bed" ? "上床時的狀況（選填）" : "起床時的狀況（選填）"}</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={type === "bed" ? "例如：精神很好、已經很累" : "例如：哭泣、精神很好"} /></label>}
      <label className="field">
        <span>{type === "note" ? "備註內容" : "補充說明（選填）"}</span>
        <div className="counted-textarea">
          <textarea
            value={detail}
            maxLength={MULTILINE_TEXT_LIMIT}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="記下你觀察到的細節…"
            rows={3}
          />
          <span className="character-count" aria-hidden="true">
            {detail.length}/{MULTILINE_TEXT_LIMIT}
          </span>
        </div>
      </label>
      {(type === "emotion" || type === "bed" || type === "wake") && (
        <label className="field">
          <span>家長回應／照顧方式（選填）</span>
          <div className="counted-textarea">
            <textarea
              value={response}
              maxLength={MULTILINE_TEXT_LIMIT}
              onChange={(e) => setResponse(e.target.value)}
              placeholder="例如：抱抱安撫、陪伴後再入睡"
              rows={2}
            />
            <span className="character-count" aria-hidden="true">
              {response.length}/{MULTILINE_TEXT_LIMIT}
            </span>
          </div>
        </label>
      )}
      <div className="modal-actions">
        {onDelete && record && <button className="delete-button" onClick={() => onDelete(record)}><Trash2 size={17} /> 刪除</button>}
        <button className="primary-button" onClick={() => onSave({
          id: record?.id ?? uid(),
          childId: child.id,
          type,
          at: atLocal(recordDate, time),
          endAt: type === "event" && isContinuous ? atLocal(endDate, endTime) : undefined,
          title: title.trim() || undefined,
          detail: detail.trim() || undefined,
          response: response.trim() || undefined,
          intensity:
            supportsEmotion && emotions.length && intensity !== undefined
              ? intensity
              : undefined,
          duration:
            supportsEmotion && emotions.length && (durationHours || durationMinutes)
              ? Math.max(0, Number(durationHours) || 0) * 60 +
                Math.min(59, Math.max(0, Number(durationMinutes) || 0))
              : undefined,
          tags: type === "emotion" ? (emotions.length ? emotions : undefined) : (tags.length ? tags : undefined),
          emotionTags: type !== "emotion" && supportsEmotion && emotions.length ? emotions : undefined,
        })}>儲存紀錄</button>
      </div>
    </Modal>
  );
}

function Modal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header><div><h2 id="modal-title">{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" onClick={onClose} aria-label="關閉"><X size={20} /></button></header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}
