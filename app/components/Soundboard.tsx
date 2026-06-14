"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, type DBSound } from "@/lib/supabase";

const KEYS = "qwertyuiopasdfghjklzxcvbnm".split("");

function Brick({
  sound,
  keyLabel,
  isActive,
  onPlay,
  onDelete,
}: {
  sound: DBSound;
  keyLabel: string;
  isActive: boolean;
  onPlay: (s: DBSound) => void;
  onDelete: (s: DBSound) => void;
}) {
  return (
    <div className="group relative">
      <button
        onClick={() => onPlay(sound)}
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

export default function Soundboard() {
  const [sounds, setSounds] = useState<DBSound[]>([]);
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set());
  const audioCache = useRef<Map<string, HTMLAudioElement>>(new Map());

  useEffect(() => {
    supabase
      .from("sounds")
      .select("*")
      .order("created_at")
      .then(({ data }) => {
        if (data) setSounds(data);
      });

    const channel = supabase
      .channel("sounds-inserts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sounds" },
        (payload) => setSounds((prev) => [...prev, payload.new as DBSound])
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "sounds" },
        (payload) => setSounds((prev) => prev.filter((s) => s.id !== payload.old.id))
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const play = useCallback((sound: DBSound) => {
    let audio = audioCache.current.get(sound.id);
    if (!audio) {
      audio = new Audio(sound.url);
      audioCache.current.set(sound.id, audio);
    }
    audio.currentTime = 0;
    audio.play().catch(() => {});
    setActiveIds((prev) => new Set(prev).add(sound.id));
    audio.onended = () =>
      setActiveIds((prev) => {
        const next = new Set(prev);
        next.delete(sound.id);
        return next;
      });
  }, []);

  const deleteSound = useCallback(async (sound: DBSound) => {
    const filename = sound.url.split("/").pop();
    if (filename) await supabase.storage.from("sounds").remove([filename]);
    await supabase.from("sounds").delete().eq("id", sound.id);
    setSounds((prev) => prev.filter((s) => s.id !== sound.id));
    audioCache.current.delete(sound.id);
  }, []);

  useEffect(() => {
    const keyMap = new Map(sounds.map((s, i) => [KEYS[i], s]));
    const handler = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const sound = keyMap.get(e.key.toLowerCase());
      if (sound) play(sound);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [sounds, play]);

  const BRICKS_PER_ROW = 3;
  const STAGGER_PX = (176 + 12) / 2;
  const rows: DBSound[][] = [];
  for (let i = 0; i < sounds.length; i += BRICKS_PER_ROW) {
    rows.push(sounds.slice(i, i + BRICKS_PER_ROW));
  }

  if (sounds.length === 0) {
    return (
      <p className="text-xs font-mono text-zinc-700 py-8">
        No sounds yet — add one below.
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
              onPlay={play}
              onDelete={deleteSound}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
