"use client";

import { useState } from "react";

type Mode = "shot" | "hold";

const THEMES = [
  { id: "dark",   label: "Dark" },
  { id: "light",  label: "Light" },
  { id: "matrix", label: "Green / Pink" },
  { id: "moron",  label: "Moron Mode" },
] as const;

type ThemeId = (typeof THEMES)[number]["id"];

function setAllModes(mode: Mode) {
  window.dispatchEvent(new CustomEvent<Mode>("soundboard:set-all-modes", { detail: mode }));
}

function applyTheme(id: ThemeId) {
  localStorage.setItem("theme", id);
  document.documentElement.className = document.documentElement.className
    .replace(/\btheme-\S+/g, "") + " theme-" + id;
}

function currentTheme(): ThemeId {
  return (localStorage.getItem("theme") ?? "dark") as ThemeId;
}

export default function FloatingSettings() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeId>(() => {
    if (typeof window === "undefined") return "dark";
    return currentTheme();
  });

  const handleTheme = (id: ThemeId) => {
    applyTheme(id);
    setTheme(id);
  };

  return (
    <div className="fixed bottom-6 left-6 flex flex-col items-start gap-3 z-50">
      {open && (
        <div
          className="rounded-2xl p-4 flex flex-col gap-4 shadow-2xl w-52 border"
          style={{
            backgroundColor: "var(--c-panel-bg)",
            borderColor: "var(--c-panel-border)",
          }}
        >
          {/* Playback mode */}
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-mono uppercase tracking-widest"
              style={{ color: "var(--c-subtext)" }}>
              Playback mode
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => { setAllModes("shot"); setOpen(false); }}
                className="flex-1 py-2 border rounded-xl text-xs font-mono transition-colors"
                style={{
                  borderColor: "var(--c-panel-border)",
                  color: "var(--c-panel-text)",
                }}
              >
                All shot
              </button>
              <button
                onClick={() => { setAllModes("hold"); setOpen(false); }}
                className="flex-1 py-2 border rounded-xl text-xs font-mono transition-colors"
                style={{
                  borderColor: "var(--c-panel-border)",
                  color: "var(--c-panel-text)",
                }}
              >
                All hold
              </button>
            </div>
          </div>

          {/* Theme */}
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-mono uppercase tracking-widest"
              style={{ color: "var(--c-subtext)" }}>
              Theme
            </p>
            {THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => handleTheme(t.id)}
                className="text-left py-1.5 px-3 border rounded-lg text-xs font-mono transition-colors"
                style={{
                  borderColor: theme === t.id
                    ? "var(--c-brick-border-active)"
                    : "var(--c-panel-border)",
                  color: theme === t.id
                    ? "var(--c-brick-border-active)"
                    : "var(--c-panel-text)",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          borderColor: open ? "var(--c-brick-border-active)" : "var(--c-fab-border)",
          color: open ? "var(--c-brick-border-active)" : "var(--c-fab-color)",
          backgroundColor: "var(--c-bg)",
        }}
        className="w-14 h-14 rounded-full border-[3px] flex items-center justify-center text-lg transition-colors hover:opacity-80"
      >
        ⚙
      </button>
    </div>
  );
}
