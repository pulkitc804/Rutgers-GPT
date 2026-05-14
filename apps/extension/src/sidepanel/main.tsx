import "../index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RutgersDashboard } from "@rutgers-gpt/shared";
import { useRutgersIQStore } from "../rutgers-store";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RutgersDashboard useStore={useRutgersIQStore} title="Rutgers IQ" />
  </StrictMode>,
);
