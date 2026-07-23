import type {
  Customer,
  Funding,
  MarketEvent,
  Product,
} from "./market-world.ts";

export type MapPoint = { x: number; y: number };
export type FlowKind =
  | "loan-out"
  | "funding-in"
  | "customer-repayment"
  | "funding-repayment"
  | "funding-settlement"
  | "default"
  | "product-cash-in";
export type FlowAnimation = {
  id: number;
  from: MapPoint;
  to: MapPoint;
  stampAt: MapPoint;
  amount: number;
  kind: FlowKind;
  label: string;
};

export type FlowLabels = {
  funded: string;
  cashIn: string;
  repaid: string;
  paid: string;
  settled: string;
  defaulted: string;
  automated: string;
  retrieved: string;
};

export function pointForId(
  id: string,
  customers: Customer[],
  funding: Funding[],
  products: Product[],
): MapPoint {
  if (id === "banker") return { x: 50, y: 49 };
  return (
    customers.find((customer) => customer.id === id) ??
    funding.find((lender) => lender.id === id) ??
    products.find((product) => product.id === id) ?? { x: 50, y: 50 }
  );
}

export function flowForEvent(
  event: MarketEvent,
  pointFor: (id: string) => MapPoint,
  labels: FlowLabels,
): Omit<FlowAnimation, "id"> | null {
  const customerPoint = (customer: Customer): MapPoint => customer;
  const lenderPoint = (lender: Funding): MapPoint => lender;
  switch (event.type) {
    case "transfer": {
      const fundingIn = event.to === "banker";
      const automated = event.from !== "banker" && event.to !== "banker";
      const from = pointFor(event.from);
      const to = pointFor(event.to);
      return {
        from,
        to,
        stampAt: to,
        amount: event.amount,
        kind: fundingIn ? "funding-in" : "loan-out",
        label: fundingIn
          ? labels.cashIn
          : automated
            ? labels.automated
            : labels.funded,
      };
    }
    case "customer-repayment":
      if (event.customer.productId) return null;
      return {
        from: customerPoint(event.customer),
        to: pointFor("banker"),
        stampAt: pointFor("banker"),
        amount: event.amount,
        kind: "customer-repayment",
        label: labels.repaid,
      };
    case "product-cash-in":
      return {
        from: customerPoint(event.customer),
        to: pointFor(event.product.id),
        stampAt: pointFor(event.product.id),
        amount: event.amount,
        kind: "product-cash-in",
        label: labels.retrieved,
      };
    case "funding-repayment":
      return {
        from: pointFor("banker"),
        to: lenderPoint(event.lender),
        stampAt: lenderPoint(event.lender),
        amount: event.amount,
        kind: "funding-repayment",
        label: labels.paid,
      };
    case "funding-settlement":
      return {
        from: pointFor("banker"),
        to: lenderPoint(event.lender),
        stampAt: lenderPoint(event.lender),
        amount: event.amount,
        kind: "funding-settlement",
        label: labels.settled,
      };
    case "default":
      return {
        from: customerPoint(event.customer),
        to: pointFor("banker"),
        stampAt: customerPoint(event.customer),
        amount: event.customer.amount,
        kind: "default",
        label: labels.defaulted,
      };
    case "funding-default":
      return {
        from: pointFor("banker"),
        to: lenderPoint(event.lender),
        stampAt: lenderPoint(event.lender),
        amount: event.amount,
        kind: "default",
        label: labels.defaulted,
      };
    default:
      return null;
  }
}
