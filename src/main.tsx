import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { loadResoniteFont } from "./editor/render/resoniteFont";

// Register Resonite's Noto Sans so the preview measures text exactly like the
// game (prevents in-editor labels from fitting but wrapping in-world).
loadResoniteFont();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
