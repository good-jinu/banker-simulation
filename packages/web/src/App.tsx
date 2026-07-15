import { useState, type FormEvent } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Building2,
  CircleDollarSign,
  Clock3,
  Coins,
  FastForward,
  FileCheck2,
  FileText,
  Gavel,
  Gem,
  HandCoins,
  House,
  Landmark,
  Layers3,
  Leaf,
  LifeBuoy,
  LockKeyhole,
  Package,
  Play,
  RefreshCcw,
  Scale,
  ShieldCheck,
  Sparkles,
  Store,
  Ticket,
  TimerReset,
  TrendingUp,
  UserRound,
  UsersRound,
  WalletCards,
  Wheat,
  type LucideIcon,
} from "lucide-react";
import {
  MemoryEventStore,
  advanceWithAgents,
  balanceOf,
  createDefaultScenario,
  openOffers,
  projectOutcome,
  reputationOf,
  runAgents,
  summarizeTicks,
  type AgreementState,
  type FinancialProduct,
  type ProjectionSummary,
  type StandingOffer,
  type StoredEvent,
} from "@banker-simulation/core";

const STORAGE_KEY = "banker-simulation-events-v3";

function loadSession(): ReturnType<typeof createDefaultScenario> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const events = JSON.parse(raw) as StoredEvent[];
      const store = new MemoryEventStore();
      store.append(events, 0);
      return createDefaultScenario({ store });
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return createDefaultScenario();
}

interface ProductDraft {
  name: string;
  fundingAsset: string;
  principalAmount: string;
  term: string;
  fixedInterestRate: string;
  creatorFeeRate: string;
  minimumRepaymentReputation: string;
  collateralAsset: string;
  collateralAmount: string;
}

type AssetFilter = "all" | "currency" | "resource" | "property" | "claim";
type InspectorMode = "entity" | "market" | "activity" | "distress";
type FeedbackTone = "info" | "success" | "warning" | "danger";

const PROJECTION_SEEDS = Array.from({ length: 24 }, (_, index) => index + 1);
const DISTRESS_HORIZON = 3;

interface Feedback {
  message: string;
  detail: string;
  tone: FeedbackTone;
}

const initialProduct: ProductDraft = {
  name: "Working Capital Line",
  fundingAsset: "coin",
  principalAmount: "10",
  term: "12",
  fixedInterestRate: "0.15",
  creatorFeeRate: "0.02",
  minimumRepaymentReputation: "0",
  collateralAsset: "none",
  collateralAmount: "1",
};

const valuation: Record<string, number> = {
  coin: 1,
  seed: 10,
  grain: 1,
  flour: 1.2,
  land: 200,
};

const assetIcons: Record<string, LucideIcon> = {
  coin: Coins,
  seed: Leaf,
  grain: Wheat,
  flour: Package,
  land: Building2,
};

const entityIcons: Record<string, LucideIcon> = {
  farmer: Wheat,
  mill: Building2,
  merchant: Store,
  rival: Landmark,
  player: Landmark,
};

const fallbackEntityArtwork = {
  avatar: "/assets/avatars/auditor-neutral.webp",
  frame: "/assets/stakeholders/node-person.webp",
};

const entityArtwork: Record<string, { avatar: string; frame: string }> = {
  farmer: { avatar: "/assets/avatars/mina-neutral.webp", frame: "/assets/stakeholders/node-business.webp" },
  mill: { avatar: "/assets/avatars/jun-evaluating.webp", frame: "/assets/stakeholders/node-business.webp" },
  merchant: { avatar: "/assets/avatars/jun-neutral.webp", frame: "/assets/stakeholders/node-business.webp" },
  rival: { avatar: "/assets/avatars/fund-manager-neutral.webp", frame: "/assets/stakeholders/node-financial.webp" },
  player: { avatar: "/assets/avatars/player-coop-neutral.webp", frame: "/assets/stakeholders/node-financial.webp" },
};

const assetArtwork: Record<string, { token: string; icon: string }> = {
  coin: { token: "/assets/tokens/token-circle.webp", icon: "/assets/assets/coin.svg" },
  seed: { token: "/assets/tokens/token-hex.webp", icon: "/assets/assets/seed.svg" },
  grain: { token: "/assets/tokens/token-hex.webp", icon: "/assets/assets/grain.svg" },
  flour: { token: "/assets/tokens/token-hex.webp", icon: "/assets/assets/class-resource.svg" },
  land: { token: "/assets/tokens/token-tile.webp", icon: "/assets/assets/farm-plot.svg" },
  claim: { token: "/assets/tokens/token-ribbon.webp", icon: "/assets/assets/repayment-claim.svg" },
};

const entityRole: Record<string, string> = {
  farmer: "Borrower · Farm",
  mill: "Borrower · Grain mill",
  merchant: "Buyer · Distribution",
  rival: "Rival · 12 coin capacity",
  player: "Your cooperative bank",
};

const entityPositions: Record<string, { left: string; top: string }> = {
  farmer: { left: "20%", top: "27%" },
  mill: { left: "50%", top: "23%" },
  merchant: { left: "80%", top: "27%" },
  player: { left: "38%", top: "68%" },
  rival: { left: "70%", top: "68%" },
};

const eventLabels: Record<string, string> = {
  AgreementProposed: "New agreement",
  AgreementSigned: "Terms signed",
  AgreementDeclined: "Terms declined",
  AgreementActivated: "Contract active",
  OfferPosted: "Price posted",
  OfferFilled: "Trade executed",
  OfferWithdrawn: "Offer withdrawn",
  ProductApplicationSubmitted: "Funding application",
  ProductApplicationWithdrawn: "Application withdrawn",
  AssetTransferred: "Asset moved",
  ObligationSettled: "Payment settled",
  ObligationDefaulted: "Payment missed",
  ProductionCompleted: "Production resolved",
  ProductionSkipped: "Production paused",
  ProductPublished: "Offer published",
  ProductFunded: "Capital deployed",
  RepaymentClaimCreated: "Claim created",
  RepaymentClaimTransferred: "Claim transferred",
  CollateralLocked: "Collateral locked",
  CollateralReleased: "Collateral released",
  CollateralLiquidated: "Collateral moved",
  AuditPublished: "Audit verified",
  TimeAdvanced: "Market advanced",
};

const filterOptions: Array<{ id: AssetFilter; label: string; icon: LucideIcon }> = [
  { id: "all", label: "All layers", icon: Layers3 },
  { id: "currency", label: "Currency", icon: Coins },
  { id: "resource", label: "Resources", icon: Package },
  { id: "property", label: "Property", icon: Building2 },
  { id: "claim", label: "Claims", icon: Ticket },
];

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(value);
}

function productRepayment(product: FinancialProduct): number {
  return Math.round(product.principalAmount * (1 + product.fixedInterestRate) * 100) / 100;
}

function agreementSummary(agreement: AgreementState): string {
  return agreement.obligations
    .map((obligation) => `${obligation.amount} ${obligation.asset} · t${obligation.dueAt}`)
    .join("  →  ");
}

function eventDetail(event: StoredEvent): string {
  const data = event.data as Record<string, unknown>;
  if (event.type === "AssetTransferred") {
    return `${String(data.amount)} ${String(data.asset)} · ${String(data.from)} → ${String(data.to)}`;
  }
  if (event.type === "ProductPublished") {
    const product = data.product as { name?: string };
    return product.name ?? "New market offer";
  }
  if (event.type === "ProductionCompleted") {
    return data.successful ? "Output exceeded expectations" : "Output was hit by a shock";
  }
  if (event.type === "ObligationDefaulted") {
    return `Shortfall ${String(data.shortfall)}`;
  }
  if (event.type === "CollateralLiquidated") return "Ownership followed the repayment claim";
  if (event.type === "OfferPosted") {
    const offer = data.offer as StandingOffer;
    return `${offer.poster} ${offer.side}s ${offer.asset} @ ${offer.pricePerUnit} ${offer.priceAsset}`;
  }
  if (event.type === "OfferFilled") {
    return `${String(data.filler)} traded ${String(data.amount)} for ${String(data.cost)}`;
  }
  if (event.type === "ProductApplicationSubmitted") {
    const application = data.application as { borrower?: string };
    return `${application.borrower ?? "A borrower"} asked to be funded`;
  }
  if (event.type === "ProductFunded") {
    const funding = data.funding as { funder?: string; borrower?: string };
    return `${funding.funder ?? "A lender"} funded ${funding.borrower ?? "a borrower"}`;
  }
  if (event.type === "AgreementDeclined") return `Declined by ${String(data.decliner)}`;
  return `World time ${event.at}`;
}

function eventTone(event: StoredEvent): FeedbackTone {
  if (event.type === "ObligationDefaulted" || event.type === "CollateralLiquidated") return "danger";
  if (event.type === "ProductionCompleted") {
    return (event.data as { successful: boolean }).successful ? "success" : "warning";
  }
  if (event.type === "ObligationSettled" || event.type === "ProductFunded") return "success";
  return "info";
}

function feedbackIcon(tone: FeedbackTone): LucideIcon {
  if (tone === "success") return Sparkles;
  if (tone === "warning") return Activity;
  if (tone === "danger") return ShieldCheck;
  return CircleDollarSign;
}

export function App() {
  const [session, setSession] = useState(() => loadSession());
  const [, setRevision] = useState(0);
  const [product, setProduct] = useState<ProductDraft>(initialProduct);
  const [selectedEntityId, setSelectedEntityId] = useState("farmer");
  const [assetFilter, setAssetFilter] = useState<AssetFilter>("all");
  const [inspectorMode, setInspectorMode] = useState<InspectorMode>("entity");
  const [feedback, setFeedback] = useState<Feedback>({
    message: "Capital is ready",
    detail: "Select a participant or compose a new offer.",
    tone: "info",
  });
  const [projection, setProjection] = useState<{ applicationId: string; summary: ProjectionSummary } | null>(
    null,
  );

  const { engine, agents } = session;
  const state = engine.inspect();
  const events = engine.events();
  const entities = [...state.entities.values()];
  const products = [...state.products.values()];
  const openApplications = [...state.applications.values()].filter(
    (application) => application.status === "open",
  );
  const liveOffers = openOffers(state);
  const inboundProposals = [...state.agreements.values()].filter(
    (agreement) =>
      agreement.status === "proposed" &&
      agreement.parties.includes("player") &&
      !agreement.signatures.has("player"),
  );
  const selectedEntity = state.entities.get(selectedEntityId) ?? state.entities.get("farmer");
  const player = state.entities.get("player");
  const playerReputation = reputationOf(state, "player");
  const selectedReputation = selectedEntity ? reputationOf(state, selectedEntity.id) : null;
  const heldClaims = [...state.repaymentClaims.values()].filter(
    (claim) => claim.holder === "player" && claim.status === "active",
  );
  const activeAgreements = [...state.agreements.values()].filter(
    (agreement) => agreement.status === "active" || agreement.status === "proposed",
  );
  const atRiskClaims = [...state.repaymentClaims.values()].filter(
    (claim) =>
      claim.holder === "player" && claim.status === "active" && claim.dueAt - state.time <= DISTRESS_HORIZON,
  );
  const defaultedAgreements = [...state.agreements.values()].filter(
    (agreement) => agreement.status === "defaulted",
  );
  const playerPortfolioValue = [...state.assets.values()].reduce(
    (total, asset) => total + balanceOf(state, "player", asset.id) * (valuation[asset.id] ?? 1),
    0,
  );
  const latestProduction = [...events]
    .reverse()
    .find((event) => event.type === "ProductionCompleted");
  const worldSignal = latestProduction
    ? (latestProduction.data as { successful: boolean }).successful
      ? "Production strong"
      : "Supply shock"
    : "Market stable";
  const riskScore = Math.min(
    99,
    Math.round(
      (defaultedAgreements.length / Math.max(1, state.agreements.size)) * 100 + heldClaims.length * 8,
    ),
  );
  const repaymentPreview = Math.round(
    Number(product.principalAmount || 0) * (1 + Number(product.fixedInterestRate || 0)) * 100,
  ) / 100;
  const FeedbackIcon = feedbackIcon(feedback.tone);

  function refresh(message: string, detail: string, tone: FeedbackTone = "info"): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(engine.events()));
    } catch {
      // Persistence is best-effort; the in-memory session still works.
    }
    setFeedback({ message, detail, tone });
    setRevision((value) => value + 1);
  }

  function chooseEntity(entityId: string): void {
    setSelectedEntityId(entityId);
    setInspectorMode("entity");
  }

  function advance(ticks: number): void {
    try {
      const before = engine.events().length;
      const beforeState = state;
      const actions = advanceWithAgents(engine, agents, ticks);
      const digest = summarizeTicks(beforeState, engine.inspect(), engine.events().slice(before));

      const bullets = [
        digest.settlements > 0 ? `${digest.settlements} settlement${digest.settlements === 1 ? "" : "s"}` : null,
        digest.defaults > 0 ? `${digest.defaults} repayment${digest.defaults === 1 ? "" : "s"} missed` : null,
        digest.productionSuccesses > 0
          ? `${digest.productionSuccesses} successful harvest${digest.productionSuccesses === 1 ? "" : "s"}`
          : null,
        digest.productionFailures > 0
          ? `${digest.productionFailures} failed harvest${digest.productionFailures === 1 ? "" : "s"}`
          : null,
        ...digest.priceMoves.map(
          (move) => `${move.asset} ${move.side} bid ${move.to === null ? "closed" : `now ${move.to}`}`,
        ),
        ...digest.capitalDeployments
          .filter((deployment) => deployment.funder === "rival")
          .map((deployment) =>
            `Aster funded ${engine.inspect().entities.get(deployment.borrower)?.name ?? deployment.borrower} after its 1-tick review`,
          ),
      ].filter((bullet): bullet is string => bullet !== null);

      const tone: FeedbackTone =
        digest.defaults > 0
          ? "danger"
          : digest.productionFailures > 0 && digest.productionSuccesses === 0
            ? "warning"
            : digest.productionSuccesses > 0 || digest.settlements > 0
              ? "success"
              : "info";

      refresh(
        digest.headline,
        bullets.length > 0
          ? bullets.join(" · ")
          : actions
            ? `${actions} new participant action${actions === 1 ? "" : "s"}`
            : "No new market actions",
        tone,
      );
      setInspectorMode("activity");
    } catch (caught) {
      refresh("Action blocked", caught instanceof Error ? caught.message : String(caught), "danger");
    }
  }

  function previewFunding(marketProduct: FinancialProduct, borrowerId: string, applicationId: string): void {
    try {
      const summary = projectOutcome({
        events: engine.events(),
        agents,
        ticks: marketProduct.term,
        seeds: PROJECTION_SEEDS,
        perspective: "player",
        valuation,
        apply: (projectedEngine) =>
          projectedEngine.fundProduct({ productId: marketProduct.id, funder: "player", borrower: borrowerId }),
      });
      setProjection({ applicationId, summary });
    } catch (caught) {
      refresh("Preview failed", caught instanceof Error ? caught.message : String(caught), "danger");
    }
  }

  function extendClaim(claim: { agreementId: string; obligationId: string; dueAt: number }): void {
    try {
      const newDueAt = claim.dueAt + DISTRESS_HORIZON;
      engine.extendObligation({
        actor: "player",
        agreementId: claim.agreementId,
        obligationId: claim.obligationId,
        newDueAt,
      });
      refresh("Term extended", `New due date is t${newDueAt}`, "info");
    } catch (caught) {
      refresh("Extension blocked", caught instanceof Error ? caught.message : String(caught), "danger");
    }
  }

  function callInClaim(claim: { agreementId: string; obligationId: string }): void {
    try {
      engine.callInObligation({
        actor: "player",
        agreementId: claim.agreementId,
        obligationId: claim.obligationId,
      });
      refresh("Loan called in", "Resolved now instead of waiting for the due date", "info");
    } catch (caught) {
      refresh("Call-in blocked", caught instanceof Error ? caught.message : String(caught), "danger");
    }
  }

  function sellClaimAtDiscount(claim: { id: string; amount: number; asset: string }): void {
    try {
      const price = Math.round(claim.amount * 0.9 * 100) / 100;
      engine.sellRepaymentClaim({ actor: "player", claimId: claim.id, to: "merchant", price });
      refresh("Claim sold", `${formatNumber(price)} ${claim.asset} now — the risk passed to Jun`, "info");
    } catch (caught) {
      refresh("Sale blocked", caught instanceof Error ? caught.message : String(caught), "danger");
    }
  }

  function publishProduct(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    try {
      engine.publishProduct({
        creator: "player",
        name: product.name,
        fundingAsset: product.fundingAsset,
        principalAmount: Number(product.principalAmount),
        term: Number(product.term),
        fixedInterestRate: Number(product.fixedInterestRate),
        creatorFeeRate: Number(product.creatorFeeRate),
        minimumRepaymentReputation: Number(product.minimumRepaymentReputation),
        ...(product.collateralAsset !== "none"
          ? {
              collateral: {
                asset: product.collateralAsset,
                amount: Number(product.collateralAmount),
              },
            }
          : {}),
      });
      const before = engine.inspect().applications.size;
      runAgents(engine, agents);
      const applied = engine.inspect().applications.size > before;
      refresh(
        "Offer published",
        applied
          ? `${product.name} is live — a borrower already applied`
          : `${product.name} is live — waiting for borrowers to apply`,
        "success",
      );
      setInspectorMode("market");
    } catch (caught) {
      refresh("Offer rejected", caught instanceof Error ? caught.message : String(caught), "danger");
    }
  }

  function fundApplication(productId: string, borrowerId: string): void {
    try {
      const marketProduct = state.products.get(productId);
      engine.fundProduct({ productId, funder: "player", borrower: borrowerId });
      runAgents(engine, agents);
      refresh(
        "Capital deployed",
        `${marketProduct?.principalAmount ?? ""} ${marketProduct?.fundingAsset ?? "asset"} → ${state.entities.get(borrowerId)?.name ?? borrowerId}`,
        "success",
      );
      setSelectedEntityId(borrowerId);
      setInspectorMode("entity");
    } catch (caught) {
      refresh("Funding blocked", caught instanceof Error ? caught.message : String(caught), "danger");
    }
  }

  function respondToProposal(agreementId: string, accept: boolean): void {
    try {
      if (accept) {
        engine.acceptAgreement(agreementId, "player");
      } else {
        engine.declineAgreement(agreementId, "player");
      }
      runAgents(engine, agents);
      refresh(
        accept ? "Agreement signed" : "Proposal declined",
        accept ? "The exchange is now binding" : "The counterparty will look elsewhere",
        accept ? "success" : "info",
      );
    } catch (caught) {
      refresh("Response blocked", caught instanceof Error ? caught.message : String(caught), "danger");
    }
  }

  function fillOffer(offer: StandingOffer, amount: number): void {
    try {
      engine.fillOffer({ actor: "player", offerId: offer.id, amount });
      runAgents(engine, agents);
      const verb = offer.side === "buy" ? "Sold" : "Bought";
      refresh(
        "Trade executed",
        `${verb} ${formatNumber(amount)} ${offer.asset} at ${offer.pricePerUnit} ${offer.priceAsset} each`,
        "success",
      );
    } catch (caught) {
      refresh("Trade blocked", caught instanceof Error ? caught.message : String(caught), "danger");
    }
  }

  function maxFillable(offer: StandingOffer): number {
    if (offer.side === "buy") {
      const posterCanPay = Math.floor(
        balanceOf(state, offer.poster, offer.priceAsset) / offer.pricePerUnit,
      );
      return Math.max(
        0,
        Math.min(offer.remaining, Math.floor(balanceOf(state, "player", offer.asset)), posterCanPay),
      );
    }
    const affordable = Math.floor(balanceOf(state, "player", offer.priceAsset) / offer.pricePerUnit);
    return Math.max(
      0,
      Math.min(offer.remaining, affordable, Math.floor(balanceOf(state, offer.poster, offer.asset))),
    );
  }

  function forkProduct(productId: string): void {
    try {
      engine.forkProduct(productId, "player");
      refresh("Offer forked", "A linked variant was added to the market", "info");
    } catch (caught) {
      refresh("Fork blocked", caught instanceof Error ? caught.message : String(caught), "danger");
    }
  }

  function auditProduct(productId: string): void {
    try {
      engine.publishAudit({
        auditor: "player",
        subjectType: "product",
        subjectId: productId,
        assessment: "transparent",
        note: "Terms, eligibility, fee, and collateral rules are publicly disclosed.",
      });
      refresh("Audit verified", "Transparent terms are now visible to the network", "success");
    } catch (caught) {
      refresh("Audit blocked", caught instanceof Error ? caught.message : String(caught), "danger");
    }
  }

  function transferClaim(claimId: string): void {
    try {
      engine.transferRepaymentClaim({ actor: "player", claimId, to: "merchant" });
      refresh("Claim transferred", "Jun's Trading House now holds the repayment right", "info");
    } catch (caught) {
      refresh("Transfer blocked", caught instanceof Error ? caught.message : String(caught), "danger");
    }
  }

  function resetWorld(): void {
    localStorage.removeItem(STORAGE_KEY);
    setSession(createDefaultScenario());
    setProduct(initialProduct);
    setSelectedEntityId("farmer");
    setAssetFilter("all");
    setInspectorMode("entity");
    setFeedback({
      message: "New network initialized",
      detail: "Capital is ready for a new strategy.",
      tone: "info",
    });
  }

  return (
    <div className="game-shell">
      <header className="hud-bar">
        <div className="brand">
          <div className="brand-orb"><Landmark size={24} strokeWidth={2.2} /></div>
          <div>
            <strong>Banker Simulation</strong>
            <span>Financial Network Sandbox</span>
          </div>
        </div>

        <div className="metric-deck" aria-label="Portfolio summary">
          <div className="metric-chip metric-chip--value">
            <CircleDollarSign size={20} />
            <span><small>Net value</small><strong>{formatNumber(playerPortfolioValue)}</strong></span>
          </div>
          <div className="metric-chip metric-chip--cash">
            <Coins size={20} />
            <span><small>Liquidity</small><strong>{formatNumber(balanceOf(state, "player", "coin"))}</strong></span>
          </div>
          <div className="metric-chip metric-chip--trust">
            <BadgeCheck size={20} />
            <span><small>Reputation</small><strong>{playerReputation.score === null ? "NEW" : `${Math.round(playerReputation.score * 100)}%`}</strong></span>
          </div>
          <div className="metric-chip metric-chip--risk">
            <Activity size={20} />
            <span><small>Risk</small><strong>{riskScore}%</strong></span>
          </div>
        </div>

        <div className="time-cluster" aria-label="World time controls">
          <div className="world-clock"><Clock3 size={18} /><span>t{state.time}</span></div>
          <button type="button" className="icon-button" onClick={() => advance(1)} aria-label="Advance one tick" title="Advance one tick">
            <Play size={18} fill="currentColor" />
          </button>
          <button type="button" className="advance-button" onClick={() => advance(6)} aria-label="Advance six ticks">
            <FastForward size={18} fill="currentColor" /><span>+6</span>
          </button>
        </div>
      </header>

      <main className="game-layout">
        <aside className="asset-rail" aria-label="Asset layers">
          <div className="rail-emblem"><Layers3 size={22} /></div>
          <div className="rail-buttons">
            {filterOptions.map(({ id, label, icon: Icon }) => (
              <button
                type="button"
                key={id}
                className={`rail-button ${assetFilter === id ? "is-active" : ""}`}
                onClick={() => setAssetFilter(id)}
                aria-label={label}
                title={label}
              >
                <Icon size={21} />
                <span>{label}</span>
              </button>
            ))}
          </div>
          <div className="rail-spacer" />
          <button type="button" className="rail-button rail-button--reset" onClick={resetWorld} aria-label="Reset world" title="Reset world">
            <RefreshCcw size={20} />
            <span>Reset</span>
          </button>
        </aside>

        <section className={`network-board filter-${assetFilter}`} aria-label="Financial network board">
          <img className="board-art" src="/assets/board/network-grid-light.webp" alt="" aria-hidden="true" />
          <div className="board-glow" aria-hidden="true" />
          <div className="board-grid" aria-hidden="true" />

          <div className="board-head">
            <span className="live-pill"><i /> Market live</span>
            <span className="network-count"><UsersRound size={14} /> {entities.length} actors</span>
            <span className="network-count"><FileText size={14} /> {state.agreements.size} contracts</span>
            <span className="signal-pill"><Activity size={14} /> {worldSignal}</span>
          </div>

          <section className="new-player-guide" aria-label="Your first objective">
            <span className="guide-step">Your first move</span>
            <h2>Choose where your capital goes</h2>
            <p>Mina needs seed; Sol needs grain for the mill. Your 15 coins fund only one 10-coin application, and Aster may fund another after one tick.</p>
            <ol>
              <li><b>1</b> Publish 12-tick working-capital terms</li>
              <li><b>2</b> Compare the farm and mill applications</li>
              <li><b>3</b> Fund one, or wait and preserve cash</li>
            </ol>
            <button type="button" onClick={() => document.getElementById("loan-composer")?.scrollIntoView({ behavior: "smooth", block: "center" })}>
              Create a capital line <ArrowRight size={15} />
            </button>
          </section>

          <svg className="network-lines" viewBox="0 0 1000 620" preserveAspectRatio="none" aria-hidden="true">
            <path className="flow-line flow-line--cash" d="M500 420 C420 365 335 280 250 185" />
            <path className="flow-line flow-line--claim" d="M500 420 C585 365 665 280 750 185" />
            <path className="flow-line flow-line--market" d="M270 170 C430 95 575 95 730 170" />
            <path className="flow-line flow-line--information" d="M500 420 C510 295 505 245 500 120" />
            <circle className="flow-junction" cx="500" cy="420" r="6" />
            <circle className="flow-junction" cx="250" cy="185" r="5" />
            <circle className="flow-junction" cx="750" cy="185" r="5" />
          </svg>

          {(["coin", "seed", "claim", "land"] as const).map((asset, index) => {
            const artwork = assetArtwork[asset];
            if (!artwork) return null;
            return (
              <div className={`floating-token token--${asset} token--${["one", "two", "three", "four"][index]}`} aria-hidden="true" key={asset}>
                <img src={artwork.token} alt="" />
                <img src={artwork.icon} alt="" />
              </div>
            );
          })}

          <button
            type="button"
            className={`contract-core ${products.length ? "is-live" : ""}`}
            onClick={() => setInspectorMode("market")}
            aria-label="Open product market"
          >
            <img className="contract-core__art" src={products.length ? "/assets/contracts/contract-approved.webp" : "/assets/contracts/contract-core.webp"} alt="" />
            <b>{products.length}</b>
            <small>offers</small>
          </button>

          {entities.map((entity, index) => {
            const artwork = entityArtwork[entity.id] ?? fallbackEntityArtwork;
            const holdings = [...state.assets.values()].filter(
              (asset) => balanceOf(state, entity.id, asset.id) > 0 &&
                (assetFilter === "all" || asset.kind === assetFilter),
            );
            const position = entityPositions[entity.id] ?? {
              left: `${20 + (index % 4) * 20}%`,
              top: `${22 + Math.floor(index / 4) * 25}%`,
            };
            const reputation = reputationOf(state, entity.id);
            return (
              <button
                type="button"
                key={entity.id}
                className={`stakeholder-node node--${entity.id} ${selectedEntityId === entity.id ? "is-selected" : ""}`}
                style={position}
                onClick={() => chooseEntity(entity.id)}
                aria-label={`Inspect ${entity.name}`}
              >
                <img className="node-ring-art" src={selectedEntityId === entity.id ? "/assets/stakeholders/ring-selected.webp" : "/assets/stakeholders/ring-active.webp"} alt="" aria-hidden="true" />
                <span className="node-platform">
                  <span className="node-visual"><img className="node-frame-art" src={artwork.frame} alt="" /><img className="node-avatar-art" src={artwork.avatar} alt="" /></span>
                  <span className="node-copy">
                    <small>{entityRole[entity.id] ?? "Network participant"}</small>
                    <strong>{entity.name}</strong>
                  </span>
                  <span className="node-trust">{reputation.score === null ? "NEW" : `${Math.round(reputation.score * 100)}%`}</span>
                  <span className="node-assets">
                    {holdings.slice(0, 3).map((asset) => {
                      const AssetIcon = assetIcons[asset.id] ?? Gem;
                      return (
                        <span className={`mini-asset asset-${asset.id}`} key={asset.id} title={asset.name}>
                          <img src={assetArtwork[asset.id]?.icon ?? "/assets/assets/class-information.svg"} alt="" /> {formatNumber(balanceOf(state, entity.id, asset.id))}
                        </span>
                      );
                    })}
                  </span>
                </span>
              </button>
            );
          })}

          <div className={`feedback-toast feedback-${feedback.tone}`} role="status">
            <span className="feedback-icon"><FeedbackIcon size={20} /></span>
            <div><strong>{feedback.message}</strong><small>{feedback.detail}</small></div>
          </div>
        </section>

        <aside className="inspector-panel">
          <div className="inspector-tabs" role="tablist" aria-label="Inspector views">
            <button type="button" className={inspectorMode === "entity" ? "is-active" : ""} onClick={() => setInspectorMode("entity")} aria-label="Participant" title="Participant"><UserRound size={19} /></button>
            <button type="button" className={inspectorMode === "market" ? "is-active" : ""} onClick={() => setInspectorMode("market")} aria-label="Market offers" title="Market offers"><WalletCards size={19} /></button>
            <button type="button" className={inspectorMode === "activity" ? "is-active" : ""} onClick={() => setInspectorMode("activity")} aria-label="Market activity" title="Market activity"><Activity size={19} /></button>
            <button type="button" className={inspectorMode === "distress" ? "is-active" : ""} onClick={() => setInspectorMode("distress")} aria-label="Distress desk" title="Distress desk">
              <AlertTriangle size={19} />
              {atRiskClaims.length > 0 && <span className="tab-badge">{atRiskClaims.length}</span>}
            </button>
          </div>

          {inspectorMode === "entity" && selectedEntity && (
            <div className="inspector-content entity-view">
              <div className={`entity-portrait portrait--${selectedEntity.id}`}>
                <img src={(entityArtwork[selectedEntity.id] ?? fallbackEntityArtwork).avatar} alt="" />
                <span className="portrait-badge">{selectedEntity.controller === "human" ? <Landmark size={14} /> : <Activity size={14} />}</span>
              </div>
              <p className="section-kicker">{selectedEntity.controller === "human" ? "Portfolio owner" : "Network participant"}</p>
              <h2>{selectedEntity.name}</h2>

              {selectedEntity.id === "rival" && (
                <div className="strategy-card">
                  <strong>Published funding policy</strong>
                  <span>Wait 1 tick · minimum 10% interest · maximum 12 coin · collateral first</span>
                </div>
              )}
              {selectedEntity.id === "mill" && (
                <div className="strategy-card">
                  <strong>Operating plan</strong>
                  <span>Needs 8 coin · minimum 12 ticks · buys grain at 1.25 · mills at t11</span>
                </div>
              )}

              <div className="trust-overview">
                <div className="score-dial" style={{ "--score": `${Math.round((selectedReputation?.score ?? 0.5) * 360)}deg` } as React.CSSProperties}>
                  <span>{selectedReputation?.score === null ? "—" : Math.round((selectedReputation?.score ?? 0) * 100)}</span>
                  <small>trust</small>
                </div>
                <div className="relationship-stats">
                  <span><FileText size={15} /><b>{[...state.agreements.values()].filter((agreement) => agreement.parties.includes(selectedEntity.id)).length}</b> contracts</span>
                  <span><ShieldCheck size={15} /><b>{selectedReputation?.settled ?? 0}</b> settled</span>
                  <span><Activity size={15} /><b>{selectedReputation?.defaulted ?? 0}</b> missed</span>
                </div>
              </div>

              <div className="inspector-section-title"><span>Portfolio</span><small>{assetFilter === "all" ? "all assets" : assetFilter}</small></div>
              <div className="holding-grid">
                {[...state.assets.values()]
                  .filter((asset) => balanceOf(state, selectedEntity.id, asset.id) > 0 && (assetFilter === "all" || asset.kind === assetFilter))
                  .map((asset) => {
                    const AssetIcon = assetIcons[asset.id] ?? Gem;
                    return (
                      <div className={`holding-card asset-${asset.id}`} key={asset.id}>
                        <img src={assetArtwork[asset.id]?.icon ?? "/assets/assets/class-information.svg"} alt="" />
                        <span><strong>{formatNumber(balanceOf(state, selectedEntity.id, asset.id))}</strong><small>{asset.name}</small></span>
                      </div>
                    );
                  })}
                {assetFilter === "claim" && (
                  <div className="holding-card asset-claim"><Ticket size={19} /><span><strong>{[...state.repaymentClaims.values()].filter((claim) => claim.holder === selectedEntity.id).length}</strong><small>Claims</small></span></div>
                )}
              </div>

              {selectedEntity.id !== "player" && (
                <button type="button" className="panel-primary" onClick={() => setInspectorMode("market")}>
                  <HandCoins size={18} /><span>Explore funding</span><ArrowRight size={16} />
                </button>
              )}

              <div className="mini-agreements">
                <div className="inspector-section-title"><span>Relationships</span><small>{activeAgreements.length} active</small></div>
                {[...state.agreements.values()]
                  .filter((agreement) => agreement.parties.includes(selectedEntity.id))
                  .slice(-2)
                  .map((agreement) => (
                    <div className="agreement-mini" key={agreement.id}>
                      <span className={`agreement-dot status-${agreement.status}`} />
                      <div><strong>{agreement.memo}</strong><small>{agreementSummary(agreement)}</small></div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {inspectorMode === "market" && (
            <div className="inspector-content market-view">
              <p className="section-kicker">Open network</p>
              <div className="panel-heading-row"><h2>Market offers</h2><span>{products.length}</span></div>

              {inboundProposals.length > 0 && (
                <div className="proposal-section">
                  <div className="inspector-section-title"><span>Inbound proposals</span><small>{inboundProposals.length} waiting</small></div>
                  {inboundProposals.map((agreement) => (
                    <div className="proposal-card" key={agreement.id}>
                      <div><strong>{state.entities.get(agreement.proposer)?.name ?? agreement.proposer}</strong><small>{agreementSummary(agreement)}</small></div>
                      <div className="proposal-actions">
                        <button type="button" className="proposal-accept" onClick={() => respondToProposal(agreement.id, true)}>Accept</button>
                        <button type="button" className="proposal-decline" onClick={() => respondToProposal(agreement.id, false)}>Decline</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="offer-list">
                {products.map((marketProduct) => {
                  const collateralName = marketProduct.collateral
                    ? state.assets.get(marketProduct.collateral.asset)?.name ?? marketProduct.collateral.asset
                    : "None";
                  const auditCount = [...state.audits.values()].filter((audit) => audit.subjectId === marketProduct.id).length;
                  const productApplications = openApplications.filter(
                    (application) => application.productId === marketProduct.id,
                  );
                  return (
                    <article className="offer-card" key={marketProduct.id}>
                      <div className="offer-card__top"><span className="offer-icon"><FileCheck2 size={20} /></span><span className="offer-state">Live</span></div>
                      <h3>{marketProduct.name}</h3>
                      <div className="offer-flow">
                        <span><Coins size={15} /><b>{marketProduct.principalAmount}</b></span>
                        <ArrowRight size={15} />
                        <span><Clock3 size={15} /><b>{marketProduct.term}</b></span>
                        <ArrowRight size={15} />
                        <span><TrendingUp size={15} /><b>{productRepayment(marketProduct)}</b></span>
                      </div>
                      <div className="offer-tags">
                        <span><Scale size={13} /> {Math.round(marketProduct.fixedInterestRate * 100)}%</span>
                        <span><LockKeyhole size={13} /> {collateralName}</span>
                        {auditCount > 0 && <span><BadgeCheck size={13} /> audited</span>}
                      </div>
                      {productApplications.map((application) => (
                        <div className="application-row" key={application.id}>
                          <button
                            type="button"
                            className="fund-button"
                            onClick={() => fundApplication(marketProduct.id, application.borrower)}
                          >
                            <HandCoins size={17} />
                            Fund {state.entities.get(application.borrower)?.name ?? application.borrower}
                          </button>
                          <button
                            type="button"
                            className="preview-button"
                            onClick={() => previewFunding(marketProduct, application.borrower, application.id)}
                          >
                            <BarChart3 size={13} /> Preview outcome ({marketProduct.term} ticks)
                          </button>
                          {projection?.applicationId === application.id && (
                            <div className="projection-summary">
                              <span>
                                <strong>{Math.round(projection.summary.probabilityOfDefault * 100)}%</strong>
                                <small>default risk</small>
                              </span>
                              <span>
                                <strong>{formatNumber(projection.summary.meanNetValue)}</strong>
                                <small>expected value</small>
                              </span>
                              <span>
                                <strong>
                                  {formatNumber(projection.summary.worstCase.playerNetValue)} – {formatNumber(projection.summary.bestCase.playerNetValue)}
                                </strong>
                                <small>worst – best case</small>
                              </span>
                            </div>
                          )}
                        </div>
                      ))}
                      {productApplications.length === 0 && (
                        <div className="no-applicants"><UserRound size={14} /> No applications yet — borrowers only accept terms they can live with</div>
                      )}
                      <div className="offer-secondary">
                        <button type="button" onClick={() => forkProduct(marketProduct.id)}>Fork</button>
                        <button type="button" onClick={() => auditProduct(marketProduct.id)}>Audit</button>
                      </div>
                    </article>
                  );
                })}
                {products.length === 0 && (
                  <div className="market-empty"><Sparkles size={28} /><strong>No live offers</strong><span>Compose the first product below.</span></div>
                )}
              </div>

              <div className="price-section">
                <div className="inspector-section-title"><span>Live prices</span><small>{liveOffers.length} standing</small></div>
                {liveOffers.map((offer) => {
                  const fillable = maxFillable(offer);
                  return (
                    <div className="price-row" key={offer.id}>
                      <span className={`price-side price-side--${offer.side}`}>{offer.side === "buy" ? "BID" : "ASK"}</span>
                      <div>
                        <strong>{state.assets.get(offer.asset)?.name ?? offer.asset} @ {offer.pricePerUnit} {offer.priceAsset}</strong>
                        <small>{state.entities.get(offer.poster)?.name ?? offer.poster} · {formatNumber(offer.remaining)} left</small>
                      </div>
                      <div className="price-actions">
                        <button type="button" disabled={fillable < 1} onClick={() => fillOffer(offer, 1)} title={offer.side === "buy" ? "Sell 1" : "Buy 1"}>×1</button>
                        <button type="button" disabled={fillable < 1} onClick={() => fillOffer(offer, fillable)} title={offer.side === "buy" ? "Sell max" : "Buy max"}>Max</button>
                      </div>
                    </div>
                  );
                })}
                {liveOffers.length === 0 && <div className="market-empty"><strong>No standing offers</strong><span>Nobody is quoting prices right now.</span></div>}
              </div>

              {heldClaims.length > 0 && (
                <div className="claim-section">
                  <div className="inspector-section-title"><span>Your claims</span><small>{heldClaims.length}</small></div>
                  {heldClaims.map((claim) => (
                    <div className="claim-card" key={claim.id}>
                      <Ticket size={18} />
                      <span><strong>{claim.amount} {claim.asset}</strong><small>due t{claim.dueAt}</small></span>
                      <button type="button" onClick={() => transferClaim(claim.id)} aria-label="Transfer claim" title="Transfer to Jun"><ArrowRight size={16} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {inspectorMode === "activity" && (
            <div className="inspector-content activity-view">
              <p className="section-kicker">Append-only history</p>
              <div className="panel-heading-row"><h2>Market activity</h2><span>{events.length}</span></div>
              <div className="activity-list">
                {[...events].reverse().slice(0, 9).map((event) => {
                  const tone = eventTone(event);
                  const Icon = feedbackIcon(tone);
                  return (
                    <div className={`activity-item activity-${tone}`} key={event.id}>
                      <span className="activity-icon"><Icon size={15} /></span>
                      <div><strong>{eventLabels[event.type] ?? event.type}</strong><small>{eventDetail(event)}</small></div>
                      <time>t{event.at}</time>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {inspectorMode === "distress" && (
            <div className="inspector-content distress-view">
              <p className="section-kicker">At-risk positions</p>
              <div className="panel-heading-row"><h2>Distress desk</h2><span>{atRiskClaims.length}</span></div>
              {atRiskClaims.length === 0 && (
                <div className="market-empty">
                  <ShieldCheck size={28} />
                  <strong>Nothing at risk</strong>
                  <span>No claim you hold is due within the next {DISTRESS_HORIZON} ticks.</span>
                </div>
              )}
              {atRiskClaims.map((claim) => {
                const agreement = state.agreements.get(claim.agreementId);
                const obligation = agreement?.obligations.find((item) => item.id === claim.obligationId);
                const borrowerId = obligation?.from ?? "unknown";
                return (
                  <div className="distress-card" key={claim.id}>
                    <div className="distress-card__top">
                      <AlertTriangle size={16} />
                      <div>
                        <strong>{state.entities.get(borrowerId)?.name ?? borrowerId}</strong>
                        <small>{formatNumber(claim.amount)} {claim.asset} due t{claim.dueAt}</small>
                      </div>
                    </div>
                    <div className="distress-actions">
                      <button type="button" onClick={() => extendClaim(claim)}>
                        <TimerReset size={14} /> Extend +{DISTRESS_HORIZON}
                      </button>
                      <button type="button" onClick={() => callInClaim(claim)}>
                        <Gavel size={14} /> Call in
                      </button>
                      <button type="button" onClick={() => sellClaimAtDiscount(claim)}>
                        <Ticket size={14} /> Sell 90%
                      </button>
                    </div>
                  </div>
                );
              })}
              <button
                type="button"
                className="panel-primary"
                onClick={() => {
                  setInspectorMode("market");
                  document.getElementById("loan-composer")?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
              >
                <LifeBuoy size={18} /><span>Publish a bridge loan</span><ArrowRight size={16} />
              </button>
            </div>
          )}
        </aside>

        <section className="contract-composer" id="loan-composer">
          <img className="composer-tray-art" src="/assets/composer/tray-surface.webp" alt="" aria-hidden="true" />
          <form onSubmit={publishProduct}>
            <div className="composer-brand">
              <span className="composer-icon"><FileCheck2 size={22} /></span>
              <div><small>New product</small><input aria-label="Product name" value={product.name} onChange={(event) => setProduct({ ...product, name: event.target.value })} /></div>
            </div>

            <div className="composer-track">
              <label className="composer-module module-funding"><img src="/assets/composer/module-funding.webp" alt="" aria-hidden="true" />
                <span><b>1</b><Coins size={16} /> Give cash</span>
                <div className="module-controls">
                  <select aria-label="Funding asset" value={product.fundingAsset} onChange={(event) => setProduct({ ...product, fundingAsset: event.target.value })}>
                    {[...state.assets.values()].filter((asset) => asset.divisible).map((asset) => <option value={asset.id} key={asset.id}>{asset.name}</option>)}
                  </select>
                  <input aria-label="Principal amount" type="number" min="0.01" step="0.01" value={product.principalAmount} onChange={(event) => setProduct({ ...product, principalAmount: event.target.value })} />
                </div>
              </label>
              <ArrowRight className="module-arrow" size={18} />

              <label className="composer-module module-time"><img src="/assets/composer/module-time.webp" alt="" aria-hidden="true" />
                <span><b>2</b><Clock3 size={16} /> Repay in</span>
                <div className="single-control"><input aria-label="Term in ticks" type="number" min="1" step="1" value={product.term} onChange={(event) => setProduct({ ...product, term: event.target.value })} /><small>ticks</small></div>
              </label>
              <ArrowRight className="module-arrow" size={18} />

              <label className="composer-module module-return"><img src="/assets/composer/module-return.webp" alt="" aria-hidden="true" />
                <span><b>3</b><TrendingUp size={16} /> Earn back</span>
                <div className="single-control"><input aria-label="Fixed interest" type="number" min="0" max="0.99" step="0.01" value={product.fixedInterestRate} onChange={(event) => setProduct({ ...product, fixedInterestRate: event.target.value })} /><small>{repaymentPreview}</small></div>
              </label>
              <ArrowRight className="module-arrow" size={18} />

              <label className="composer-module module-rules"><img src="/assets/composer/module-condition.webp" alt="" aria-hidden="true" />
                <span><b>4</b><Scale size={16} /> Safety rules</span>
                <div className="module-controls">
                  <input aria-label="Repayment reputation threshold" title="Reputation threshold" type="number" min="0" max="1" step="0.05" value={product.minimumRepaymentReputation} onChange={(event) => setProduct({ ...product, minimumRepaymentReputation: event.target.value })} />
                  <input aria-label="Creator fee" title="Creator fee" type="number" min="0" max="0.99" step="0.01" value={product.creatorFeeRate} onChange={(event) => setProduct({ ...product, creatorFeeRate: event.target.value })} />
                </div>
              </label>
              <ArrowRight className="module-arrow" size={18} />

              <label className="composer-module module-collateral"><img src="/assets/composer/module-collateral.webp" alt="" aria-hidden="true" />
                <span><b>5</b><LockKeyhole size={16} /> Backup asset</span>
                <div className="module-controls">
                  <select aria-label="Collateral asset" value={product.collateralAsset} onChange={(event) => setProduct({ ...product, collateralAsset: event.target.value })}>
                    <option value="none">None</option>
                    {[...state.assets.values()].map((asset) => <option value={asset.id} key={asset.id}>{asset.name}</option>)}
                  </select>
                  <input aria-label="Collateral amount" disabled={product.collateralAsset === "none"} type="number" min="0.01" step="0.01" value={product.collateralAmount} onChange={(event) => setProduct({ ...product, collateralAmount: event.target.value })} />
                </div>
              </label>
            </div>

            <button type="submit" className="publish-button">
              <span className="publish-ring"><BadgeCheck size={25} /></span>
              <small>Publish</small>
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
