export type MarketUiState = {
  hasDraggedMap: boolean;
};

export function initialMarketUiState(): MarketUiState {
  return { hasDraggedMap: false };
}
