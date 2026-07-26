import { describe, expect, it } from "vitest";
import { initialMarketUiState } from "./market-ui-state.ts";

describe("initialMarketUiState", () => {
  it("shows the map drag tutorial for a new run", () => {
    expect(initialMarketUiState()).toEqual({ hasDraggedMap: false });
  });
});
