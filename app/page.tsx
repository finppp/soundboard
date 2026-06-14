import Soundboard from "./components/Soundboard";
import FloatingRecorder from "./components/FloatingRecorder";
import FloatingSettings from "./components/FloatingSettings";

export default function Home() {
  return (
    <>
      <div className="flex items-center justify-center min-h-screen p-8 pb-28">
        <Soundboard />
      </div>
      <FloatingRecorder />
      <FloatingSettings />
    </>
  );
}
