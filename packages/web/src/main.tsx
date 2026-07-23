import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { GameApp } from "./app/GameApp.tsx";

const DevGameApp = import.meta.env.DEV
  ? lazy(async () => {
      const module = await import("./dev/DevGameApp.tsx");
      return { default: module.DevGameApp };
    })
  : null;

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

createRoot(root).render(
  <StrictMode>
    {DevGameApp ? (
      <Suspense fallback={null}>
        <DevGameApp />
      </Suspense>
    ) : (
      <GameApp />
    )}
  </StrictMode>,
);
