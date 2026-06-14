import Soundboard from "./components/Soundboard";
import AddSound from "./components/AddSound";

export default function Home() {
  return (
    <div className="flex flex-col items-center min-h-screen gap-10 p-8 pt-16">
      <h1 className="text-xs font-mono tracking-[0.3em] text-zinc-600 uppercase">
        Soundboard
      </h1>
      <Soundboard />
      <AddSound />
    </div>
  );
}
