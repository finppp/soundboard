"use client";

import { useState } from "react";

type Mode = "shot" | "hold";

function setAllModes(mode: Mode) {
  window.dispatchEvent(new CustomEvent<Mode>("soundboard:set-all-modes", { detail: mode }));
}

export default function FloatingSettings() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-6 left-6 flex flex-col items-start gap-3">
      {open && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-4 flex flex-col gap-3 shadow-2xl w-48">
          <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
            Playback mode
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => { setAllModes("shot"); setOpen(false); }}
              className="flex-1 py-2 border border-zinc-700 rounded-xl text-xs font-mono text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 transition-colors"
            >
              All shot
            </button>
            <button
              onClick={() => { setAllModes("hold"); setOpen(false); }}
              className="flex-1 py-2 border border-zinc-700 rounded-xl text-xs font-mono text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 transition-colors"
            >
              All hold
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        style={{ borderColor: open ? "#a1a1aa" : "#52525b", color: open ? "#a1a1aa" : "#71717a" }}
        className="w-14 h-14 rounded-full border-[3px] bg-zinc-950 flex items-center justify-center text-lg transition-colors hover:border-zinc-400 hover:text-zinc-300"
      >
        ⚙
      </button>
    </div>
  );
}
