import { creditScoreFor } from "./market-credit.ts";
import type {
  DepositProduct,
  LoanProduct,
  LoanProductModule,
  LoanProductRules,
  Product,
} from "./market-product-types.ts";
import { LOAN_PRODUCT_MODULE_CAPACITY } from "./market-product-types.ts";
import { recordActivity } from "./market-trust.ts";
import type {
  Customer,
  Depositor,
  MarketEvent,
  MarketWorld,
} from "./market-world.ts";

export function buildLoanProduct(
  products: readonly Product[],
  name: string,
  rules: LoanProductRules,
): LoanProduct {
  return {
    id: `loan-product-${products.filter((product) => product.kind === "loan").length + 1}`,
    kind: "loan",
    name,
    x: 50,
    y: 26,
    active: true,
    rules,
  };
}

export function buildDepositProduct(
  products: readonly Product[],
  name: string,
  interestRate = 2,
): DepositProduct {
  return {
    id: `deposit-product-${products.filter((product) => product.kind === "deposit").length + 1}`,
    kind: "deposit",
    name,
    x: 50,
    y: 68,
    active: true,
    interestRate,
  };
}

export function customerMatchesLoanProduct(
  customer: Customer,
  product: LoanProduct,
): boolean {
  const { rules } = product;
  const hasGuarantor =
    hasLoanProductModule(product, "guarantor") && Boolean(customer.guarantor);
  const scorePasses =
    !hasLoanProductModule(product, "credit-check") ||
    creditScoreFor(customer) >= 620 ||
    hasGuarantor;
  const occupationMatches =
    rules.occupation === "any" || customer.occupation === rules.occupation;
  return (
    customer.status === "waiting" &&
    (customer.income >= rules.minimumIncome || hasGuarantor) &&
    occupationMatches &&
    scorePasses &&
    customer.amount >= rules.minimumAmount &&
    customer.amount <= rules.maximumAmount &&
    customer.term >= rules.minimumTerm &&
    customer.term <= rules.maximumTerm
  );
}

export function hasLoanProductModule(
  product: LoanProduct,
  module: LoanProductModule,
): boolean {
  return product.modules?.includes(module) ?? false;
}

function acceptDeposit(
  world: MarketWorld,
  depositorId: string,
  product: DepositProduct,
): MarketWorld {
  const depositor = world.depositors.find((item) => item.id === depositorId);
  if (!depositor || depositor.status !== "waiting")
    return { ...world, events: [] };
  const accepted: Depositor = {
    ...depositor,
    balance: depositor.amount,
    rate: product.interestRate,
    status: "accepted",
    productId: product.id,
  };
  return {
    ...world,
    cash: world.cash + accepted.amount,
    depositors: world.depositors.map((item) =>
      item.id === accepted.id ? accepted : item,
    ),
    // Taking a deposit is business the market can see, so it holds standing up
    // the same way a loan does.
    reputation: recordActivity(world.reputation),
    stats: {
      ...world.stats,
      depositsAccepted: world.stats.depositsAccepted + 1,
    },
    events: [
      ...world.events,
      { type: "deposit-accepted", depositor: accepted },
    ],
  };
}

function automateDeposits(world: MarketWorld): MarketWorld {
  let next = world;
  for (const product of world.products) {
    if (product.kind !== "deposit" || !product.active) continue;
    for (const depositor of next.depositors) {
      if (depositor.status !== "waiting") continue;
      next = acceptDeposit(next, depositor.id, product);
    }
  }
  return next;
}

function automateLoans(world: MarketWorld): MarketWorld {
  let currentCash = world.cash;
  let loanCount = world.loanCount;
  let cumulativeLent = world.cumulativeLent;
  let thirdLoanDay = world.thirdLoanDay;
  let automatedIssued = 0;
  const nextCustomers = [...world.customers];
  const newEvents: MarketEvent[] = [];

  for (const product of world.products) {
    if (product.kind !== "loan" || !product.active) continue;
    for (let index = 0; index < nextCustomers.length; index += 1) {
      const customer = nextCustomers[index]!;
      if (!customerMatchesLoanProduct(customer, product)) continue;
      if (currentCash < customer.amount) continue;

      loanCount += 1;
      currentCash -= customer.amount;
      cumulativeLent += customer.amount;
      automatedIssued += 1;
      if (loanCount === 3 && thirdLoanDay === null) thirdLoanDay = world.day;

      const acceptedCustomer: Customer = {
        ...customer,
        status: "accepted",
        dueDay: world.day + customer.term,
        productId: product.id,
        rate: product.rules.interestRate,
        ...(hasLoanProductModule(product, "credit-check")
          ? { creditScore: creditScoreFor(customer) }
          : {}),
        ...(hasLoanProductModule(product, "guarantor") && customer.guarantor
          ? { guaranteed: true }
          : {}),
      };
      nextCustomers[index] = acceptedCustomer;
      newEvents.push(
        {
          type: "transfer",
          from: product.id,
          to: customer.id,
          amount: customer.amount,
        },
        { type: "product-lent", product, customer: acceptedCustomer },
      );
    }
  }

  if (newEvents.length === 0) return world;
  return {
    ...world,
    cash: currentCash,
    customers: nextCustomers,
    reputation: recordActivity(world.reputation, automatedIssued),
    loanCount,
    cumulativeLent,
    thirdLoanDay,
    stats: {
      ...world.stats,
      automatedIssued: world.stats.automatedIssued + automatedIssued,
    },
    events: [...world.events, ...newEvents],
  };
}

export function automateProducts(world: MarketWorld): MarketWorld {
  return automateLoans(automateDeposits(world));
}

export function createProduct(
  world: MarketWorld,
  product: LoanProduct | DepositProduct,
): MarketWorld {
  if (
    world.products.some((item) => item.id === product.id) ||
    world.cash < world.config.productCreationCost
  )
    return { ...world, events: [] };
  return automateProducts({
    ...world,
    cash: world.cash - world.config.productCreationCost,
    products: [...world.products, product],
    events: [{ type: "product-created", product }],
  });
}

export function setProductActive(
  world: MarketWorld,
  productId: string,
  active: boolean,
): MarketWorld {
  const product = world.products.find((item) => item.id === productId);
  if (!product || product.active === active) return { ...world, events: [] };
  const products = world.products.map((item) =>
    item.id === productId ? { ...item, active } : item,
  );
  const nextWorld = { ...world, products, events: [] };
  return active ? automateProducts(nextWorld) : nextWorld;
}

export function setProductModule(
  world: MarketWorld,
  productId: string,
  module: LoanProductModule,
  enabled: boolean,
): MarketWorld {
  const product = world.products.find(
    (item): item is LoanProduct =>
      item.kind === "loan" && item.id === productId,
  );
  if (!product) return { ...world, events: [] };
  const modules = product.modules ?? [];
  const hasModule = modules.includes(module);
  if (hasModule === enabled) return { ...world, events: [] };
  if (enabled && modules.length >= LOAN_PRODUCT_MODULE_CAPACITY)
    return { ...world, events: [] };
  const nextModules = enabled
    ? [...modules, module]
    : modules.filter((candidate) => candidate !== module);
  const nextWorld = {
    ...world,
    products: world.products.map((item) =>
      item.id === productId && item.kind === "loan"
        ? { ...item, modules: nextModules }
        : item,
    ),
    events: [],
  };
  return product.active ? automateProducts(nextWorld) : nextWorld;
}

export function productForCustomer(
  products: readonly Product[],
  customer: Customer,
): LoanProduct | undefined {
  if (!customer.productId) return undefined;
  const product = products.find((item) => item.id === customer.productId);
  return product?.kind === "loan" ? product : undefined;
}
