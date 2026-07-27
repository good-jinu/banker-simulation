export type ProductKind = "loan" | "deposit";
export type OccupationRule = "any" | "employed" | "self-employed";

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
  /** A visible safety module: alert-affected customers wait until the line is safe. */
  pauseOnMarketAlert?: boolean;
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
