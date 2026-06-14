"use client";

import { useState, useEffect } from "react";
import { engine, DEFAULT_EFFECTS, type EffectSettings } from "@/lib/audioEngine";

function Toggle({
  on, onToggle, label,
}: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <span className="text-[11px] font-bold tracking-widest uppercase"
        style={{ color: "var(--c-panel-text)" }}>
        {label}
      </span>
      <button
        onClick={onToggle}
        style={{
          background: on ? "var(--c-brick-border-active)" : "transparent",
          borderColor: on ? "var(--c-brick-border-active)" : "var(--c-panel-border)",
          color: on ? "var(--c-bg)" : "var(--c-panel-text)",
        }}
        className="text-[9px] font-mono px-2 py-0.5 rounded border transition-colors"
      >
        {on ? "ON" : "OFF"}
      </button>
    </div>
  );
}

function Knob({
  label, value, min, max, step, onChange, fmt,
}: {
  label: string; value: number; min: number; max: number;
  step: number; onChange: (v: number) => void; fmt: (v: number) => string;
}) {
  return (
    <div className="flex items-center gap-2 mb-1">
      <span className="text-[9px] font-mono w-14 shrink-0"
        style={{ color: "var(--c-subtext)" }}>
        {label}
      </span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 h-1 appearance-none rounded cursor-pointer"
        style={{ accentColor: "var(--c-brick-border-active)" }}
      />
      <span className="text-[9px] font-mono w-10 text-right shrink-0"
        style={{ color: "var(--c-panel-text)" }}>
        {fmt(value)}
      </span>
    </div>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div className="border rounded-xl p-3 flex flex-col"
      style={{ borderColor: "var(--c-panel-border)" }}>
      {children}
    </div>
  );
}

const STORAGE_KEY = "fx-settings";

function loadFx(): EffectSettings {
  try {
    return { ...DEFAULT_EFFECTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") };
  } catch {
    return DEFAULT_EFFECTS;
  }
}

export default function EffectsPanel() {
  const [open, setOpen] = useState(false);
  const [fx, setFx] = useState<EffectSettings>(DEFAULT_EFFECTS);

  // Load persisted settings on mount and apply to engine
  useEffect(() => {
    const saved = loadFx();
    setFx(saved);
    engine.applySettings(saved);
  }, []);

  const update = (patch: Partial<EffectSettings>) => {
    setFx((prev) => {
      const next = { ...prev, ...patch } as EffectSettings;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      engine.applySettings(next);
      return next;
    });
  };

  const p = <K extends keyof EffectSettings>(key: K) =>
    (sub: Partial<EffectSettings[K]>) =>
      update({ [key]: { ...(fx[key] as object), ...sub } } as Partial<EffectSettings>);

  const filterTypes: BiquadFilterType[] = ["lowpass", "highpass", "bandpass", "notch"];

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 z-50">
      {open && (
        <div
          className="rounded-2xl p-4 shadow-2xl border w-80 max-h-[80vh] overflow-y-auto flex flex-col gap-3"
          style={{ backgroundColor: "var(--c-panel-bg)", borderColor: "var(--c-panel-border)" }}
        >
          {/* Reverb */}
          <Section>
            <Toggle label="Reverb" on={fx.reverb.enabled}
              onToggle={() => p("reverb")({ enabled: !fx.reverb.enabled })} />
            <Knob label="Size" value={fx.reverb.size} min={0.05} max={1} step={0.01}
              onChange={(v) => p("reverb")({ size: v })} fmt={(v) => v.toFixed(2)} />
            <Knob label="Mix" value={fx.reverb.mix} min={0} max={1} step={0.01}
              onChange={(v) => p("reverb")({ mix: v })} fmt={(v) => Math.round(v * 100) + "%"} />
          </Section>

          {/* Delay */}
          <Section>
            <Toggle label="Delay" on={fx.delay.enabled}
              onToggle={() => p("delay")({ enabled: !fx.delay.enabled })} />
            <Knob label="Time" value={fx.delay.time} min={0.05} max={1.5} step={0.01}
              onChange={(v) => p("delay")({ time: v })} fmt={(v) => v.toFixed(2) + "s"} />
            <Knob label="Feedback" value={fx.delay.feedback} min={0} max={0.95} step={0.01}
              onChange={(v) => p("delay")({ feedback: v })} fmt={(v) => v.toFixed(2)} />
            <Knob label="Mix" value={fx.delay.mix} min={0} max={1} step={0.01}
              onChange={(v) => p("delay")({ mix: v })} fmt={(v) => Math.round(v * 100) + "%"} />
          </Section>

          {/* Distortion */}
          <Section>
            <Toggle label="Distortion" on={fx.distortion.enabled}
              onToggle={() => p("distortion")({ enabled: !fx.distortion.enabled })} />
            <Knob label="Amount" value={fx.distortion.amount} min={1} max={200} step={1}
              onChange={(v) => p("distortion")({ amount: v })} fmt={(v) => Math.round(v).toString()} />
          </Section>

          {/* Filter */}
          <Section>
            <Toggle label="Filter" on={fx.filter.enabled}
              onToggle={() => p("filter")({ enabled: !fx.filter.enabled })} />
            {/* Filter type buttons */}
            <div className="flex gap-1 mb-2">
              {filterTypes.map((t) => (
                <button
                  key={t}
                  onClick={() => p("filter")({ type: t })}
                  style={{
                    borderColor: fx.filter.type === t
                      ? "var(--c-brick-border-active)"
                      : "var(--c-panel-border)",
                    color: fx.filter.type === t
                      ? "var(--c-brick-border-active)"
                      : "var(--c-panel-text)",
                  }}
                  className="flex-1 py-0.5 text-[8px] font-mono border rounded transition-colors"
                >
                  {t.replace("pass", "").replace("notch", "notch").toUpperCase()}
                </button>
              ))}
            </div>
            <Knob label="Cutoff" value={fx.filter.freq} min={80} max={20000} step={10}
              onChange={(v) => p("filter")({ freq: v })}
              fmt={(v) => v >= 1000 ? (v / 1000).toFixed(1) + "k" : Math.round(v) + "Hz"} />
            <Knob label="Resonance" value={fx.filter.q} min={0.1} max={20} step={0.1}
              onChange={(v) => p("filter")({ q: v })} fmt={(v) => v.toFixed(1)} />
          </Section>

          {/* Compressor */}
          <Section>
            <Toggle label="Compressor" on={fx.compressor.enabled}
              onToggle={() => p("compressor")({ enabled: !fx.compressor.enabled })} />
            <Knob label="Threshold" value={fx.compressor.threshold} min={-60} max={0} step={1}
              onChange={(v) => p("compressor")({ threshold: v })} fmt={(v) => v + "dB"} />
            <Knob label="Ratio" value={fx.compressor.ratio} min={1} max={20} step={0.5}
              onChange={(v) => p("compressor")({ ratio: v })} fmt={(v) => v.toFixed(1) + ":1"} />
          </Section>

          {/* Tremolo */}
          <Section>
            <Toggle label="Tremolo" on={fx.tremolo.enabled}
              onToggle={() => p("tremolo")({ enabled: !fx.tremolo.enabled })} />
            <Knob label="Rate" value={fx.tremolo.rate} min={0.1} max={20} step={0.1}
              onChange={(v) => p("tremolo")({ rate: v })} fmt={(v) => v.toFixed(1) + "Hz"} />
            <Knob label="Depth" value={fx.tremolo.depth} min={0} max={1} step={0.01}
              onChange={(v) => p("tremolo")({ depth: v })} fmt={(v) => Math.round(v * 100) + "%"} />
          </Section>

          {/* Chorus */}
          <Section>
            <Toggle label="Chorus" on={fx.chorus.enabled}
              onToggle={() => p("chorus")({ enabled: !fx.chorus.enabled })} />
            <Knob label="Rate" value={fx.chorus.rate} min={0.1} max={8} step={0.1}
              onChange={(v) => p("chorus")({ rate: v })} fmt={(v) => v.toFixed(1) + "Hz"} />
            <Knob label="Depth" value={fx.chorus.depth} min={0.001} max={0.02} step={0.001}
              onChange={(v) => p("chorus")({ depth: v })}
              fmt={(v) => Math.round(v * 1000) + "ms"} />
          </Section>

          {/* Pan */}
          <Section>
            <span className="text-[11px] font-bold tracking-widest uppercase mb-2"
              style={{ color: "var(--c-panel-text)" }}>
              Pan
            </span>
            <Knob label="Position" value={fx.pan.value} min={-1} max={1} step={0.01}
              onChange={(v) => p("pan")({ value: v })}
              fmt={(v) => v === 0 ? "C" : (v > 0 ? "R" : "L") + Math.round(Math.abs(v) * 100)} />
          </Section>

          {/* Reverse */}
          <Section>
            <Toggle label="Reverse" on={fx.reverse.enabled}
              onToggle={() => p("reverse")({ enabled: !fx.reverse.enabled })} />
            <p className="text-[9px] font-mono" style={{ color: "var(--c-subtext)" }}>
              Flips audio buffer on every play.
            </p>
          </Section>

          {/* Reset */}
          <button
            onClick={() => update(DEFAULT_EFFECTS)}
            className="text-[10px] font-mono py-1.5 rounded-lg border transition-colors"
            style={{ borderColor: "var(--c-panel-border)", color: "var(--c-panel-text)" }}
          >
            reset all effects
          </button>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          borderColor: open ? "var(--c-brick-border-active)" : "var(--c-fab-border)",
          color: open ? "var(--c-brick-border-active)" : "var(--c-fab-color)",
          backgroundColor: "var(--c-bg)",
        }}
        className="w-14 h-14 rounded-full border-[3px] flex items-center justify-center text-xs font-bold font-mono transition-colors hover:opacity-80"
      >
        fx
      </button>
    </div>
  );
}
