"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, type DBSound } from "@/lib/supabase";

const KEYS = "qwertyuiopasdfghjklzxcvbnm".split("");
type Mode = "shot" | "hold";

function Brick({
  sound,
  keyLabel,
  isActive,
  mode,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  onToggleMode,
  onDelete,
}: {
  sound: DBSound;
  keyLabel: string;
  isActive: boolean;
  mode: Mode;
  onPointerDown: (s: DBSound) => void;
  onPointerUp: (s: DBSound) => void;
  onPointerLeave: (s: DBSound) => void;
  onToggleMode: (id: string) => void;
  onDelete: (s: DBSound) => void;
}) {
  return (
    <div className="group relative">
      <button
        onPointerDown={() => onPointerDown(sound)}
        onPointerUp={() => onPointerUp(sound)}
        onPointerLeave={() => onPointerLeave(sound)}
        style={{
          borderColor: isActive ? "#e4e4e7" : "#52525b",
          transform: isActive ? "translateY(4px)" : "translateY(0)",
        }}
        className="relative flex flex-col items-center justify-center w-44 h-[4.5rem] rounded-2xl border-[3px] bg-transparent cursor-pointer select-none transition-all duration-75"
      >
        <span
          style={{ color: isActive ? "#e4e4e7" : "#71717a" }}
          className="text-sm font-semibold tracking-wide transition-colors duration-75 px-2 text-center leading-tight line-clamp-2"
        >
          {sound.name}
        </span>

        {/* Mode toggle — bottom left */}
        <span
          role="button"
          onClick={(e) => { e.stopPropagation(); onToggleMode(sound.id); }}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          className="absolute bottom-1.5 left-2.5 text-[10px] font-mono text-zinc-700 hover:text-zinc-400 transition-colors select-none"
        >
          {mode}
        </span>

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

function loadModes(): Record<string, Mode> {
  try { return JSON.parse(localStorage.getItem("sound-modes") ?? "{}"); }
  catch { return {}; }
}

function saveModes(modes: Record<string, Mode>) {
  localStorage.setItem("sound-modes", JSON.stringify(modes));
}

export default function Soundboard() {
  const [sounds, setSounds] = useState<DBSound[]>([]);
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set());
  const [modes, setModes] = useState<Record<string, Mode>>({});
  const audioCache = useRef<Map<string, HTMLAudioElement>>(new Map());

  useEffect(() => {
    setModes(loadModes());
  }, []);

  useEffect(() => {
    supabase
      .from("sounds")
      .select("*")
      .order("created_at")
      .then(({ data }) => { if (data) setSounds(data); });

    const channel = supabase
      .channel("sounds-inserts")
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

  const activate = (id: string) =>
    setActiveIds((prev) => new Set(prev).add(id));

  const deactivate = (id: string) =>
    setActiveIds((prev) => { const n = new Set(prev); n.delete(id); return n; });

  const playOneShot = useCallback((sound: DBSound) => {
    const audio = getAudio(sound);
    audio.currentTime = 0;
    audio.play().catch(() => {});
    activate(sound.id);
    audio.onended = () => deactivate(sound.id);
  }, []);

  const startHold = useCallback((sound: DBSound) => {
    const audio = getAudio(sound);
    audio.currentTime = 0;
    audio.play().catch(() => {});
    activate(sound.id);
    audio.onended = () => deactivate(sound.id);
  }, []);

  const stopHold = useCallback((sound: DBSound) => {
    const audio = audioCache.current.get(sound.id);
    if (audio) { audio.pause(); audio.currentTime = 0; }
    deactivate(sound.id);
  }, []);

  const handlePointerDown = useCallback((sound: DBSound) => {
    const mode = modes[sound.id] ?? "shot";
    if (mode === "shot") playOneShot(sound);
    else startHold(sound);
  }, [modes, playOneShot, startHold]);

  const handlePointerUp = useCallback((sound: DBSound) => {
    if ((modes[sound.id] ?? "shot") === "hold") stopHold(sound);
  }, [modes, stopHold]);

  const handlePointerLeave = useCallback((sound: DBSound) => {
    if ((modes[sound.id] ?? "shot") === "hold") stopHold(sound);
  }, [modes, stopHold]);

  const toggleMode = useCallback((id: string) => {
    setModes((prev) => {
      const next: Record<string, Mode> = { ...prev, [id]: (prev[id] ?? "shot") === "shot" ? "hold" : "shot" };
      saveModes(next);
      return next;
    });
  }, []);

  const deleteSound = useCallback(async (sound: DBSound) => {
    const { error } = await supabase.from("sounds").delete().eq("id", sound.id);
    if (error) { console.error("Delete failed:", error.message); return; }

    // Remove from storage — extract path after bucket name
    try {
      const url = new URL(sound.url);
      const marker = "/object/public/sounds/";
      const idx = url.pathname.indexOf(marker);
      if (idx !== -1) {
        const filePath = decodeURIComponent(url.pathname.slice(idx + marker.length));
        await supabase.storage.from("sounds").remove([filePath]);
      }
    } catch { /* storage delete is best-effort */ }

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
      if (sound) playOneShot(sound);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [sounds, playOneShot, deleteSound]);

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
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerLeave}
              onToggleMode={toggleMode}
              onDelete={deleteSound}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
