import { createContext, useContext, type ReactNode } from "react";

/** Optional run-time overrides for a market session. Production uses no value. */
export type MarketRunOptions = {
  phase: "intro" | "map";
  fresh: boolean;
  showDevTools: boolean;
};

const MarketRunContext = createContext<MarketRunOptions | null>(null);

export function MarketRunProvider({
  value,
  children,
}: {
  value: MarketRunOptions;
  children: ReactNode;
}) {
  return (
    <MarketRunContext.Provider value={value}>
      {children}
    </MarketRunContext.Provider>
  );
}

export function useMarketRunOptions(): MarketRunOptions | null {
  return useContext(MarketRunContext);
}
