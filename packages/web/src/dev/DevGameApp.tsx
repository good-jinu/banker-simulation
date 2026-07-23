import { GameApp } from "../app/GameApp.tsx";
import { MarketRunProvider } from "../market/market-run.tsx";
import { parseDevMarketLaunch } from "./market-dev-query.ts";

/** Development-only bootstrap for direct market launches from URL parameters. */
export function DevGameApp() {
  const launch = parseDevMarketLaunch(window.location.search);
  if (!launch) return <GameApp />;
  return (
    <MarketRunProvider
      value={{
        phase: launch.phase,
        fresh: launch.fresh,
        showDevTools: true,
      }}
    >
      <GameApp initialScreen="campaign" initialStageId={launch.stageId} />
    </MarketRunProvider>
  );
}
