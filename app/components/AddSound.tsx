"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { decodeAudioFile, trimAudioBuffer, audioBufferToWavBlob } from "@/lib/audio";
import WaveformTrimmer from "./WaveformTrimmer";

type Stage = "idle" | "recording" | "trimming" | "uploading";

export default function AddSound() {
  const [stage, setStage] = useState<Stage>("idle");
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadAudio = async (blob: Blob) => {
    const buffer = await decodeAudioFile(blob);
    setAudioBuffer(buffer);
    setTrimStart(0);
    setTrimEnd(buffer.duration);
    setStage("trimming");
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => chunksRef.current.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        loadAudio(new Blob(chunksRef.current, { type: "audio/webm" }));
      };
      mr.start();
      recorderRef.current = mr;
      setStage("recording");
    } catch {
      setError("Microphone access denied.");
    }
  };

  const stopRecording = () => recorderRef.current?.stop();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await loadAudio(file);
  };

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
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="w-full max-w-2xl border-t border-zinc-800 pt-6 flex flex-col gap-4">
      {stage === "idle" && (
        <div className="flex gap-3">
          <button
            onClick={startRecording}
            className="px-4 py-2 border border-zinc-700 rounded-xl text-zinc-500 text-sm hover:border-zinc-500 hover:text-zinc-300 transition-colors"
          >
            ● Record
          </button>
          <label className="px-4 py-2 border border-zinc-700 rounded-xl text-zinc-500 text-sm hover:border-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer">
            ↑ Upload file
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={handleFile}
            />
          </label>
        </div>
      )}

      {stage === "recording" && (
        <button
          onClick={stopRecording}
          className="w-fit px-4 py-2 border border-red-800 rounded-xl text-red-500 text-sm animate-pulse"
        >
          ■ Stop recording
        </button>
      )}

      {stage === "trimming" && audioBuffer && (
        <>
          <WaveformTrimmer
            audioBuffer={audioBuffer}
            onChange={(s, e) => {
              setTrimStart(s);
              setTrimEnd(e);
            }}
          />
          <div className="flex gap-3 items-center">
            <input
              type="text"
              placeholder="Name this sound…"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              autoFocus
              className="flex-1 bg-transparent border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            />
            <button
              onClick={handleSave}
              disabled={!name.trim()}
              className="px-4 py-2 border border-zinc-600 rounded-xl text-sm text-zinc-300 hover:border-zinc-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Save
            </button>
            <button
              onClick={reset}
              className="text-xs text-zinc-700 hover:text-zinc-500 transition-colors"
            >
              cancel
            </button>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </>
      )}

      {stage === "uploading" && (
        <p className="text-xs font-mono text-zinc-600 animate-pulse">Uploading…</p>
      )}
    </div>
  );
}
