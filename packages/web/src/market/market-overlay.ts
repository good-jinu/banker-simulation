export type ProductBuilderKind = "deposit" | "loan";

export type MarketOverlay =
  | { kind: "customer"; customerId: string }
  | { kind: "product"; productId: string }
  | { kind: "product-builder"; productKind: ProductBuilderKind }
  | { kind: "funding" }
  | { kind: "assets" }
  | { kind: "news" };
