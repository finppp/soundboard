"use client";

import { useState } from "react";
import { supabase, type DBSound } from "@/lib/supabase";
import { engine } from "@/lib/audioEngine";

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
  return (localStorage.getItem("theme") ?? "moron") as ThemeId;
}

export default function FloatingSettings() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeId>(() => {
    if (typeof window === "undefined") return "moron";
    return currentTheme();
  });
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archive, setArchive] = useState<DBSound[] | null>(null);
  const [archiveLoading, setArchiveLoading] = useState(false);

  const handleTheme = (id: ThemeId) => {
    applyTheme(id);
    setTheme(id);
  };

  const loadArchive = async () => {
    setArchiveLoading(true);
    const { data } = await supabase
      .from("sounds")
      .select("*")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });
    setArchive(data ?? []);
    setArchiveLoading(false);
  };

  const toggleArchive = () => {
    if (!archiveOpen && archive === null) loadArchive();
    setArchiveOpen((v) => !v);
  };

  const restoreSound = async (sound: DBSound) => {
    const { error } = await supabase
      .from("sounds")
      .update({ deleted_at: null })
      .eq("id", sound.id);
    if (error) { console.error("Restore failed:", error.message); return; }
    setArchive((prev) => prev?.filter((s) => s.id !== sound.id) ?? null);
    engine.loadBuffer(sound.id, sound.url);
  };

  return (
    <div
      className="fixed left-6 flex flex-col items-start gap-3 z-50"
      style={{ bottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))" }}
    >
      {open && (
        <div
          className="rounded-2xl p-4 flex flex-col gap-4 shadow-2xl w-52 border max-h-[70vh] overflow-y-auto"
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

          {/* Archive */}
          <div className="flex flex-col gap-2">
            <button
              onClick={toggleArchive}
              className="text-left text-[10px] font-mono uppercase tracking-widest flex items-center justify-between"
              style={{ color: "var(--c-subtext)" }}
            >
              <span>Archive</span>
              <span>{archiveOpen ? "▲" : "▼"}</span>
            </button>

            {archiveOpen && (
              <div className="flex flex-col gap-1">
                {archiveLoading && (
                  <p className="text-[9px] font-mono" style={{ color: "var(--c-subtext)" }}>
                    Loading…
                  </p>
                )}
                {!archiveLoading && archive?.length === 0 && (
                  <p className="text-[9px] font-mono" style={{ color: "var(--c-subtext)" }}>
                    Nothing archived yet.
                  </p>
                )}
                {archive?.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono truncate"
                      style={{ color: "var(--c-panel-text)" }}>
                      {s.name}
                    </span>
                    <button
                      onClick={() => restoreSound(s)}
                      className="text-[9px] font-mono px-1.5 py-0.5 rounded border shrink-0 transition-colors"
                      style={{
                        borderColor: "var(--c-panel-border)",
                        color: "var(--c-panel-text)",
                      }}
                    >
                      restore
                    </button>
                  </div>
                ))}
              </div>
            )}
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
