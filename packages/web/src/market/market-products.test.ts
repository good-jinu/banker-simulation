import { describe, expect, it } from "vitest";
import { marketCampaignStages } from "./market-campaign.ts";
import {
  buildDepositProduct,
  buildLoanProduct,
  createProduct,
  customerMatchesLoanProduct,
  customerMatchesLoanRules,
  setProductModule,
} from "./market-products.ts";
import { createWorld, type Depositor } from "./market-world.ts";

describe("market products", () => {
  const rules = {
    minimumIncome: 0,
    occupation: "any" as const,
    interestRate: 5,
    minimumAmount: 0,
    maximumAmount: 100_000,
    minimumTerm: 1,
    maximumTerm: 100,
  };

  it("builds stable per-kind product ids", () => {
    const deposit = buildDepositProduct([], "Savings");
    const loan = buildLoanProduct([deposit], "Loans", rules);
    expect(deposit.id).toBe("deposit-product-1");
    expect(loan.id).toBe("loan-product-1");
  });

  it("matches waiting customers against every loan rule", () => {
    const world = createWorld(7, marketCampaignStages[0]!.config);
    const customer = world.customers[0]!;
    const product = buildLoanProduct([], "Loans", rules);
    expect(customerMatchesLoanProduct(customer, product)).toBe(true);
    expect(customerMatchesLoanRules(customer, rules)).toBe(true);
    expect(
      customerMatchesLoanProduct(customer, {
        ...product,
        rules: { ...rules, minimumIncome: customer.income + 1 },
      }),
    ).toBe(false);
  });

  it("uses credit checks to screen risk while guarantors reopen eligible cases", () => {
    const world = createWorld(7, "credit-under-pressure");
    const customer = {
      ...world.customers[0]!,
      id: "credit-rebuild",
      occupation: "employed" as const,
      income: 900,
      amount: 900,
      guarantor: { en: "Aunt Mira", ko: "미라 이모" },
    };
    const product = buildLoanProduct([], "Loans", {
      ...rules,
      minimumIncome: 1_500,
    });
    const creditChecked = { ...product, modules: ["credit-check" as const] };

    expect(customerMatchesLoanProduct(customer, creditChecked)).toBe(false);
    expect(
      customerMatchesLoanProduct(customer, {
        ...creditChecked,
        modules: ["credit-check", "guarantor"],
      }),
    ).toBe(true);
  });

  it("limits each lending line to two policy modules", () => {
    const base = createWorld(7, "credit-under-pressure");
    const product = buildLoanProduct([], "Loans", rules);
    const withProduct = { ...base, products: [product] };
    const withCreditCheck = setProductModule(
      withProduct,
      product.id,
      "credit-check",
      true,
    );
    const withGuarantor = setProductModule(
      withCreditCheck,
      product.id,
      "guarantor",
      true,
    );

    expect(withGuarantor.products[0]).toMatchObject({
      modules: ["credit-check", "guarantor"],
    });
  });

  it("charges creation cost and activates matching deposits", () => {
    const baseWorld = createWorld(7, marketCampaignStages[0]!.config);
    const waiting: Depositor = {
      id: "test-savings",
      name: { en: "Test Saver", ko: "테스트 예금자" },
      job: { en: "Village pharmacist", ko: "마을 약사" },
      amount: 260,
      rate: 2,
      balance: 0,
      appears: 0,
      locationId: "riverside-lot-2",
      districtId: "riverside",
      avatar: "/assets/pop-art/avatars/auditor-neutral.png",
      status: "waiting",
    };
    const world = {
      ...baseWorld,
      depositors: [waiting],
      cash: baseWorld.config.productCreationCost + 1_000,
    };
    const product = buildDepositProduct([], "Savings");
    const next = createProduct(world, product);
    const deposits = world.depositors.reduce(
      (total, depositor) => total + depositor.amount,
      0,
    );
    expect(next.cash).toBe(
      world.cash - world.config.productCreationCost + deposits,
    );
    expect(next.depositors[0]?.status).toBe("accepted");
  });

  it("books automated originations into the customer's district sales", () => {
    const world = createWorld(7, "portfolio-crossroads");
    const customer = world.customers[0]!;
    const product = buildLoanProduct(
      [],
      "Regional line",
      rules,
      world.config.map,
    );
    const next = createProduct(world, product);

    expect(next.customers[0]?.status).toBe("accepted");
    expect(next.districtSales[customer.districtId]).toBe(customer.amount);
  });
});
