"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, type DBSound } from "@/lib/supabase";

const KEYS = "qwertyuiopasdfghjklzxcvbnm".split("");
type Mode = "shot" | "hold";

function hash(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return h;
}

function brickVariant(id: string) {
  const h = hash(id);
  const rotate = (((h & 0xff) / 255) * 2.8 - 1.4).toFixed(2);   // -1.4 to +1.4 deg
  const extraH  = ((h >> 4) & 0xf) % 16 - 6;                     // -6 to +9 px
  const radius  = 14 + ((h >> 8) & 0xf) % 10;                    // 14 to 23 px
  return { rotate: Number(rotate), extraH, radius };
}

const SEMITONES_PER_PX = 12 / 60; // 60px per octave
const DRAG_THRESHOLD = 6;

function octaveLabel(semitones: number) {
  const oct = semitones / 12;
  if (oct === 0) return "0";
  return (oct > 0 ? "+" : "") + oct + " oct";
}

function Brick({
  sound,
  keyLabel,
  isActive,
  mode,
  transpose,
  onPlayShot,
  onHoldStart,
  onHoldEnd,
  onTransposeFinal,
  onToggleMode,
  onDelete,
}: {
  sound: DBSound;
  keyLabel: string;
  isActive: boolean;
  mode: Mode;
  transpose: number;
  onPlayShot: (s: DBSound) => void;
  onHoldStart: (s: DBSound) => void;
  onHoldEnd: (s: DBSound) => void;
  onTransposeFinal: (id: string, semitones: number) => void;
  onToggleMode: (id: string) => void;
  onDelete: (s: DBSound) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [liveSemitones, setLiveSemitones] = useState(transpose);
  const { rotate, extraH, radius } = brickVariant(sound.id);

  const startRef = useRef<{ y: number; semitones: number } | null>(null);
  const isDraggingRef = useRef(false);
  const holdActiveRef = useRef(false);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    startRef.current = { y: e.clientY, semitones: transpose };
    isDraggingRef.current = false;
    setLiveSemitones(transpose);

    if (mode === "hold") {
      onHoldStart(sound);
      holdActiveRef.current = true;
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!startRef.current) return;
    const dy = startRef.current.y - e.clientY; // up = positive

    if (Math.abs(dy) >= DRAG_THRESHOLD) {
      if (!isDraggingRef.current) {
        isDraggingRef.current = true;
        // cancel hold if drag starts
        if (holdActiveRef.current) {
          onHoldEnd(sound);
          holdActiveRef.current = false;
        }
        setDragging(true);
      }
      const raw = startRef.current.semitones + dy * SEMITONES_PER_PX;
      const snapped = Math.round(raw / 12) * 12; // snap to whole octaves
      setLiveSemitones(Math.max(-24, Math.min(24, snapped)));
    }
  };

  const handlePointerUp = () => {
    if (isDraggingRef.current) {
      onTransposeFinal(sound.id, liveSemitones);
    } else {
      if (mode === "shot") onPlayShot(sound);
      if (mode === "hold" && holdActiveRef.current) {
        onHoldEnd(sound);
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
          borderColor: isActive ? "#e4e4e7" : "#52525b",
          transform: `rotate(${rotate}deg) translateY(${isActive && !dragging ? 4 : 0}px)`,
          cursor: dragging ? "ns-resize" : "pointer",
          height: `${72 + extraH}px`,
          borderRadius: `${radius}px`,
        }}
        className="relative flex flex-col items-center justify-center w-44 border-[3px] bg-transparent select-none transition-colors duration-75"
      >
        {dragging ? (
          <span className="text-base font-mono font-bold text-zinc-300">
            {octaveLabel(liveSemitones)}
          </span>
        ) : (
          <span
            style={{ color: isActive ? "#e4e4e7" : "#71717a" }}
            className="text-sm font-semibold tracking-wide transition-colors duration-75 px-2 text-center leading-tight line-clamp-2"
          >
            {sound.name}
          </span>
        )}

        {/* mode toggle — bottom left */}
        <span
          role="button"
          onClick={(e) => { e.stopPropagation(); onToggleMode(sound.id); }}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          className="absolute bottom-1.5 left-2.5 text-[10px] font-mono text-zinc-700 hover:text-zinc-400 transition-colors"
        >
          {mode}
        </span>

        {/* transpose indicator — shows only when non-zero and not dragging */}
        {!dragging && transpose !== 0 && (
          <span className="absolute top-1.5 left-2.5 text-[9px] font-mono text-zinc-700">
            {octaveLabel(transpose)}
          </span>
        )}

        {keyLabel && (
          <span className="absolute bottom-1.5 right-2.5 text-[10px] font-mono text-zinc-700 uppercase">
            {keyLabel}
          </span>
        )}
      </button>

      <button
        onClick={(e) => { e.stopPropagation(); onDelete(sound); }}
        className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-zinc-900 border border-zinc-700 text-zinc-500 text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 hover:text-zinc-200 hover:border-zinc-500 transition-opacity"
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
  const audioCache = useRef<Map<string, HTMLAudioElement>>(new Map());

  useEffect(() => {
    setModes(loadStorage("sound-modes", {}));
    setTransposes(loadStorage("sound-transposes", {}));
  }, []);

  useEffect(() => {
    supabase
      .from("sounds")
      .select("*")
      .order("created_at")
      .then(({ data }) => { if (data) setSounds(data); });

    const channel = supabase
      .channel("sounds-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "sounds" },
        (payload) => setSounds((prev) => [...prev, payload.new as DBSound]))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "sounds" },
        (payload) => setSounds((prev) => prev.filter((s) => s.id !== payload.old.id)))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const getAudio = (sound: DBSound) => {
    let audio = audioCache.current.get(sound.id);
    if (!audio) {
      audio = new Audio(sound.url);
      audioCache.current.set(sound.id, audio);
    }
    return audio;
  };

  const activate = (id: string) => setActiveIds((p) => new Set(p).add(id));
  const deactivate = (id: string) =>
    setActiveIds((p) => { const n = new Set(p); n.delete(id); return n; });

  const playWithRate = useCallback((sound: DBSound, semitones: number) => {
    const audio = getAudio(sound);
    audio.currentTime = 0;
    audio.playbackRate = Math.pow(2, semitones / 12);
    audio.play().catch(() => {});
    activate(sound.id);
    audio.onended = () => deactivate(sound.id);
  }, []);

  const onPlayShot = useCallback((sound: DBSound) => {
    playWithRate(sound, transposes[sound.id] ?? 0);
  }, [transposes, playWithRate]);

  const onHoldStart = useCallback((sound: DBSound) => {
    playWithRate(sound, transposes[sound.id] ?? 0);
  }, [transposes, playWithRate]);

  const onHoldEnd = useCallback((sound: DBSound) => {
    const audio = audioCache.current.get(sound.id);
    if (audio) { audio.pause(); audio.currentTime = 0; }
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
        ...prev,
        [id]: (prev[id] ?? "shot") === "shot" ? "hold" : "shot",
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
    audioCache.current.delete(sound.id);
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
      if (sound) onPlayShot(sound);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [sounds, onPlayShot, deleteSound]);

  const BRICKS_PER_ROW = 3;
  const STAGGER_PX = (176 + 12) / 2;
  const rows: DBSound[][] = [];
  for (let i = 0; i < sounds.length; i += BRICKS_PER_ROW) {
    rows.push(sounds.slice(i, i + BRICKS_PER_ROW));
  }

  if (sounds.length === 0) {
    return (
      <p className="text-xs font-mono text-zinc-700 py-8">
        No sounds yet — press space to record.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row, rowIndex) => (
        <div
          key={rowIndex}
          className="flex gap-3"
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
