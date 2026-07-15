import { useState, type FormEvent } from "react";
import {
  Activity,
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
  Gem,
  HandCoins,
  House,
  Landmark,
  Layers3,
  Leaf,
  LockKeyhole,
  Package,
  Play,
  RefreshCcw,
  Scale,
  ShieldCheck,
  Sparkles,
  Store,
  Ticket,
  TrendingUp,
  UserRound,
  UsersRound,
  WalletCards,
  Wheat,
  type LucideIcon,
} from "lucide-react";
import {
  balanceOf,
  createDefaultScenario,
  reputationOf,
  runAgents,
  type AgreementState,
  type FinancialProduct,
  type StoredEvent,
} from "@banker-simulation/core";

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
type InspectorMode = "entity" | "market" | "activity";
type FeedbackTone = "info" | "success" | "warning" | "danger";

interface Feedback {
  message: string;
  detail: string;
  tone: FeedbackTone;
}

const initialProduct: ProductDraft = {
  name: "Seasonal Farm Advance",
  fundingAsset: "coin",
  principalAmount: "10",
  term: "6",
  fixedInterestRate: "0.15",
  creatorFeeRate: "0.02",
  minimumRepaymentReputation: "0",
  collateralAsset: "land",
  collateralAmount: "1",
};

const valuation: Record<string, number> = {
  coin: 1,
  seed: 10,
  grain: 1,
  land: 200,
};

const assetIcons: Record<string, LucideIcon> = {
  coin: Coins,
  seed: Leaf,
  grain: Wheat,
  land: Building2,
};

const entityIcons: Record<string, LucideIcon> = {
  farmer: Wheat,
  merchant: Store,
  player: Landmark,
};

const eventLabels: Record<string, string> = {
  AgreementProposed: "New agreement",
  AgreementSigned: "Terms signed",
  AgreementActivated: "Contract active",
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
  const [session, setSession] = useState(() => createDefaultScenario());
  const [, setRevision] = useState(0);
  const [product, setProduct] = useState<ProductDraft>(initialProduct);
  const [borrower, setBorrower] = useState("farmer");
  const [selectedEntityId, setSelectedEntityId] = useState("farmer");
  const [assetFilter, setAssetFilter] = useState<AssetFilter>("all");
  const [inspectorMode, setInspectorMode] = useState<InspectorMode>("entity");
  const [feedback, setFeedback] = useState<Feedback>({
    message: "Capital is ready",
    detail: "Select a participant or compose a new offer.",
    tone: "info",
  });

  const { engine, agents } = session;
  const state = engine.inspect();
  const events = engine.events();
  const entities = [...state.entities.values()];
  const products = [...state.products.values()];
  const borrowers = entities.filter((entity) => entity.id !== "player");
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
    setFeedback({ message, detail, tone });
    setRevision((value) => value + 1);
  }

  function chooseEntity(entityId: string): void {
    setSelectedEntityId(entityId);
    if (entityId !== "player") setBorrower(entityId);
    setInspectorMode("entity");
  }

  function advance(ticks: number): void {
    try {
      const before = engine.events().length;
      engine.advanceTo(state.time + ticks);
      const actions = runAgents(engine, agents);
      const generated = engine.events().slice(before);
      const defaulted = generated.find((event) => event.type === "ObligationDefaulted");
      const liquidated = generated.find((event) => event.type === "CollateralLiquidated");
      const production = [...generated].reverse().find((event) => event.type === "ProductionCompleted");

      if (defaulted) {
        const data = defaulted.data as { shortfall: number };
        refresh(
          "Repayment missed",
          `${formatNumber(data.shortfall)} shortfall${liquidated ? " · collateral transferred" : ""}`,
          "danger",
        );
      } else if (production) {
        const successful = (production.data as { successful: boolean }).successful;
        refresh(
          successful ? "Production completed" : "Production shock",
          successful ? "New output entered the network" : "Output fell below plan",
          successful ? "success" : "warning",
        );
      } else {
        refresh(
          `Advanced ${ticks} tick${ticks === 1 ? "" : "s"}`,
          actions ? `${actions} new participant action${actions === 1 ? "" : "s"}` : "No new market actions",
          "info",
        );
      }
      setInspectorMode("activity");
    } catch (caught) {
      refresh("Action blocked", caught instanceof Error ? caught.message : String(caught), "danger");
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
      refresh("Offer published", `${product.name} is live on the network`, "success");
      setInspectorMode("market");
    } catch (caught) {
      refresh("Offer rejected", caught instanceof Error ? caught.message : String(caught), "danger");
    }
  }

  function fundProduct(productId: string): void {
    try {
      const marketProduct = state.products.get(productId);
      const funded = engine.fundProduct({ productId, funder: "player", borrower });
      refresh(
        "Capital deployed",
        `${marketProduct?.principalAmount ?? ""} ${marketProduct?.fundingAsset ?? "asset"} → ${state.entities.get(borrower)?.name ?? borrower}`,
        "success",
      );
      setSelectedEntityId(borrower);
      setInspectorMode("entity");
      void funded;
    } catch (caught) {
      refresh("Funding blocked", caught instanceof Error ? caught.message : String(caught), "danger");
    }
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
    setSession(createDefaultScenario());
    setProduct(initialProduct);
    setBorrower("farmer");
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
          <div className="board-glow" aria-hidden="true" />
          <div className="board-grid" aria-hidden="true" />

          <div className="board-head">
            <span className="live-pill"><i /> Market live</span>
            <span className="network-count"><UsersRound size={14} /> {entities.length} actors</span>
            <span className="network-count"><FileText size={14} /> {state.agreements.size} contracts</span>
            <span className="signal-pill"><Activity size={14} /> {worldSignal}</span>
          </div>

          <svg className="network-lines" viewBox="0 0 1000 620" preserveAspectRatio="none" aria-hidden="true">
            <path className="flow-line flow-line--cash" d="M500 420 C420 365 335 280 250 185" />
            <path className="flow-line flow-line--claim" d="M500 420 C585 365 665 280 750 185" />
            <path className="flow-line flow-line--market" d="M270 170 C430 95 575 95 730 170" />
            <path className="flow-line flow-line--information" d="M500 420 C510 295 505 245 500 120" />
            <circle className="flow-junction" cx="500" cy="420" r="6" />
            <circle className="flow-junction" cx="250" cy="185" r="5" />
            <circle className="flow-junction" cx="750" cy="185" r="5" />
          </svg>

          <div className="floating-token token--coin token--one" aria-hidden="true"><Coins size={18} /></div>
          <div className="floating-token token--seed token--two" aria-hidden="true"><Leaf size={18} /></div>
          <div className="floating-token token--claim token--three" aria-hidden="true"><Ticket size={18} /></div>
          <div className="floating-token token--land token--four" aria-hidden="true"><Building2 size={18} /></div>

          <button
            type="button"
            className={`contract-core ${products.length ? "is-live" : ""}`}
            onClick={() => setInspectorMode("market")}
            aria-label="Open product market"
          >
            <span className="contract-core__ring" />
            <FileCheck2 size={24} />
            <b>{products.length}</b>
            <small>offers</small>
          </button>

          {entities.map((entity, index) => {
            const Icon = entityIcons[entity.id] ?? UserRound;
            const holdings = [...state.assets.values()].filter(
              (asset) => balanceOf(state, entity.id, asset.id) > 0 &&
                (assetFilter === "all" || asset.kind === assetFilter),
            );
            const fallbackPositions = [
              { left: "24%", top: "28%" },
              { left: "76%", top: "28%" },
              { left: "50%", top: "67%" },
            ];
            const position = entity.id === "player"
              ? { left: "50%", top: "67%" }
              : fallbackPositions[index] ?? { left: `${20 + (index % 4) * 20}%`, top: `${22 + Math.floor(index / 4) * 25}%` };
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
                <span className="node-rings" aria-hidden="true" />
                <span className="node-platform">
                  <span className="node-visual"><Icon size={40} strokeWidth={1.7} /></span>
                  <span className="node-copy">
                    <small>{entity.id === "player" ? "Your cooperative" : entity.controller}</small>
                    <strong>{entity.name}</strong>
                  </span>
                  <span className="node-trust">{reputation.score === null ? "NEW" : `${Math.round(reputation.score * 100)}%`}</span>
                  <span className="node-assets">
                    {holdings.slice(0, 3).map((asset) => {
                      const AssetIcon = assetIcons[asset.id] ?? Gem;
                      return (
                        <span className={`mini-asset asset-${asset.id}`} key={asset.id} title={asset.name}>
                          <AssetIcon size={12} /> {formatNumber(balanceOf(state, entity.id, asset.id))}
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
          </div>

          {inspectorMode === "entity" && selectedEntity && (
            <div className="inspector-content entity-view">
              <div className={`entity-portrait portrait--${selectedEntity.id}`}>
                {(() => { const Icon = entityIcons[selectedEntity.id] ?? UserRound; return <Icon size={48} strokeWidth={1.6} />; })()}
                <span className="portrait-badge">{selectedEntity.controller === "human" ? <Landmark size={14} /> : <Activity size={14} />}</span>
              </div>
              <p className="section-kicker">{selectedEntity.controller === "human" ? "Portfolio owner" : "Network participant"}</p>
              <h2>{selectedEntity.name}</h2>

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
                        <AssetIcon size={19} />
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
              <label className="borrower-picker">
                <UserRound size={15} />
                <select value={borrower} onChange={(event) => { setBorrower(event.target.value); setSelectedEntityId(event.target.value); }} aria-label="Borrower">
                  {borrowers.map((entity) => <option value={entity.id} key={entity.id}>{entity.name}</option>)}
                </select>
              </label>

              <div className="offer-list">
                {products.map((marketProduct) => {
                  const collateralName = marketProduct.collateral
                    ? state.assets.get(marketProduct.collateral.asset)?.name ?? marketProduct.collateral.asset
                    : "None";
                  const auditCount = [...state.audits.values()].filter((audit) => audit.subjectId === marketProduct.id).length;
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
                      <button type="button" className="fund-button" onClick={() => fundProduct(marketProduct.id)}><HandCoins size={17} />Fund {state.entities.get(borrower)?.name ?? borrower}</button>
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
        </aside>

        <section className="contract-composer">
          <form onSubmit={publishProduct}>
            <div className="composer-brand">
              <span className="composer-icon"><FileCheck2 size={22} /></span>
              <div><small>New product</small><input aria-label="Product name" value={product.name} onChange={(event) => setProduct({ ...product, name: event.target.value })} /></div>
            </div>

            <div className="composer-track">
              <label className="composer-module module-funding">
                <span><Coins size={16} /> Funding</span>
                <div className="module-controls">
                  <select aria-label="Funding asset" value={product.fundingAsset} onChange={(event) => setProduct({ ...product, fundingAsset: event.target.value })}>
                    {[...state.assets.values()].filter((asset) => asset.divisible).map((asset) => <option value={asset.id} key={asset.id}>{asset.name}</option>)}
                  </select>
                  <input aria-label="Principal amount" type="number" min="0.01" step="0.01" value={product.principalAmount} onChange={(event) => setProduct({ ...product, principalAmount: event.target.value })} />
                </div>
              </label>
              <ArrowRight className="module-arrow" size={18} />

              <label className="composer-module module-time">
                <span><Clock3 size={16} /> Duration</span>
                <div className="single-control"><input aria-label="Term in ticks" type="number" min="1" step="1" value={product.term} onChange={(event) => setProduct({ ...product, term: event.target.value })} /><small>ticks</small></div>
              </label>
              <ArrowRight className="module-arrow" size={18} />

              <label className="composer-module module-return">
                <span><TrendingUp size={16} /> Return</span>
                <div className="single-control"><input aria-label="Fixed interest" type="number" min="0" max="0.99" step="0.01" value={product.fixedInterestRate} onChange={(event) => setProduct({ ...product, fixedInterestRate: event.target.value })} /><small>{repaymentPreview}</small></div>
              </label>
              <ArrowRight className="module-arrow" size={18} />

              <label className="composer-module module-rules">
                <span><Scale size={16} /> Rules</span>
                <div className="module-controls">
                  <input aria-label="Repayment reputation threshold" title="Reputation threshold" type="number" min="0" max="1" step="0.05" value={product.minimumRepaymentReputation} onChange={(event) => setProduct({ ...product, minimumRepaymentReputation: event.target.value })} />
                  <input aria-label="Creator fee" title="Creator fee" type="number" min="0" max="0.99" step="0.01" value={product.creatorFeeRate} onChange={(event) => setProduct({ ...product, creatorFeeRate: event.target.value })} />
                </div>
              </label>
              <ArrowRight className="module-arrow" size={18} />

              <label className="composer-module module-collateral">
                <span><LockKeyhole size={16} /> Collateral</span>
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
