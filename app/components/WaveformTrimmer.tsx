"use client";

import { useEffect, useRef, useState } from "react";

export default function WaveformTrimmer({
  audioBuffer,
  trimStart,
  trimEnd,
  onChange,
}: {
  audioBuffer: AudioBuffer;
  trimStart: number;
  trimEnd: number;
  onChange: (start: number, end: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const duration = audioBuffer.duration;

  const [startFrac, setStartFrac] = useState(trimStart / duration);
  const [endFrac, setEndFrac] = useState(trimEnd / duration);
  const dragging = useRef<"start" | "end" | null>(null);

  // Sync when parent sets initial trim points (e.g. auto-trim after recording)
  useEffect(() => {
    setStartFrac(trimStart / duration);
    setEndFrac(trimEnd / duration);
  }, [trimStart, trimEnd, duration]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const data = audioBuffer.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / W));

    ctx.fillStyle = "#52525b";
    for (let i = 0; i < W; i++) {
      let max = 0;
      for (let j = 0; j < step; j++) {
        const v = Math.abs(data[i * step + j] ?? 0);
        if (v > max) max = v;
      }
      const h = Math.max(1, max * H);
      ctx.fillRect(i, (H - h) / 2, 1, h);
    }

    ctx.fillStyle = "rgba(9,9,11,0.65)";
    ctx.fillRect(0, 0, startFrac * W, H);
    ctx.fillRect(endFrac * W, 0, W - endFrac * W, H);

    ctx.fillStyle = "#e4e4e7";
    ctx.fillRect(Math.round(startFrac * W) - 1, 0, 2, H);
    ctx.fillRect(Math.round(endFrac * W) - 1, 0, 2, H);
  }, [audioBuffer, startFrac, endFrac]);

  const getFrac = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  };

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const frac = getFrac(e);
    dragging.current =
      Math.abs(frac - startFrac) < Math.abs(frac - endFrac) ? "start" : "end";
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragging.current) return;
    const frac = getFrac(e);
    if (dragging.current === "start") {
      const s = Math.min(frac, endFrac - 0.01);
      setStartFrac(s);
      onChange(s * duration, endFrac * duration);
    } else {
      const end = Math.max(frac, startFrac + 0.01);
      setEndFrac(end);
      onChange(startFrac * duration, end * duration);
    }
  };

  const fmt = (s: number) => `${s.toFixed(1)}s`;

  return (
    <div className="flex flex-col gap-1.5">
      <canvas
        ref={canvasRef}
        width={600}
        height={64}
        className="w-full rounded-lg cursor-col-resize"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={() => { dragging.current = null; }}
        onMouseLeave={() => { dragging.current = null; }}
      />
      <div className="flex justify-between text-[10px] font-mono text-zinc-600">
        <span>{fmt(startFrac * duration)}</span>
        <span>{fmt((endFrac - startFrac) * duration)} selected</span>
        <span>{fmt(endFrac * duration)}</span>
      </div>
    </div>
  );
}
