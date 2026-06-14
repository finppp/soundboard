"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, type DBSound } from "@/lib/supabase";
import { engine } from "@/lib/audioEngine";

const KEYS = "qwertyuiopasdfghjklzxcvbnm".split("");
const MAJOR_CHORD = [0, 4, 7]; // root, major third, perfect fifth
type Mode = "shot" | "hold";

function hash(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return h;
}

function brickVariant(id: string) {
  const h = hash(id);
  const rotate = (((h & 0xff) / 255) * 2.8 - 1.4).toFixed(2);
  const extraH  = ((h >> 4) & 0xf) % 16 - 6;
  const radius  = 14 + ((h >> 8) & 0xf) % 10;
  return { rotate: Number(rotate), extraH, radius };
}

const SEMITONES_PER_PX = 12 / 60;
const DRAG_THRESHOLD = 6;

function octaveLabel(semitones: number) {
  const oct = semitones / 12;
  if (oct === 0) return "0";
  return (oct > 0 ? "+" : "") + oct + " oct";
}

function Brick({
  sound, keyLabel, isActive, mode, transpose,
  onPlayShot, onPlayChord, onHoldStart, onHoldEnd,
  onTransposeFinal, onToggleMode, onDelete,
}: {
  sound: DBSound; keyLabel: string; isActive: boolean;
  mode: Mode; transpose: number;
  onPlayShot: (s: DBSound) => void;
  onPlayChord: (s: DBSound) => void;
  onHoldStart: (s: DBSound, chord: boolean) => void;
  onHoldEnd: (s: DBSound, chord: boolean) => void;
  onTransposeFinal: (id: string, semitones: number) => void;
  onToggleMode: (id: string) => void;
  onDelete: (s: DBSound) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [liveSemitones, setLiveSemitones] = useState(transpose);
  const { rotate, extraH, radius } = brickVariant(sound.id);

  const startRef      = useRef<{ y: number; semitones: number } | null>(null);
  const isDraggingRef = useRef(false);
  const holdActiveRef = useRef(false);
  const chordRef      = useRef(false);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    startRef.current = { y: e.clientY, semitones: transpose };
    isDraggingRef.current = false;
    chordRef.current = e.shiftKey;
    setLiveSemitones(transpose);

    if (mode === "hold") {
      onHoldStart(sound, e.shiftKey);
      holdActiveRef.current = true;
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!startRef.current) return;
    const dy = startRef.current.y - e.clientY;
    if (Math.abs(dy) >= DRAG_THRESHOLD) {
      if (!isDraggingRef.current) {
        isDraggingRef.current = true;
        if (holdActiveRef.current) {
          onHoldEnd(sound, chordRef.current);
          holdActiveRef.current = false;
        }
        setDragging(true);
      }
      const raw = startRef.current.semitones + dy * SEMITONES_PER_PX;
      const snapped = Math.round(raw / 12) * 12;
      setLiveSemitones(Math.max(-24, Math.min(24, snapped)));
    }
  };

  const handlePointerUp = () => {
    if (isDraggingRef.current) {
      onTransposeFinal(sound.id, liveSemitones);
    } else {
      if (mode === "shot") {
        chordRef.current ? onPlayChord(sound) : onPlayShot(sound);
      } else if (mode === "hold" && holdActiveRef.current) {
        onHoldEnd(sound, chordRef.current);
        holdActiveRef.current = false;
      }
    }
    startRef.current = null;
    isDraggingRef.current = false;
    setDragging(false);
  };

  return (
    <div className="group relative">
      <button
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          borderColor: isActive
            ? "var(--c-brick-border-active)"
            : "var(--c-brick-border)",
          borderWidth: "var(--c-brick-border-width, 3px)",
          borderStyle: "solid",
          transform: `rotate(${rotate}deg) translateY(${isActive && !dragging ? 4 : 0}px)`,
          cursor: dragging ? "ns-resize" : "pointer",
          height: `${72 + extraH}px`,
          borderRadius: `${radius}px`,
          background: "transparent",
        }}
        className="relative flex flex-col items-center justify-center w-44 select-none transition-colors duration-75"
      >
        {dragging ? (
          <span className="text-base font-mono font-bold"
            style={{ color: "var(--c-brick-text-active)" }}>
            {octaveLabel(liveSemitones)}
          </span>
        ) : (
          <span
            style={{ color: isActive ? "var(--c-brick-text-active)" : "var(--c-brick-text)" }}
            className="text-sm font-semibold tracking-wide transition-colors duration-75 px-2 text-center leading-tight line-clamp-2"
          >
            {sound.name}
          </span>
        )}

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

        {!dragging && transpose !== 0 && (
          <span className="absolute top-1.5 left-2.5 text-[9px] font-mono"
            style={{ color: "var(--c-subtext)" }}>
            {octaveLabel(transpose)}
          </span>
        )}

        {keyLabel && (
          <span className="absolute bottom-1.5 right-2.5 text-[10px] font-mono uppercase"
            style={{ color: "var(--c-subtext)" }}>
            {keyLabel}
          </span>
        )}
      </button>

      <button
        onClick={(e) => { e.stopPropagation(); onDelete(sound); }}
        style={{
          backgroundColor: "var(--c-bg)",
          borderColor: "var(--c-panel-border)",
          color: "var(--c-brick-text)",
        }}
        className="absolute -top-2 -right-2 w-5 h-5 rounded-full border text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 hover:opacity-80 transition-opacity"
      >
        ×
      </button>
    </div>
  );
}

function loadStorage<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback; }
  catch { return fallback; }
}

export default function Soundboard() {
  const [sounds, setSounds] = useState<DBSound[]>([]);
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set());
  const [modes, setModes] = useState<Record<string, Mode>>({});
  const [transposes, setTransposes] = useState<Record<string, number>>({});

  useEffect(() => {
    setModes(loadStorage("sound-modes", {}));
    setTransposes(loadStorage("sound-transposes", {}));
  }, []);

  // Load all sounds into the audio engine buffer cache
  useEffect(() => {
    sounds.forEach((s) => engine.loadBuffer(s.id, s.url));
  }, [sounds]);

  useEffect(() => {
    supabase.from("sounds").select("*").order("created_at")
      .then(({ data }) => { if (data) setSounds(data); });

    const channel = supabase.channel("sounds-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "sounds" },
        (p) => {
          const s = p.new as DBSound;
          setSounds((prev) => [...prev, s]);
          engine.loadBuffer(s.id, s.url);
        })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "sounds" },
        (p) => setSounds((prev) => prev.filter((s) => s.id !== p.old.id)))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const activate   = (id: string) => setActiveIds((p) => new Set(p).add(id));
  const deactivate = (id: string) =>
    setActiveIds((p) => { const n = new Set(p); n.delete(id); return n; });

  const onPlayShot = useCallback((sound: DBSound) => {
    const semitones = transposes[sound.id] ?? 0;
    engine.stop(sound.id);
    engine.play(sound.id, semitones, engine.reverseEnabled, () => deactivate(sound.id));
    activate(sound.id);
  }, [transposes]);

  // Chord: play root + major third + perfect fifth simultaneously via the engine.
  // All 3 sources are started in the same microtask — no latency gap.
  const onPlayChord = useCallback((sound: DBSound) => {
    const base = transposes[sound.id] ?? 0;
    engine.stop(sound.id);
    MAJOR_CHORD.forEach((interval, i) => {
      engine.play(
        sound.id,
        base + interval,
        engine.reverseEnabled,
        i === 0 ? () => deactivate(sound.id) : undefined,
      );
    });
    activate(sound.id);
  }, [transposes]);

  const onHoldStart = useCallback((sound: DBSound, chord: boolean) => {
    const base = transposes[sound.id] ?? 0;
    engine.stop(sound.id);
    if (chord) {
      MAJOR_CHORD.forEach((interval) => {
        engine.play(sound.id, base + interval, engine.reverseEnabled);
      });
    } else {
      engine.play(sound.id, base, engine.reverseEnabled);
    }
    activate(sound.id);
  }, [transposes]);

  const onHoldEnd = useCallback((sound: DBSound) => {
    engine.stop(sound.id);
    deactivate(sound.id);
  }, []);

  const onTransposeFinal = useCallback((id: string, semitones: number) => {
    setTransposes((prev) => {
      const next = { ...prev, [id]: semitones };
      localStorage.setItem("sound-transposes", JSON.stringify(next));
      return next;
    });
  }, []);

  const setAllModes = useCallback((mode: Mode) => {
    const next: Record<string, Mode> = {};
    sounds.forEach((s) => { next[s.id] = mode; });
    localStorage.setItem("sound-modes", JSON.stringify(next));
    setModes(next);
  }, [sounds]);

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
    const { error } = await supabase.from("sounds").delete().eq("id", sound.id);
    if (error) { console.error("Delete failed:", error.message); return; }
    try {
      const url = new URL(sound.url);
      const marker = "/object/public/sounds/";
      const idx = url.pathname.indexOf(marker);
      if (idx !== -1) {
        const filePath = decodeURIComponent(url.pathname.slice(idx + marker.length));
        await supabase.storage.from("sounds").remove([filePath]);
      }
    } catch { /* best-effort */ }
    setSounds((prev) => prev.filter((s) => s.id !== sound.id));
    engine.removeBuffer(sound.id);
  }, []);

  useEffect(() => {
    const isInput = (e: KeyboardEvent) =>
      (e.target as HTMLElement).tagName === "INPUT" ||
      (e.target as HTMLElement).tagName === "TEXTAREA";

    const keyMap = new Map(sounds.map((s, i) => [KEYS[i], s]));
    const handler = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === "Backspace" && !isInput(e)) {
        e.preventDefault();
        const last = sounds[sounds.length - 1];
        if (last) deleteSound(last);
        return;
      }
      const sound = keyMap.get(e.key.toLowerCase());
      if (sound) {
        e.shiftKey ? onPlayChord(sound) : onPlayShot(sound);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [sounds, onPlayShot, onPlayChord, deleteSound]);

  const BRICKS_PER_ROW = 3;
  const STAGGER_PX = (176 + 12) / 2;
  const rows: DBSound[][] = [];
  for (let i = 0; i < sounds.length; i += BRICKS_PER_ROW) {
    rows.push(sounds.slice(i, i + BRICKS_PER_ROW));
  }

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
              keyLabel={KEYS[rowIndex * BRICKS_PER_ROW + i] ?? ""}
              isActive={activeIds.has(sound.id)}
              mode={modes[sound.id] ?? "shot"}
              transpose={transposes[sound.id] ?? 0}
              onPlayShot={onPlayShot}
              onPlayChord={onPlayChord}
              onHoldStart={onHoldStart}
              onHoldEnd={onHoldEnd}
              onTransposeFinal={onTransposeFinal}
              onToggleMode={toggleMode}
              onDelete={deleteSound}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
