import { useEffect, useState } from "react";
import Splash from "./editor/Splash";
import Editor from "./editor/Editor";

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  // Prevent page-level pinch/ctrl-wheel zoom so the viewport can own zoom UX.
  useEffect(() => {
    function onWheel(e: WheelEvent) {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    }
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && (e.key === "+" || e.key === "-" || e.key === "=" || e.key === "0")) {
        // Let the user keep browser zoom shortcuts if they really want, but
        // most users hitting ctrl+= over the canvas mean to zoom the canvas.
        // We don't block it — only ctrl+wheel which is the most surprising.
      }
    }
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="h-full w-full">
      {showSplash ? <Splash onDismiss={() => setShowSplash(false)} /> : <Editor />}
    </div>
  );
}
