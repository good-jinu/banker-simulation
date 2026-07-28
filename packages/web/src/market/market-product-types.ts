export type ProductKind = "loan" | "deposit";
export type OccupationRule = "any" | "employed" | "self-employed";

export const LOAN_PRODUCT_MODULES = ["credit-check", "guarantor"] as const;
export type LoanProductModule = (typeof LOAN_PRODUCT_MODULES)[number];
export const LOAN_PRODUCT_MODULE_CAPACITY = 2;

export type LoanProductRules = {
  minimumIncome: number;
  occupation: OccupationRule;
  interestRate: number;
  minimumAmount: number;
  maximumAmount: number;
  minimumTerm: number;
  maximumTerm: number;
};

export type LoanProduct = {
  id: string;
  kind: "loan";
  name: string;
  x: number;
  y: number;
  active: boolean;
  /** Installed policy modules affect only contracts originated by this line. */
  modules?: LoanProductModule[];
  rules: LoanProductRules;
};

export type DepositProduct = {
  id: string;
  kind: "deposit";
  name: string;
  x: number;
  y: number;
  active: boolean;
  /** Annual interest promised to depositors who join this product. */
  interestRate: number;
};

export type Product = LoanProduct | DepositProduct;
