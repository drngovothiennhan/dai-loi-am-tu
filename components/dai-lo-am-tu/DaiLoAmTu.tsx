"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BEADS_PER_CYCLE,
  BOWS_PER_CYCLE,
  DEFAULT_PROGRESS,
  MEDITATION_SECONDS_PER_SCROLL,
  REALMS,
  NAN_TOTAL,
  journeyPosition,
  TAPS_PER_CYCLE,
  currentVerse,
  loadProgress,
  points,
  randomDharmaName,
  realmIndex,
  saveProgress,
  scrollCount,
  type Progress,
} from "@/lib/progress";
import { DEFAULT_MIX, loadMix, saveMix, ZenAudio, type MixerSettings } from "./audio";
import { DaiLoAmTuWorld, type CharacterArt, type DecorArt, type FrameRect, type Pose, type Zone } from "./world";
import { CHARACTER_IDS, SPRITE_MANIFEST, type CharacterId } from "@/lib/sprite-manifest";
import styles from "./DaiLoAmTu.module.css";

type Panel = "beads" | "mo" | "scroll" | "audio" | null;

const CHARACTER_KEY = "dai-lo-am-tu:character:v1";

function readCharacter(): CharacterId {
  try {
    const saved = window.localStorage.getItem(CHARACTER_KEY);
    if (saved && (CHARACTER_IDS as string[]).includes(saved)) return saved as CharacterId;
  } catch {
    // Storage blocked: fall back to the first character.
  }
  return CHARACTER_IDS[0];
}

const DECOR_ART = SPRITE_MANIFEST.decor as unknown as Record<string, DecorArt>;

function artFor(id: CharacterId): CharacterArt {
  const c = SPRITE_MANIFEST.characters[id];
  return {
    file: SPRITE_MANIFEST.atlas.file,
    atlasW: SPRITE_MANIFEST.atlas.width,
    atlasH: SPRITE_MANIFEST.atlas.height,
    poses: c.poses as unknown as Record<string, FrameRect>,
  };
}

interface Toast {
  id: number;
  text: string;
}

const ZONE_LABEL: Record<Zone, string> = {
  hall: "Đại Hùng Bảo Điện",
  courtyard: "Sân Ánh Trăng Bồ Đề",
  bridge: "Thềm Lăng Vân",
  library: "Tàng Kinh Các",
};

export default function DaiLoAmTu() {
  const stageRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<DaiLoAmTuWorld | null>(null);
  const audioRef = useRef<ZenAudio | null>(null);
  const toastId = useRef(0);

  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState<Progress>(DEFAULT_PROGRESS);
  const [mix, setMix] = useState<MixerSettings>(DEFAULT_MIX);
  const [pose, setPose] = useState<Pose>("stand");
  const [seated, setSeated] = useState(false);
  const [zone, setZone] = useState<Zone>("hall");
  const [day, setDay] = useState(true);
  const [panel, setPanel] = useState<Panel>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [webglOk, setWebglOk] = useState(true);
  const [pointerStartY, setPointerStartY] = useState<number | null>(null);
  const [character, setCharacter] = useState<CharacterId>(CHARACTER_IDS[0]);
  const [artOk, setArtOk] = useState(true);

  const addToast = useCallback((text: string) => {
    const id = ++toastId.current;
    setToasts((list) => [...list.slice(-2), { id, text }]);
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 3500);
  }, []);

  // Load per-viewer state after mount (localStorage is unavailable during static rendering).
  useEffect(() => {
    const loaded = loadProgress();
    if (!loaded.name) loaded.name = randomDharmaName();
    setProgress(loaded);
    setMix(loadMix());
    setCharacter(readCharacter());
    setReady(true);
  }, []);

  // Save progress, debounced so the meditation timer does not write every second.
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => saveProgress(progress), 400);
    return () => window.clearTimeout(timer);
  }, [progress, ready]);

  useEffect(() => {
    saveMix(mix);
    audioRef.current?.setSettings(mix);
  }, [mix]);

  // 3D world: mounted once, torn down on unmount.
  useEffect(() => {
    const container = stageRef.current;
    if (!container) return;
    let world: DaiLoAmTuWorld | null = null;
    try {
      world = new DaiLoAmTuWorld(container, artFor(readCharacter()), DECOR_ART, {
        onPoseChange: (next) => setPose(next),
        onZoneChange: (next) => setZone(next),
        onSeatChange: (id) => setSeated(id !== null),
        onBowComplete: () => {
          setProgress((p) => ({ ...p, bows: p.bows + 1 }));
          audioRef.current?.playBell();
        },
        onSeatedSecond: () => setProgress((p) => ({ ...p, meditationSeconds: p.meditationSeconds + 1 })),
        onArtError: () => setArtOk(false),
      });
    } catch {
      setWebglOk(false);
    }
    worldRef.current = world;
    const audio = new ZenAudio(loadMix());
    audioRef.current = audio;
    const onVisibility = () => audio.setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      world?.dispose();
      audio.dispose();
      worldRef.current = null;
      audioRef.current = null;
    };
  }, []);

  const ensureAudio = () => audioRef.current?.ensure();

  const chooseCharacter = (id: CharacterId) => {
    setCharacter(id);
    setArtOk(true);
    worldRef.current?.setCharacter(artFor(id));
    try {
      window.localStorage.setItem(CHARACTER_KEY, id);
    } catch {
      // Storage blocked: the choice still applies for this visit.
    }
  };

  const isCourtyard = zone !== "hall";

  const handleBow = () => {
    ensureAudio();
    const w = worldRef.current;
    if (!w) return;
    if (isCourtyard) {
      if (pose === "dance") w.stop();
      else w.dance();
      return;
    }
    if (pose === "bow") w.stop();
    else w.bow();
  };

  const handleGassho = () => {
    ensureAudio();
    worldRef.current?.gassho();
    addToast("Bạn chắp tay hướng về Đức Phật.");
  };

  const handleStop = () => worldRef.current?.stop();

  const openPanel = (next: Exclude<Panel, null>) => {
    ensureAudio();
    setPanel((current) => (current === next ? null : next));
  };

  const bead = () => {
    ensureAudio();
    audioRef.current?.playBead();
    setProgress((p) => {
      const beads = p.beads + 1;
      if (beads % BEADS_PER_CYCLE === 0) addToast("Đủ một vòng 108 hạt. Cuộn Vô Tự Chân Kinh đã mở một quẻ.");
      return { ...p, beads };
    });
  };

  const tap = () => {
    ensureAudio();
    audioRef.current?.playWood();
    setProgress((p) => {
      const taps = p.taps + 1;
      if (taps % TAPS_PER_CYCLE === 0) addToast("Đủ 108 nhịp mõ. Cuộn Vô Tự Chân Kinh đã mở một quẻ.");
      return { ...p, taps };
    });
  };

  const burn = (count: number) => {
    ensureAudio();
    setProgress((p) => ({ ...p, incense: p.incense + count }));
    addToast(`Đã thắp ${count} nén hương.`);
  };

  const walkTo = (x: number, z: number) => {
    ensureAudio();
    worldRef.current?.walkTo(x, z);
  };

  const toggleDay = () => {
    const next = !day;
    setDay(next);
    worldRef.current?.setDay(next);
  };

  // Keyboard shortcuts 1–5 and Escape.
  const handlersRef = useRef({ handleBow, handleGassho, handleStop, openPanel, bead, panel });
  handlersRef.current = { handleBow, handleGassho, handleStop, openPanel, bead, panel };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const h = handlersRef.current;
      if (e.key === "Escape") {
        h.handleStop();
        setPanel(null);
        return;
      }
      if (h.panel === "beads" && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        h.bead();
        return;
      }
      switch (e.key) {
        case "1":
        case "e":
        case "E":
          h.handleBow();
          break;
        case "2":
          h.openPanel("beads");
          break;
        case "3":
          h.handleGassho();
          break;
        case "4":
          h.openPanel("mo");
          break;
        case "5":
          h.openPanel("scroll");
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const pts = points(progress);
  const journey = journeyPosition(pts);
  const nextChapter = REALMS[journey.chapter];
  const verse = currentVerse(progress);
  const scrolls = scrollCount(progress);
  const isMoving = pose === "walk";
  const bowActive = pose === "bow";
  const danceActive = pose === "dance";
  const showStop = seated || isMoving || bowActive || danceActive;

  return (
    <main className={styles.page}>
      <div ref={stageRef} className={styles.stage} aria-label="Không gian 3D Đại Lôi Âm Tự" />

      {!webglOk && (
        <div className={styles.fallback} role="status">
          Trình duyệt này không hiển thị được không gian 3D. Các chức năng tu tập vẫn dùng được qua nút bên dưới.
        </div>
      )}

      <header className={styles.topLeft}>
        <a href="https://hiutmc.com/" className={styles.back}>← HIU TMC</a>
        <h1 className={styles.title}>
          <span className={styles.lotus} aria-hidden="true">🪷</span> Đại Lôi Âm Tự
          <small>大雷音寺 · Linh Sơn Thiền Cảnh</small>
        </h1>
        <nav className={styles.zones} aria-label="Chuyển khu vực">
          <button type="button" aria-pressed={zone === "hall"} onClick={() => walkTo(0, 4)}>
            🏛️ Đại Hùng Bảo Điện
          </button>
          <button type="button" aria-pressed={zone === "courtyard"} onClick={() => walkTo(0, 22)}>
            🌕 Sân Ánh Trăng
          </button>
          <button type="button" aria-pressed={zone === "library"} onClick={() => walkTo(26, 20)}>
            📜 Tàng Kinh Các
          </button>
          <button type="button" aria-pressed={zone === "bridge"} onClick={() => walkTo(-22, 28)}>
            🌉 Thềm Lăng Vân
          </button>
          <button type="button" onClick={toggleDay}>
            {day ? "☀️ Bình minh biển mây" : "🌙 Trăng rằm Linh Sơn"}
          </button>
        </nav>
        <p className={styles.zoneNow}>Đang ở: {ZONE_LABEL[zone]}</p>
        <div className={styles.characters} role="group" aria-label="Chọn nhân vật">
          {CHARACTER_IDS.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={character === id}
              onClick={() => chooseCharacter(id)}
            >
              {SPRITE_MANIFEST.characters[id].label}
            </button>
          ))}
        </div>
        {!artOk && <p className={styles.zoneNow}>Không tải được hình nhân vật.</p>}
      </header>

      <aside className={styles.topRight} aria-label="Thông tin tu tập">
        <p className={styles.name}>Tiểu hành giả: <strong>{progress.name || "…"}</strong></p>
        <p>Chương {journey.chapter}/9: <strong>{journey.chapterName}</strong></p>
        <p>Nạn đã qua: <strong>{journey.nanDone}/{NAN_TOTAL}</strong></p>
        <div className={styles.bar} aria-hidden="true"><i style={{ width: `${Math.round((journey.nanDone / NAN_TOTAL) * 100)}%` }} /></div>
        <p>Công đức: <strong>{pts}</strong>
          {nextChapter && <span className={styles.muted}> · còn {nextChapter.min - pts} công đức đến chương kế</span>}
        </p>
        <div className={styles.utility}>
          <button type="button" onClick={() => openPanel("audio")}>🎵 Thanh âm</button>
          <button type="button" onClick={() => openPanel("scroll")}>📜 Tàng kinh ({scrolls})</button>
        </div>
      </aside>

      {showStop && (
        <button type="button" className={styles.stop} onClick={handleStop}>
          ⏹️ {seated ? "Đứng dậy" : "Dừng lại"}
        </button>
      )}

      <nav className={styles.bottomBar} aria-label="Hành động">
        <button type="button" aria-pressed={bowActive || danceActive} onClick={handleBow}>
          <kbd>1</kbd>
          {isCourtyard ? "♫ Vũ điệu dưới trăng" : `🙏 Lạy Phật (${progress.bows % BOWS_PER_CYCLE}/108)`}
        </button>
        <button type="button" onClick={() => openPanel("beads")}>
          <kbd>2</kbd>📿 Lần tràng hạt ({progress.beads % BEADS_PER_CYCLE}/108)
        </button>
        <button type="button" onClick={handleGassho}>
          <kbd>3</kbd>🙌 Chắp tay chào
        </button>
        <button type="button" onClick={() => openPanel("mo")}>
          <kbd>4</kbd>🪵 Gõ mõ &amp; thắp hương
        </button>
        <button type="button" onClick={() => openPanel("scroll")}>
          <kbd>5</kbd>📜 Vô tự chân kinh
        </button>
      </nav>

      {panel === "beads" && (
        <section className={styles.panel} aria-label="Lần tràng hạt 108 hạt">
          <h2>Lần tràng hạt</h2>
          <p>Hạt: <strong>{progress.beads % BEADS_PER_CYCLE}/108</strong> · Vòng thứ: <strong>{Math.floor(progress.beads / BEADS_PER_CYCLE) + 1}</strong></p>
          <div
            className={styles.beadPad}
            role="button"
            tabIndex={0}
            aria-label="Chạm hoặc vuốt lên xuống để lần một hạt"
            onPointerDown={(e) => setPointerStartY(e.clientY)}
            onPointerUp={(e) => {
              if (pointerStartY === null) return;
              const dy = Math.abs(e.clientY - pointerStartY);
              setPointerStartY(null);
              if (dy <= 6 || dy >= 24) bead();
            }}
            onPointerCancel={() => setPointerStartY(null)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                bead();
              }
            }}
          >
            📿 Chạm hoặc vuốt để lần một hạt
          </div>
          <p className={styles.muted}>Mỗi hạt là một nhịp chánh niệm. Hạt chỉ được ghi trên máy này.</p>
          <button type="button" className={styles.close} onClick={() => setPanel(null)}>Đóng</button>
        </section>
      )}

      {panel === "mo" && (
        <section className={styles.panel} aria-label="Gõ mõ và thắp hương">
          <h2>Gõ mõ &amp; thắp hương</h2>
          <p>Nhịp gợi ý 60 mỗi phút. Tiếng mõ chỉ phát trên máy của bạn.</p>
          <p>Nhịp mõ: <strong>{progress.taps % TAPS_PER_CYCLE}/108</strong> · Hương đã thắp: <strong>{progress.incense}</strong></p>
          <div className={styles.row}>
            <button type="button" onClick={tap}>🪵 Gõ mõ</button>
          </div>
          <div className={styles.row}>
            <button type="button" onClick={() => burn(1)}>1 nén (Tâm)</button>
            <button type="button" onClick={() => burn(3)}>3 nén (Tam bảo)</button>
            <button type="button" onClick={() => burn(5)}>5 nén (Ngũ phần)</button>
          </div>
          <button type="button" className={styles.close} onClick={() => setPanel(null)}>Đóng</button>
        </section>
      )}

      {panel === "scroll" && (
        <section className={styles.panel} aria-label="Vô tự chân kinh">
          <h2>Tàng Kinh Các</h2>
          <p className={styles.lore}>
            Ở Lôi Âm Tự, Ananda và Kasyapa trao cho Đường Tăng bộ kinh không chữ (Tây Du Ký, hồi 98).
            Kinh có chữ chỉ đến khi vượt đủ 81 nạn.
          </p>
          <ProgressRow label="Nạn đã qua" value={journey.nanDone} target={NAN_TOTAL} />
          <ProgressRow label="Tràng hạt" value={progress.beads % BEADS_PER_CYCLE} target={BEADS_PER_CYCLE} />
          <ProgressRow label="Nhịp mõ" value={progress.taps % TAPS_PER_CYCLE} target={TAPS_PER_CYCLE} />
          <ProgressRow
            label="Tĩnh tọa (phút)"
            value={Math.floor((progress.meditationSeconds % MEDITATION_SECONDS_PER_SCROLL) / 60)}
            target={MEDITATION_SECONDS_PER_SCROLL / 60}
          />
          <div className={styles.scroll}>
            {verse ? <p>{verse}</p> : <p className={styles.muted}>Cuộn kinh còn trống. Hoàn thành 108 hạt, 108 nhịp mõ hoặc 3 phút tĩnh tọa để mở lời nhắc đầu tiên.</p>}
          </div>
          <p className={styles.muted}>Các lời nhắc này do HIU TMC soạn và đã được chủ dự án duyệt. Đây không phải kinh văn.</p>
          <button type="button" className={styles.close} onClick={() => setPanel(null)}>Đóng</button>
        </section>
      )}

      {panel === "audio" && (
        <section className={styles.panel} aria-label="Thanh âm">
          <h2>Thanh âm</h2>
          <label className={styles.slider}>
            <span>Thiên nhiên (gió) · {Math.round(mix.ambient * 100)}%</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(mix.ambient * 100)}
              onChange={(e) => setMix((m) => ({ ...m, ambient: Number(e.target.value) / 100 }))}
            />
          </label>
          <label className={styles.slider}>
            <span>Pháp khí (mõ, hạt, chuông) · {Math.round(mix.sfx * 100)}%</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(mix.sfx * 100)}
              onChange={(e) => setMix((m) => ({ ...m, sfx: Number(e.target.value) / 100 }))}
            />
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={mix.ambientOn}
              onChange={(e) => setMix((m) => ({ ...m, ambientOn: e.target.checked }))}
            />
            Bật tiếng gió nền
          </label>
          <p className={styles.muted}>Kênh tụng kinh chưa có bản thu được duyệt, nên chưa có trong phiên bản này.</p>
          <button type="button" className={styles.close} onClick={() => setPanel(null)}>Đóng</button>
        </section>
      )}

      <div className={styles.toasts} role="status" aria-live="polite">
        {toasts.map((t) => (
          <p key={t.id}>{t.text}</p>
        ))}
      </div>

      {!ready && <span className={styles.sr}>Đang tải…</span>}
    </main>
  );
}

function ProgressRow({ label, value, target }: { label: string; value: number; target: number }) {
  const pct = Math.min(100, Math.round((value / target) * 100));
  return (
    <div className={styles.progressRow}>
      <span>{label}: {value}/{target}</span>
      <div className={styles.bar} aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
