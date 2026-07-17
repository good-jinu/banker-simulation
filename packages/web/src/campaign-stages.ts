import type { Locale } from "./i18n.tsx";

export type StageNodeKind =
  | "transfer"
  | "wait"
  | "asset"
  | "condition"
  | "repeat"
  | "intake"
  | "settle"
  | "loop"
  | "variable"
  | "case";

export type CaseTrigger = "term-ended" | "withdraw-requested";

export interface LocalText {
  en: string;
  ko: string;
}

export interface CustomerFact {
  label: LocalText;
  value: string;
  visible: boolean;
}

export interface PartyOption {
  id: string;
  label: string;
}

export interface ContractTerms {
  outgoingAmount?: number;
  waitDays?: number;
  incomingAmount?: number;
  assetName?: string;
  repeatCount?: number;
  intervalDays?: number;
  providerAmount?: number;
  providerTermDays?: number;
  providerReturn?: number;
  settleAfterDays?: number;
  providerId?: string;
  /** Marks a deposit demand: the giver funds now, the loop decides the exit. */
  depositTermDays?: number;
  /** Minimum payout formula the saver demands at term. */
  maturityExpression?: string;
  /** Daily chance (basis points) that the giver asks for the money back. */
  withdrawDailyChanceBp?: number;
}

export interface MarketCustomer {
  id: string;
  name: string;
  kind: LocalText;
  image: string;
  gender?: LocalText;
  facts: CustomerFact[];
  parties: PartyOption[];
  need: {
    badge: string;
    now: LocalText;
    later: LocalText;
    price: LocalText;
  };
  terms: ContractTerms;
}

export interface NodeParameters {
  senderId?: string | undefined;
  recipientId?: string | undefined;
  amount?: number | undefined;
  days?: number | undefined;
  assetName?: string | undefined;
  successAction?: "release" | "collect" | undefined;
  failureAction?: "recover" | "waive" | undefined;
  repeatCount?: number | undefined;
  intervalDays?: number | undefined;
  returnAmount?: number | undefined;
  dueDays?: number | undefined;
  trigger?: CaseTrigger | undefined;
  variableName?: string | undefined;
  amountExpression?: string | undefined;
}

export interface ContractNodeSpec {
  kind: StageNodeKind;
  defaults: NodeParameters;
}

export interface CampaignStage {
  id: string;
  number: number;
  /** ISO calendar date the stage clock starts on (day 0). */
  startDate: string;
  /** Player treasury on day 0. Defaults to $1,000 when omitted. */
  startingCash?: number;
  title: LocalText;
  subtitle: LocalText;
  deskTitle: LocalText;
  marketLabel: LocalText;
  lesson: LocalText;
  targetSales: number;
  reward: { id: string; name: LocalText };
  customers: MarketCustomer[];
}

const text = (en: string, ko: string): LocalText => ({ en, ko });
const label = (en: string, ko: string): LocalText => text(en, ko);
const player = (locale: Locale): string =>
  locale === "ko" ? "플레이어" : "Player";

function individualFacts(
  name: string,
  gender: string,
  age: string,
  occupation: string,
  income: string,
  reveal: number,
): CustomerFact[] {
  return [
    { label: label("Name", "이름"), value: name, visible: true },
    { label: label("Gender", "성별"), value: gender, visible: true },
    { label: label("Age", "나이"), value: age, visible: reveal >= 1 },
    {
      label: label("Occupation", "직업"),
      value: occupation,
      visible: reveal >= 1,
    },
    { label: label("Income", "소득"), value: income, visible: reveal >= 2 },
    { label: label("Assets", "자산"), value: "$?", visible: false },
  ];
}

function organizationFacts(
  name: string,
  sector: string,
  monthlyCash: string,
  risk: string,
  asset: string,
): CustomerFact[] {
  return [
    { label: label("Name", "이름"), value: name, visible: true },
    { label: label("Sector", "업종"), value: sector, visible: true },
    {
      label: label("Monthly cash", "월 현금흐름"),
      value: monthlyCash,
      visible: true,
    },
    { label: label("Risk", "위험도"), value: risk, visible: true },
    { label: label("Key asset", "핵심 자산"), value: asset, visible: true },
    { label: label("Other debt", "기타 채무"), value: "?", visible: false },
  ];
}

const basicParties = (customer: string): PartyOption[] => [
  { id: "player", label: "Player" },
  { id: "customer", label: customer },
];

const stageOneCustomers: MarketCustomer[] = [
  {
    id: "elena",
    name: "Elena Brooks",
    kind: text("Individual", "일반인"),
    image: "/assets/stage-one/customers/elena.webp",
    gender: text("Female", "여성"),
    facts: individualFacts(
      "Elena Brooks",
      "Female",
      "29",
      "Cafe supervisor",
      "$2,900 / mo",
      0,
    ),
    parties: basicParties("Elena Brooks"),
    need: {
      badge: "$100",
      now: text("$100 cash", "현금 $100"),
      later: text("Return in 90 days", "90일 뒤 반환"),
      price: text("?", "?"),
    },
    terms: { outgoingAmount: 100, waitDays: 90, incomingAmount: 105 },
  },
  {
    id: "daniel",
    name: "Daniel Kim",
    kind: text("Individual", "일반인"),
    image: "/assets/stage-one/customers/daniel.webp",
    gender: text("Male", "남성"),
    facts: individualFacts(
      "Daniel Kim",
      "Male",
      "35",
      "Delivery coordinator",
      "$3,400 / mo",
      0,
    ),
    parties: basicParties("Daniel Kim"),
    need: {
      badge: "$100",
      now: text("$100 cash", "현금 $100"),
      later: text("Return in 90 days", "90일 뒤 반환"),
      price: text("?", "?"),
    },
    terms: { outgoingAmount: 100, waitDays: 90, incomingAmount: 105 },
  },
  {
    id: "sofia",
    name: "Sofia Martinez",
    kind: text("Individual", "일반인"),
    image: "/assets/stage-one/customers/sofia.webp",
    gender: text("Female", "여성"),
    facts: individualFacts(
      "Sofia Martinez",
      "Female",
      "42",
      "Independent caterer",
      "$4,100 / mo",
      0,
    ),
    parties: basicParties("Sofia Martinez"),
    need: {
      badge: "$100",
      now: text("$100 cash", "현금 $100"),
      later: text("Return in 90 days", "90일 뒤 반환"),
      price: text("?", "?"),
    },
    terms: { outgoingAmount: 100, waitDays: 90, incomingAmount: 105 },
  },
];

const stageTwoCustomers: MarketCustomer[] = [
  {
    id: "noah",
    name: "Noah Reed",
    kind: text("Individual", "일반인"),
    image: "/assets/campaign/market/courier.webp",
    gender: text("Male", "남성"),
    facts: individualFacts(
      "Noah Reed",
      "Male",
      "31",
      "Independent courier",
      "$2,700 / mo",
      1,
    ),
    parties: basicParties("Noah Reed"),
    need: {
      badge: "$80",
      now: text("$80 repair cash", "수리비 현금 $80"),
      later: text("Return in 120 days", "120일 뒤 반환"),
      price: text("Up to ?", "최대 ?"),
    },
    terms: {
      outgoingAmount: 80,
      waitDays: 120,
      incomingAmount: 92,
    },
  },
  {
    id: "daniel-2",
    name: "Daniel Kim",
    kind: text("Individual", "일반인"),
    image: "/assets/stage-one/customers/daniel.webp",
    gender: text("Male", "남성"),
    facts: individualFacts(
      "Daniel Kim",
      "Male",
      "35",
      "Delivery coordinator",
      "$3,400 / mo",
      1,
    ),
    parties: basicParties("Daniel Kim"),
    need: {
      badge: "$75",
      now: text("$75 equipment cash", "장비비 현금 $75"),
      later: text("Return in 120 days", "120일 뒤 반환"),
      price: text("Up to ?", "최대 ?"),
    },
    terms: {
      outgoingAmount: 75,
      waitDays: 120,
      incomingAmount: 88,
    },
  },
  {
    id: "elena-2",
    name: "Elena Brooks",
    kind: text("Individual", "일반인"),
    image: "/assets/stage-one/customers/elena.webp",
    gender: text("Female", "여성"),
    facts: individualFacts(
      "Elena Brooks",
      "Female",
      "29",
      "Cafe supervisor",
      "$2,900 / mo",
      1,
    ),
    parties: basicParties("Elena Brooks"),
    need: {
      badge: "$90",
      now: text("$90 relocation cash", "이사비 현금 $90"),
      later: text("Return in 150 days", "150일 뒤 반환"),
      price: text("Up to ?", "최대 ?"),
    },
    terms: {
      outgoingAmount: 90,
      waitDays: 150,
      incomingAmount: 104,
    },
  },
];

function companyCustomer(
  id: string,
  name: string,
  image: string,
  sector: string,
  cash: string,
  assetName: string,
): MarketCustomer {
  return {
    id,
    name,
    kind: text("Company", "회사"),
    image,
    facts: organizationFacts(name, sector, cash, "Variable", assetName),
    parties: basicParties(name),
    need: {
      badge: "$100",
      now: text("$100 operating cash", "운영자금 $100"),
      later: text("Outcome known in 180 days", "180일 뒤 결과 확정"),
      price: text("Repayment depends on outcome", "결과에 따라 반환"),
    },
    terms: {
      outgoingAmount: 100,
      waitDays: 180,
      assetName,
      incomingAmount: 112,
    },
  };
}

const stageThreeCustomers = [
  companyCustomer(
    "hearth-bakery",
    "Hearth Bakery",
    "/assets/campaign/market/bakery.webp",
    "Food",
    "$38 / mo",
    "Oven line",
  ),
  companyCustomer(
    "northline",
    "Northline Precision",
    "/assets/campaign/market/workshop.webp",
    "Manufacturing",
    "$44 / mo",
    "CNC rig",
  ),
  companyCustomer(
    "inkline",
    "Inkline Studio",
    "/assets/campaign/market/printworks.webp",
    "Printing",
    "$35 / mo",
    "Press unit",
  ),
];

function rhythmCustomer(
  id: string,
  name: string,
  image: string,
  kind: LocalText,
  amount: number,
  installment: number,
): MarketCustomer {
  return {
    id,
    name,
    kind,
    image,
    facts: organizationFacts(name, kind.en, `$${installment} / mo`, "Low", "?"),
    parties: basicParties(name),
    need: {
      badge: `$${amount}`,
      now: text(`$${amount} cash`, `현금 $${amount}`),
      later: text("Four returns, every 30 days", "30일마다 4회 반환"),
      price: text(`$${installment} each`, `회당 $${installment}`),
    },
    terms: {
      outgoingAmount: amount,
      incomingAmount: installment,
      repeatCount: 4,
      intervalDays: 30,
    },
  };
}

const stageFourCustomers = [
  rhythmCustomer(
    "colorloop",
    "Colorloop Printworks",
    "/assets/campaign/market/printworks.webp",
    text("Company", "회사"),
    80,
    23,
  ),
  rhythmCustomer(
    "hearth-rhythm",
    "Hearth Bakery",
    "/assets/campaign/market/bakery.webp",
    text("Company", "회사"),
    70,
    20,
  ),
  rhythmCustomer(
    "metro-repairs",
    "Metro Repair Unit",
    "/assets/campaign/market/civic.webp",
    text("Government", "정부"),
    90,
    26,
  ),
];

function portfolioCustomer(
  id: string,
  name: string,
  image: string,
  kind: LocalText,
  amount: number,
  days: number,
  repayment: number,
): MarketCustomer {
  return {
    id,
    name,
    kind,
    image,
    facts: organizationFacts(
      name,
      kind.en,
      `$${repayment - amount} margin`,
      "Low",
      "?",
    ),
    parties: basicParties(name),
    need: {
      badge: `$${amount}`,
      now: text(`$${amount} cash`, `현금 $${amount}`),
      later: text(`Return in ${days} days`, `${days}일 뒤 반환`),
      price: text(`No more than $${repayment}`, `최대 $${repayment}`),
    },
    terms: {
      outgoingAmount: amount,
      waitDays: days,
      incomingAmount: repayment,
    },
  };
}

const stageFiveCustomers = [
  portfolioCustomer(
    "northline-portfolio",
    "Northline Precision",
    "/assets/campaign/market/workshop.webp",
    text("Company", "회사"),
    80,
    90,
    98,
  ),
  portfolioCustomer(
    "city-transit",
    "City Transit Office",
    "/assets/campaign/market/civic.webp",
    text("Government", "정부"),
    70,
    120,
    86,
  ),
  portfolioCustomer(
    "noah-portfolio",
    "Noah Reed",
    "/assets/campaign/market/courier.webp",
    text("Individual", "일반인"),
    60,
    60,
    70,
  ),
];

function depositCustomer(
  id: string,
  name: string,
  image: string,
  amount: number,
  termDays: number,
  growthPerDayBp: number,
  withdrawDailyChanceBp: number,
): MarketCustomer {
  const dailyRate = growthPerDayBp / 10_000;
  const maturityExpression = `principal * (1 + day * ${dailyRate})`;
  const termGrowthPct = ((termDays * growthPerDayBp) / 100).toFixed(1);
  return {
    id,
    name,
    kind: text("Saver", "예금자"),
    image,
    facts: [
      { label: label("Name", "이름"), value: name, visible: true },
      {
        label: label("Deposit", "예치금"),
        value: `$${amount}`,
        visible: true,
      },
      {
        label: label("Term", "예치 기간"),
        value: `${termDays} days`,
        visible: true,
      },
      {
        label: label("Required growth", "요구 수익"),
        value: `${termGrowthPct}% at term`,
        visible: true,
      },
      { label: label("Patience", "인내심"), value: "?", visible: false },
    ],
    parties: basicParties(name),
    need: {
      badge: `+$${amount}`,
      now: text(`Deposits $${amount} with you`, `$${amount}을 예치`),
      later: text(
        `Paid back at day ${termDays} — or whenever they ask`,
        `${termDays}일 후 또는 요청 즉시 반환`,
      ),
      price: text(
        "Payout follows the formula you write",
        "반환액은 직접 작성한 수식을 따릅니다",
      ),
    },
    terms: {
      incomingAmount: amount,
      depositTermDays: termDays,
      maturityExpression,
      withdrawDailyChanceBp,
    },
  };
}

const stageSixCustomers = [
  depositCustomer(
    "ava-deposit",
    "Ava Park",
    "/assets/campaign/market/funding.webp",
    70,
    150,
    5,
    10,
  ),
  depositCustomer(
    "civic-deposit",
    "Civic Reserve",
    "/assets/campaign/market/civic.webp",
    80,
    150,
    4,
    5,
  ),
  depositCustomer(
    "coop-deposit",
    "Neighborhood Co-op",
    "/assets/campaign/market/funding.webp",
    60,
    120,
    6,
    20,
  ),
  portfolioCustomer(
    "mina-venture",
    "Mina Workshop",
    "/assets/campaign/market/workshop.webp",
    text("Company", "회사"),
    100,
    150,
    120,
  ),
  portfolioCustomer(
    "hearth-venture",
    "Hearth Bakery",
    "/assets/campaign/market/bakery.webp",
    text("Company", "회사"),
    90,
    150,
    108,
  ),
  portfolioCustomer(
    "inkline-venture",
    "Inkline Studio",
    "/assets/campaign/market/printworks.webp",
    text("Company", "회사"),
    110,
    150,
    132,
  ),
];

export const campaignStages: readonly CampaignStage[] = [
  {
    id: "first-yield",
    number: 1,
    startDate: "2011-01-01",
    title: text("The First Yield", "첫 번째 수익"),
    subtitle: text("Money now, money later", "지금의 돈, 미래의 반환"),
    deskTitle: text("Demand Discovery", "수요 발견"),
    marketLabel: text("Individuals · live demand", "일반인 · 실시간 수요"),
    lesson: text(
      "Read a visible need and turn it into a timed exchange.",
      "공개된 수요를 읽고 시간에 따른 교환으로 만드세요.",
    ),
    targetSales: 1,
    reward: {
      id: "contract-stamp",
      name: text("Contract Stamp", "컨트랙트 스탬프"),
    },
    customers: stageOneCustomers,
  },
  {
    id: "affordable-terms",
    number: 2,
    startDate: "2011-04-01",
    title: text("Changing Shape", "형태의 변화"),
    subtitle: text(
      "Cash becomes a financial claim",
      "현금이 금융 청구권으로 바뀝니다",
    ),
    deskTitle: text("Asset Desk", "자산 데스크"),
    marketLabel: text(
      "Individuals · asset transformation",
      "일반인 · 자산 전환",
    ),
    lesson: text(
      "A contract can reduce cash while creating equal non-cash value.",
      "컨트랙트는 현금을 줄이는 동시에 같은 비현금 가치를 만들 수 있습니다.",
    ),
    targetSales: 1,
    reward: {
      id: "cashflow-lens",
      name: text("Cash-flow Lens", "현금흐름 렌즈"),
    },
    customers: stageTwoCustomers,
  },
  {
    id: "collateral-recovery",
    number: 3,
    startDate: "2011-08-01",
    title: text("The Safety Net", "안전망"),
    subtitle: text(
      "Design the unwanted branch",
      "원하지 않는 경로까지 설계하기",
    ),
    deskTitle: text("Outcome Control", "결과 제어"),
    marketLabel: text("Companies · variable outcomes", "회사 · 변동 결과"),
    lesson: text(
      "Hold an asset and define what happens in both outcomes.",
      "자산을 보관하고 두 결과에서 일어날 일을 정의하세요.",
    ),
    targetSales: 1,
    reward: {
      id: "collateral-seal",
      name: text("Asset Control Seal", "자산 제어 인장"),
    },
    customers: stageThreeCustomers,
  },
  {
    id: "payment-rhythm",
    number: 4,
    startDate: "2012-01-01",
    title: text("Payment Rhythm", "상환 리듬"),
    subtitle: text(
      "A return can arrive in pieces",
      "반환은 나누어 도착할 수 있습니다",
    ),
    deskTitle: text("Recurring Flow", "반복 흐름"),
    marketLabel: text("Organizations · repeated demand", "조직 · 반복 수요"),
    lesson: text(
      "Repeat one transfer on a bounded calendar.",
      "하나의 전송을 정해진 일정에 따라 반복하세요.",
    ),
    targetSales: 1,
    reward: { id: "schedule-dial", name: text("Rhythm Dial", "리듬 다이얼") },
    customers: stageFourCustomers,
  },
  {
    id: "keep-till-open",
    number: 5,
    startDate: "2012-06-01",
    title: text("Keep the Till Open", "금고를 열어두기"),
    subtitle: text("Several promises, one treasury", "여러 약속, 하나의 금고"),
    deskTitle: text("Portfolio Desk", "포트폴리오 데스크"),
    marketLabel: text(
      "Mixed market · parallel demand",
      "혼합 시장 · 병렬 수요",
    ),
    lesson: text(
      "Automate two different contracts without confusing their dates.",
      "서로 다른 두 컨트랙트의 날짜를 혼동하지 않고 자동화하세요.",
    ),
    targetSales: 2,
    reward: {
      id: "portfolio-lens",
      name: text("Portfolio Lens", "포트폴리오 렌즈"),
    },
    customers: stageFiveCustomers,
  },
  {
    id: "funding-desk",
    number: 6,
    startDate: "2013-01-01",
    startingCash: 50,
    title: text("Funding Desk", "펀딩 데스크"),
    subtitle: text(
      "Deposits are promises you owe",
      "예금은 갚아야 할 약속입니다",
    ),
    deskTitle: text("Deposit Book", "예금 장부"),
    marketLabel: text(
      "Savers & ventures · deposits fund loans",
      "예금자와 사업가 · 예금이 대출의 재원",
    ),
    lesson: text(
      "Take a deposit, deploy it, and design both ways the money can leave.",
      "예금을 받아 운용하고, 돈이 떠나는 두 가지 경로를 모두 설계하세요.",
    ),
    targetSales: 2,
    reward: {
      id: "liquidity-ledger",
      name: text("Liquidity Ledger", "유동성 원장"),
    },
    customers: stageSixCustomers,
  },
];

export function localize(value: LocalText, locale: Locale): string {
  return value[locale];
}

export function stageById(id: string): CampaignStage {
  return campaignStages.find((stage) => stage.id === id) ?? campaignStages[0]!;
}

export function recipeFor(
  stage: CampaignStage,
  customer: MarketCustomer,
): ContractNodeSpec[] {
  const terms = customer.terms;
  const basic: ContractNodeSpec[] = [
    {
      kind: "transfer",
      defaults: {
        senderId: "player",
        recipientId: "customer",
        amount: terms.outgoingAmount,
      },
    },
    { kind: "wait", defaults: { days: terms.waitDays } },
    {
      kind: "transfer",
      defaults: {
        senderId: "customer",
        recipientId: "player",
        amount: terms.incomingAmount,
      },
    },
  ];

  if (terms.depositTermDays !== undefined)
    return [
      {
        kind: "transfer",
        defaults: {
          senderId: "customer",
          recipientId: "player",
          amount: terms.incomingAmount,
        },
      },
      { kind: "loop", defaults: {} },
      {
        kind: "variable",
        defaults: {
          variableName: "payback",
          amountExpression: terms.maturityExpression,
        },
      },
      {
        kind: "case",
        defaults: {
          trigger: "term-ended",
          days: terms.depositTermDays,
          recipientId: "customer",
          amountExpression: "payback",
        },
      },
      {
        kind: "case",
        defaults: {
          trigger: "withdraw-requested",
          recipientId: "customer",
          amountExpression: "principal",
        },
      },
    ];
  if (
    terms.providerAmount === undefined &&
    stage.number !== 3 &&
    stage.number !== 4
  )
    return basic;
  if (stage.number === 3)
    return [
      basic[0]!,
      { kind: "asset", defaults: { assetName: terms.assetName } },
      { kind: "wait", defaults: { days: terms.waitDays } },
      {
        kind: "condition",
        defaults: { successAction: "release", failureAction: "recover" },
      },
    ];
  if (stage.number === 4)
    return [
      basic[0]!,
      {
        kind: "repeat",
        defaults: {
          repeatCount: terms.repeatCount,
          intervalDays: terms.intervalDays,
        },
      },
      basic[2]!,
    ];

  return [
    {
      kind: "intake",
      defaults: {
        senderId: terms.providerId,
        amount: terms.providerAmount,
        days: terms.providerTermDays,
        returnAmount: terms.providerReturn,
      },
    },
    basic[0]!,
    { kind: "wait", defaults: { days: terms.waitDays } },
    basic[2]!,
    {
      kind: "settle",
      defaults: {
        recipientId: terms.providerId,
        amount: terms.providerReturn,
        dueDays: terms.settleAfterDays,
      },
    },
  ];
}

export function playerLabel(locale: Locale): string {
  return player(locale);
}
