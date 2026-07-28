import type {
  Customer,
  Depositor,
  Funding,
  MarketEvent,
  Product,
} from "./market-world.ts";

export type MapPoint = { x: number; y: number };
export type FlowKind =
  | "loan-out"
  | "funding-in"
  | "deposit-in"
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

/** The result stamp outlives its flow token, so it is tracked separately —
 * several can sit on the map at once while the queue keeps moving. */
export type FlowStamp = {
  id: number;
  at: MapPoint;
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
  depositors: Depositor[],
  funding: Funding[],
  products: Product[],
): MapPoint {
  if (id === "banker") return { x: 50, y: 49 };
  return (
    customers.find((customer) => customer.id === id) ??
    depositors.find((depositor) => depositor.id === id) ??
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
  const productCustomerPoint = (customer: Customer): MapPoint =>
    customer.productId ? pointFor(customer.productId) : customer;
  const depositorPoint = (depositor: Depositor): MapPoint => depositor;
  const lenderPoint = (lender: Funding): MapPoint => lender;
  switch (event.type) {
    case "transfer": {
      const fundingIn = event.to === "banker";
      const automated = event.from !== "banker" && event.to !== "banker";
      // Product customers are hidden from the map. Represent the automated
      // leg on the visible product node instead of sending the token to the
      // customer's now-empty map coordinates.
      const from = automated ? pointFor("banker") : pointFor(event.from);
      const to = automated ? pointFor(event.from) : pointFor(event.to);
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
      // Stamped on the borrower, not the hub: the amount answers "who paid
      // me", so it has to sit on the node that paid, even though that node
      // is cleared from the map the moment it repays.
      return {
        from: customerPoint(event.customer),
        to: pointFor("banker"),
        stampAt: customerPoint(event.customer),
        amount: event.amount,
        kind: "customer-repayment",
        label: labels.repaid,
      };
    case "deposit-accepted":
      return {
        from: depositorPoint(event.depositor),
        to: pointFor("banker"),
        stampAt: pointFor("banker"),
        amount: event.depositor.amount,
        kind: "deposit-in",
        label: labels.cashIn,
      };
    case "product-cash-in":
      // Product customers never render on the map, so their coordinates are
      // bare ground. Show the product returning the collected cash to the
      // bank, while keeping the result stamp on the product that earned it.
      return {
        from: pointFor(event.product.id),
        to: pointFor("banker"),
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
        from: productCustomerPoint(event.customer),
        to: pointFor("banker"),
        stampAt: productCustomerPoint(event.customer),
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
