"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  decodeAudioFile,
  detectTrimPoints,
  trimAudioBuffer,
  audioBufferToWavBlob,
} from "@/lib/audio";
import WaveformTrimmer from "./WaveformTrimmer";

type Stage = "idle" | "recording" | "trimming" | "uploading";

export default function FloatingRecorder() {
  const [stage, setStage] = useState<Stage>("idle");
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stageRef = useRef(stage);
  stageRef.current = stage;

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => chunksRef.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const buffer = await decodeAudioFile(
          new Blob(chunksRef.current, { type: "audio/webm" })
        );
        const { start, end } = detectTrimPoints(buffer);
        setAudioBuffer(buffer);
        setTrimStart(start);
        setTrimEnd(end);
        setStage("trimming");
      };
      mr.start();
      recorderRef.current = mr;
      setStage("recording");
    } catch {
      setError("Microphone access denied.");
    }
  };

  const stopRecording = () => recorderRef.current?.stop();

  const toggle = () => {
    if (stage === "idle") startRecording();
    else if (stage === "recording") stopRecording();
  };

  useEffect(() => {
    const isInput = (e: KeyboardEvent) =>
      (e.target as HTMLElement).tagName === "INPUT" ||
      (e.target as HTMLElement).tagName === "TEXTAREA";
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isInput(e)) {
        e.preventDefault();
        if (stageRef.current === "idle") startRecording();
        else if (stageRef.current === "recording") stopRecording();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleSave = async () => {
    if (!audioBuffer || !name.trim()) return;
    setStage("uploading");
    setError("");
    try {
      const trimmed = await trimAudioBuffer(audioBuffer, trimStart, trimEnd);
      const wav = audioBufferToWavBlob(trimmed);
      const filename = `${Date.now()}-${name.trim().toLowerCase().replace(/\s+/g, "-")}.wav`;

      const { data, error: uploadErr } = await supabase.storage
        .from("sounds")
        .upload(filename, wav, { contentType: "audio/wav" });
      if (uploadErr) throw uploadErr;

      const { data: { publicUrl } } = supabase.storage
        .from("sounds")
        .getPublicUrl(data.path);

      const { error: dbErr } = await supabase
        .from("sounds")
        .insert({ name: name.trim(), url: publicUrl });
      if (dbErr) throw dbErr;

      setName("");
      setAudioBuffer(null);
      setStage("idle");
    } catch (err) {
      setError(String(err));
      setStage("trimming");
    }
  };

  const reset = () => {
    setAudioBuffer(null);
    setName("");
    setError("");
    setStage("idle");
  };

  return (
    <div className="fixed bottom-6 right-6 flex flex-col items-end gap-3">
      {/* Expanded panel */}
      {(stage === "trimming" || stage === "uploading") && audioBuffer && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-4 w-80 flex flex-col gap-3 shadow-2xl">
          {stage === "trimming" && (
            <>
              <WaveformTrimmer
                audioBuffer={audioBuffer}
                trimStart={trimStart}
                trimEnd={trimEnd}
                onChange={(s, e) => { setTrimStart(s); setTrimEnd(e); }}
              />
              <input
                type="text"
                placeholder="Name this sound…"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
                autoFocus
                className="bg-transparent border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 w-full"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={!name.trim()}
                  className="flex-1 py-2 border border-zinc-600 rounded-xl text-sm text-zinc-300 hover:border-zinc-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={reset}
                  className="px-3 py-2 text-xs text-zinc-700 hover:text-zinc-500 transition-colors"
                >
                  cancel
                </button>
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
            </>
          )}
          {stage === "uploading" && (
            <p className="text-xs font-mono text-zinc-600 animate-pulse text-center py-2">
              Uploading…
            </p>
          )}
        </div>
      )}

      {/* FAB */}
      {(stage === "idle" || stage === "recording") && (
        <button
          onClick={toggle}
          style={{
            borderColor: stage === "recording" ? "#dc2626" : "#52525b",
            color: stage === "recording" ? "#dc2626" : "#71717a",
          }}
          className={`w-14 h-14 rounded-full border-[3px] bg-zinc-950 flex items-center justify-center text-xl transition-colors ${
            stage === "recording" ? "animate-pulse" : "hover:border-zinc-400 hover:text-zinc-300"
          }`}
        >
          {stage === "recording" ? "■" : "●"}
        </button>
      )}
    </div>
  );
}
