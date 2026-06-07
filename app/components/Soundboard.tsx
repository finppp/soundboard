"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SOUNDS, type Sound } from "../sounds";

function Brick({
  sound,
  isActive,
  onPlay,
}: {
  sound: Sound;
  isActive: boolean;
  onPlay: (s: Sound) => void;
}) {
  return (
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
        className="text-sm font-semibold tracking-wide transition-colors duration-75"
      >
        {sound.label}
      </span>
      <span className="absolute bottom-1.5 right-2.5 text-[10px] font-mono text-zinc-700 uppercase">
        {sound.key}
      </span>
    </button>
  );
}

export default function Soundboard() {
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set());
  const audioCache = useRef<Map<string, HTMLAudioElement>>(new Map());

  const play = useCallback((sound: Sound) => {
    let audio = audioCache.current.get(sound.id);
    if (!audio) {
      audio = new Audio(sound.src);
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

  useEffect(() => {
    const keyMap = new Map(SOUNDS.map((s) => [s.key, s]));
    const handler = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const sound = keyMap.get(e.key.toLowerCase());
      if (sound) play(sound);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [play]);

  const BRICKS_PER_ROW = 3;
  const STAGGER_PX = (176 + 12) / 2; // (w-44 + gap-3) / 2

  const rows: Sound[][] = [];
  for (let i = 0; i < SOUNDS.length; i += BRICKS_PER_ROW) {
    rows.push(SOUNDS.slice(i, i + BRICKS_PER_ROW));
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-10 p-8">
      <h1 className="text-xs font-mono tracking-[0.3em] text-zinc-600 uppercase">
        Soundboard
      </h1>
      <div className="flex flex-col gap-3">
        {rows.map((row, rowIndex) => (
          <div
            key={rowIndex}
            className="flex gap-3"
            style={{ marginLeft: rowIndex % 2 === 1 ? STAGGER_PX : 0 }}
          >
            {row.map((sound) => (
              <Brick
                key={sound.id}
                sound={sound}
                isActive={activeIds.has(sound.id)}
                onPlay={play}
              />
            ))}
          </div>
        ))}
      </div>
      <p className="text-xs font-mono text-zinc-700">
        public/sounds/1.mp3 – 12.mp3
      </p>
    </div>
  );
}
