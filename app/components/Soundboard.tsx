"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase, type DBSound } from "@/lib/supabase";
import { engine } from "@/lib/audioEngine";

const KEYS = "qwertyuiopasdfghjklzxcvbnm".split("");
const MAJOR_CHORD = [0, 4, 7];
type Mode = "shot" | "hold";

function hash(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return h;
}

function brickVariant(id: string) {
  const h  = hash(id);
  const h2 = (h * 1103515245 + 12345) & 0xffff;
  const rotate = ((h & 0xff) / 255) * 10 - 5;
  const extraH = ((h >> 4) & 0xff) % 44 - 16;
  const radius = 6 + ((h >> 8) & 0xff) % 32;
  const extraW = (h2 % 64) - 28;
  return { rotate: Number(rotate.toFixed(2)), extraH, radius, extraW };
}

function useWindowWidth() {
  const [width, setWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1024
  );
  useEffect(() => {
    const h = () => setWidth(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return width;
}

const Brick = memo(function Brick({
  sound, keyLabel, isActive, mode, widthPx,
  onPlayShot, onPlayChord, onHoldStart, onHoldEnd,
  onToggleMode, onDelete,
}: {
  sound: DBSound; keyLabel: string; isActive: boolean; mode: Mode;
  widthPx?: number;
  onPlayShot: (s: DBSound) => void;
  onPlayChord: (s: DBSound) => void;
  onHoldStart: (s: DBSound, chord: boolean) => void;
  onHoldEnd: (s: DBSound) => void;
  onToggleMode: (id: string) => void;
  onDelete: (s: DBSound) => void;
}) {
  const { rotate, extraH, radius, extraW } = brickVariant(sound.id);
  const holdActiveRef = useRef(false);
  const chordRef      = useRef(false);
  const longPressRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [confirming, setConfirming] = useState(false);

  const cancelLongPress = () => {
    if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    chordRef.current = e.shiftKey;

    longPressRef.current = setTimeout(() => {
      longPressRef.current = null;
      if (holdActiveRef.current) { onHoldEnd(sound); holdActiveRef.current = false; }
      setConfirming(true);
    }, 600);

    if (mode === "hold") {
      onHoldStart(sound, e.shiftKey);
      holdActiveRef.current = true;
    }
  };

  const handlePointerUp = () => {
    cancelLongPress();
    if (confirming) return;
    if (mode === "shot") {
      chordRef.current ? onPlayChord(sound) : onPlayShot(sound);
    } else if (mode === "hold" && holdActiveRef.current) {
      onHoldEnd(sound);
      holdActiveRef.current = false;
    }
  };

  const handlePointerCancel = () => { cancelLongPress(); };

  const brickW = widthPx ?? (176 + extraW);

  return (
    <div className="group relative">
      <button
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        style={{
          borderColor: isActive ? "var(--c-brick-border-active)" : "var(--c-brick-border)",
          borderWidth: "var(--c-brick-border-width, 3px)",
          borderStyle: "solid",
          transform: `rotate(${widthPx ? 0 : rotate}deg) translateY(${isActive ? 4 : 0}px)`,
          width: `${brickW}px`,
          height: `${72 + extraH}px`,
          borderRadius: `${radius}px`,
          background: "transparent",
          touchAction: "none",
        }}
        className="relative flex flex-col items-center justify-center select-none transition-colors duration-75"
      >
        <span
          style={{ color: isActive ? "var(--c-brick-text-active)" : "var(--c-brick-text)" }}
          className="text-sm font-semibold tracking-wide transition-colors duration-75 px-2 text-center leading-tight line-clamp-2"
        >
          {sound.name}
        </span>

        <span
          role="button"
          onClick={(e) => { e.stopPropagation(); onToggleMode(sound.id); }}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          className="absolute bottom-1.5 left-2.5 text-[10px] font-mono hover:opacity-70 transition-opacity"
          style={{ color: "var(--c-subtext)" }}
        >
          {mode}
        </span>

        {keyLabel && (
          <span className="absolute bottom-1.5 right-2.5 text-[10px] font-mono uppercase"
            style={{ color: "var(--c-subtext)" }}>
            {keyLabel}
          </span>
        )}
      </button>

      {/* Delete button — always visible on mobile, hover-only on desktop */}
      {!confirming && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onDelete(sound); }}
          style={{
            backgroundColor: "var(--c-bg)",
            borderColor: "var(--c-panel-border)",
            color: "var(--c-brick-text)",
          }}
          className="absolute -top-2 -right-2 w-6 h-6 rounded-full border text-[10px] flex items-center justify-center sm:opacity-0 sm:group-hover:opacity-100 hover:opacity-80 transition-opacity"
        >
          ×
        </button>
      )}

      {/* Long-press delete confirmation */}
      {confirming && (
        <div
          className="absolute inset-0 flex items-center justify-center gap-2 z-10"
          style={{
            borderRadius: `${radius}px`,
            background: "var(--c-panel-bg)",
            border: `2px solid var(--c-brick-border)`,
          }}
        >
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onDelete(sound); setConfirming(false); }}
            className="text-xs font-mono px-2 py-1 rounded border transition-colors"
            style={{ borderColor: "var(--c-brick-border)", color: "var(--c-brick-text)" }}
          >
            archive
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setConfirming(false); }}
            className="text-xs font-mono px-2 py-1 rounded border transition-colors"
            style={{ borderColor: "var(--c-panel-border)", color: "var(--c-subtext)" }}
          >
            cancel
          </button>
        </div>
      )}
    </div>
  );
});

function loadStorage<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback; }
  catch { return fallback; }
}

export default function Soundboard() {
  const [sounds, setSounds]       = useState<DBSound[]>([]);
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set());
  const [modes, setModes]         = useState<Record<string, Mode>>({});
  const soundsRef = useRef(sounds);
  soundsRef.current = sounds;
  const windowWidth = useWindowWidth();
  const isMobile = windowWidth < 640;

  useEffect(() => {
    setModes(loadStorage("sound-modes", {}));
  }, []);

  useEffect(() => {
    supabase.from("sounds").select("*").order("created_at").then(async ({ data }) => {
      if (!data) return;
      const active = data.filter((s) => !s.deleted_at);
      setSounds(active);
      for (const s of active) await engine.loadBuffer(s.id, s.url);
    });

    const channel = supabase.channel("sounds-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "sounds" },
        (p) => {
          const s = p.new as DBSound;
          setSounds((prev) => [...prev, s]);
          engine.loadBuffer(s.id, s.url);
        })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sounds" },
        (p) => {
          const s = p.new as DBSound;
          if (s.deleted_at) {
            setSounds((prev) => prev.filter((x) => x.id !== s.id));
            engine.removeBuffer(s.id);
          } else {
            setSounds((prev) =>
              prev.find((x) => x.id === s.id) ? prev : [...prev, s]
            );
            engine.loadBuffer(s.id, s.url);
          }
        })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "sounds" },
        (p) => {
          setSounds((prev) => prev.filter((s) => s.id !== p.old.id));
          engine.removeBuffer(p.old.id);
        })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const activate = useCallback(
    (id: string) => setActiveIds((p) => new Set(p).add(id)), []);
  const deactivate = useCallback(
    (id: string) => setActiveIds((p) => { const n = new Set(p); n.delete(id); return n; }), []);

  const onPlayShot = useCallback((sound: DBSound) => {
    engine.stop(sound.id);
    engine.play(sound.id, 0, engine.reverseEnabled, () => deactivate(sound.id));
    activate(sound.id);
  }, [activate, deactivate]);

  const onPlayChord = useCallback((sound: DBSound) => {
    engine.stop(sound.id);
    MAJOR_CHORD.forEach((interval, i) => {
      engine.play(sound.id, interval, engine.reverseEnabled,
        i === 0 ? () => deactivate(sound.id) : undefined);
    });
    activate(sound.id);
  }, [activate, deactivate]);

  const onHoldStart = useCallback((sound: DBSound, chord: boolean) => {
    engine.stop(sound.id);
    if (chord) {
      MAJOR_CHORD.forEach((interval) =>
        engine.play(sound.id, interval, engine.reverseEnabled));
    } else {
      engine.play(sound.id, 0, engine.reverseEnabled);
    }
    activate(sound.id);
  }, [activate]);

  const onHoldEnd = useCallback((sound: DBSound) => {
    engine.stop(sound.id);
    deactivate(sound.id);
  }, [deactivate]);

  const setAllModes = useCallback((mode: Mode) => {
    const next: Record<string, Mode> = {};
    soundsRef.current.forEach((s) => { next[s.id] = mode; });
    localStorage.setItem("sound-modes", JSON.stringify(next));
    setModes(next);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => setAllModes((e as CustomEvent<Mode>).detail);
    window.addEventListener("soundboard:set-all-modes", handler);
    return () => window.removeEventListener("soundboard:set-all-modes", handler);
  }, [setAllModes]);

  const toggleMode = useCallback((id: string) => {
    setModes((prev) => {
      const next: Record<string, Mode> = {
        ...prev, [id]: (prev[id] ?? "shot") === "shot" ? "hold" : "shot",
      };
      localStorage.setItem("sound-modes", JSON.stringify(next));
      return next;
    });
  }, []);

  const deleteSound = useCallback(async (sound: DBSound) => {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("sounds")
      .update({ deleted_at: now })
      .eq("id", sound.id);
    if (error) {
      console.error("Archive failed:", error.message);
      return;
    }
    setSounds((prev) => prev.filter((s) => s.id !== sound.id));
    engine.removeBuffer(sound.id);
  }, []);

  useEffect(() => {
    const isInput = (e: KeyboardEvent) =>
      (e.target as HTMLElement).tagName === "INPUT" ||
      (e.target as HTMLElement).tagName === "TEXTAREA";

    const handler = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === "Backspace" && !isInput(e)) {
        e.preventDefault();
        const last = soundsRef.current[soundsRef.current.length - 1];
        if (last) deleteSound(last);
        return;
      }
      const sound = soundsRef.current[KEYS.indexOf(e.key.toLowerCase())];
      if (sound) e.shiftKey ? onPlayChord(sound) : onPlayShot(sound);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onPlayShot, onPlayChord, deleteSound]);

  const bricksPerRow = isMobile ? 2 : 3;
  const mobileBrickW = isMobile
    ? Math.floor((windowWidth - 64 - 12) / 2)
    : undefined;
  const STAGGER_PX = isMobile ? 0 : (176 + 12) / 2;

  const rows = useMemo(() => {
    const result: DBSound[][] = [];
    for (let i = 0; i < sounds.length; i += bricksPerRow)
      result.push(sounds.slice(i, i + bricksPerRow));
    return result;
  }, [sounds, bricksPerRow]);

  if (sounds.length === 0) {
    return (
      <p className="text-xs font-mono py-8" style={{ color: "var(--c-brick-text)" }}>
        No sounds yet — press space to record.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} className="flex gap-3"
          style={{ marginLeft: rowIndex % 2 === 1 ? STAGGER_PX : 0 }}
        >
          {row.map((sound, i) => (
            <Brick
              key={sound.id}
              sound={sound}
              keyLabel={KEYS[rowIndex * bricksPerRow + i] ?? ""}
              isActive={activeIds.has(sound.id)}
              mode={modes[sound.id] ?? "shot"}
              widthPx={mobileBrickW}
              onPlayShot={onPlayShot}
              onPlayChord={onPlayChord}
              onHoldStart={onHoldStart}
              onHoldEnd={onHoldEnd}
              onToggleMode={toggleMode}
              onDelete={deleteSound}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
