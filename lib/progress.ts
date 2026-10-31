// Pure progress logic for "Đại Lôi Âm Tự". Everything here is per-viewer and stored only in this
// browser (localStorage). Nothing is sent to a server, no other players are simulated, and points
// are derived from the counters so they can never be double-counted.

export const STORAGE_KEY = "dai-lo-am-tu:progress:v1";

export const BEADS_PER_CYCLE = 108;
export const BOWS_PER_CYCLE = 108;
export const TAPS_PER_CYCLE = 108;
export const MEDITATION_SECONDS_PER_SCROLL = 180;

export interface Progress {
  name: string;
  beads: number;
  bows: number;
  taps: number;
  incense: number;
  meditationSeconds: number;
}

export const DEFAULT_PROGRESS: Progress = {
  name: "",
  beads: 0,
  bows: 0,
  taps: 0,
  incense: 0,
  meditationSeconds: 0,
};

export const REALMS = [
  { min: 0, name: "Sơ Tâm Hành Giả" },
  { min: 108, name: "Qua Cầu Lăng Vân" },
  { min: 500, name: "Định Tâm Hàng Ma" },
  { min: 1500, name: "Tĩnh Tâm Liên Hoa" },
  { min: 5000, name: "Tỉnh Giác Vô Tự" },
  { min: 15000, name: "Khai Ngộ Chân Kinh" },
  { min: 50000, name: "An Trú Lôi Âm" },
  { min: 150000, name: "Thiền Duyệt Bồ Đề" },
  { min: 500000, name: "Đại Giác Ngộ" },
] as const;

// Lời nhắc tĩnh tâm do HIU TMC soạn. Đây KHÔNG phải kinh văn. 12 dòng này và các ngưỡng cảnh giới, điểm công đức bên dưới đã được chủ dự án duyệt (2026-10-31).
export const SCROLL_VERSES: readonly string[] = [
  "Tâm lặng thì nước trong, không cần khuấy động để thấy đáy.",
  "Một hơi thở chậm, một bước chân vững: đủ cho hôm nay.",
  "Buông một điều lo, nhẹ đi một nhịp.",
  "Điều không thể kiểm soát, hãy để nó đi qua như gió qua núi.",
  "Học mà không tĩnh thì rối; tĩnh mà không học thì trống.",
  "Thấy mình đang nóng giận, đó đã là bước đầu của tỉnh thức.",
  "Đi chậm không lạc đường; đi nhanh mà không nhìn thì dễ vấp.",
  "Gốc lành nảy từ việc nhỏ làm mỗi ngày.",
  "Đừng chờ hết việc mới nghỉ; nghỉ một chút để việc đi tiếp.",
  "Lắng nghe trước khi nói, hiểu trước khi đoán.",
  "Hôm nay đủ bình an là đã đi qua một kiếp nạn.",
  "Không cần lên đỉnh ngay; chỉ cần biết mình đang ở đâu.",
];

const NAME_PREFIXES = [
  "Mây", "Trăng", "Lá Bồ Đề", "Hạt Sương", "Tiếng Chuông", "Hành Giả",
  "Sen Vàng", "Khói Trầm", "Gió Ngàn", "Suối Nguồn", "Hạc Trắng", "Chú Tiểu",
];
const NAME_SUFFIXES = [
  "Thong Thả", "Dịu Dàng", "Tỉnh Thức", "An Nhiên", "Lắng Đọng", "Không Vội",
  "Chậm Rãi", "Tĩnh Lặng", "Hiền Hòa", "Thảnh Thơi", "Vô Ưu", "Linh Sơn",
];

export function randomDharmaName(rand: () => number = Math.random): string {
  const a = NAME_PREFIXES[Math.floor(rand() * NAME_PREFIXES.length)];
  const b = NAME_SUFFIXES[Math.floor(rand() * NAME_SUFFIXES.length)];
  return `${a} ${b}`;
}

export function points(p: Progress): number {
  return (
    p.bows * 3 +
    p.beads +
    p.taps +
    p.incense +
    Math.floor(p.meditationSeconds / 60) * 2
  );
}

export function realmIndex(pts: number): number {
  let index = 0;
  REALMS.forEach((realm, i) => {
    if (pts >= realm.min) index = i;
  });
  return index;
}

export function scrollCount(p: Progress): number {
  return (
    Math.floor(p.beads / BEADS_PER_CYCLE) +
    Math.floor(p.bows / BOWS_PER_CYCLE) +
    Math.floor(p.taps / TAPS_PER_CYCLE) +
    Math.floor(p.meditationSeconds / MEDITATION_SECONDS_PER_SCROLL)
  );
}

export function currentVerse(p: Progress): string | null {
  const n = scrollCount(p);
  if (n === 0) return null;
  return SCROLL_VERSES[(n - 1) % SCROLL_VERSES.length];
}

function nonNegativeInt(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

export function sanitizeProgress(raw: unknown): Progress {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PROGRESS };
  const r = raw as Record<string, unknown>;
  return {
    name: typeof r.name === "string" ? r.name.slice(0, 40) : "",
    beads: nonNegativeInt(r.beads),
    bows: nonNegativeInt(r.bows),
    taps: nonNegativeInt(r.taps),
    incense: nonNegativeInt(r.incense),
    meditationSeconds: nonNegativeInt(r.meditationSeconds),
  };
}

// Storage can be blocked (private window, disabled site data). Every access is guarded and the page
// still works without it.
export function loadProgress(): Progress {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? sanitizeProgress(JSON.parse(stored)) : { ...DEFAULT_PROGRESS };
  } catch {
    return { ...DEFAULT_PROGRESS };
  }
}

export function saveProgress(p: Progress): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

// The journey to Lôi Âm Tự is 81 nạn (tribulations), grouped into 9 chương of 9 nạn each. Each
// chương uses one of the nine realm names, so the approved realm thresholds stay exactly as they are.
export const NAN_TOTAL = 81;
export const NAN_PER_CHAPTER = 9;

export interface JourneyPosition {
  chapter: number; // 1..9
  chapterName: string;
  nanDone: number; // 0..80, nạn passed so far
  nanInChapter: number; // 0..8, nạn currently in progress within the chapter
  pointsIntoChapter: number;
  pointsForChapter: number; // points needed to finish this chapter (0 at the last one)
}

export function journeyPosition(pts: number): JourneyPosition {
  const chapterIndex = realmIndex(pts);
  const here = REALMS[chapterIndex];
  const next = REALMS[chapterIndex + 1];
  const span = next ? next.min - here.min : 0;
  const into = pts - here.min;
  const frac = span > 0 ? Math.min(1, into / span) : 1;
  const nanInChapter = Math.min(NAN_PER_CHAPTER - 1, Math.floor(frac * NAN_PER_CHAPTER));
  const nanDone = Math.min(NAN_TOTAL - 1, chapterIndex * NAN_PER_CHAPTER + nanInChapter);
  return {
    chapter: chapterIndex + 1,
    chapterName: here.name,
    nanDone,
    nanInChapter,
    pointsIntoChapter: into,
    pointsForChapter: span,
  };
}
