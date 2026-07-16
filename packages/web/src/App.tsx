import { useState, type FormEvent } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Building2,
  ChevronDown,
  Clock3,
  Coins,
  FastForward,
  HandCoins,
  Landmark,
  Package,
  Play,
  RefreshCcw,
  Store,
  Ticket,
  TrendingUp,
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
  runAgents,
  summarizeTicks,
  type FinancialProduct,
  type ProjectionSummary,
  type RepaymentClaim,
  type StandingOffer,
  type StoredEvent,
} from "@banker-simulation/core";

const STORAGE_KEY = "banker-simulation-events-v4";
const PROJECTION_SEEDS = Array.from({ length: 24 }, (_, index) => index + 1);
const DISTRESS_HORIZON = 3;

type View = "decide" | "portfolio" | "world";
type FeedbackTone = "info" | "success" | "warning" | "danger";

interface ProductDraft {
  principalAmount: string;
  term: string;
  fixedInterestRate: string;
  collateralAsset: string;
}

interface Feedback {
  message: string;
  tone: FeedbackTone;
}

const initialProduct: ProductDraft = {
  principalAmount: "10",
  term: "12",
  fixedInterestRate: "0.15",
  collateralAsset: "none",
};

const valuation: Record<string, number> = {
  coin: 1,
  seed: 10,
  grain: 1,
  flour: 1.2,
  land: 200,
};

const borrowerInfo: Record<string, { icon: LucideIcon; label: string; chain: string; chance: string }> = {
  farmer: { icon: Wheat, label: "Mina's Farm", chain: "Seed → grain", chance: "70% harvest" },
  mill: { icon: Building2, label: "Sol's Mill", chain: "Grain → flour", chance: "85% milling" },
};

function loadSession(): ReturnType<typeof createDefaultScenario> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const store = new MemoryEventStore();
      store.append(JSON.parse(raw) as StoredEvent[], 0);
      return createDefaultScenario({ store });
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return createDefaultScenario();
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(value);
}

function repaymentOf(product: FinancialProduct): number {
  return Math.round(product.principalAmount * (1 + product.fixedInterestRate) * 100) / 100;
}

function eventSummary(event: StoredEvent): string | null {
  const data = event.data as Record<string, unknown>;
  if (event.type === "ProductFunded") {
    const funding = data.funding as { funder: string; borrower: string };
    return `${funding.funder === "rival" ? "Aster" : "You"} funded ${borrowerInfo[funding.borrower]?.label ?? funding.borrower}`;
  }
  if (event.type === "ProductionCompleted") {
    const owner = String(data.owner);
    return `${borrowerInfo[owner]?.label ?? owner}: ${data.successful ? "production succeeded" : "production shock"}`;
  }
  if (event.type === "ObligationSettled") return "A repayment was received";
  if (event.type === "ObligationDefaulted") return "A repayment was missed";
  if (event.type === "OfferFilled") return `${String(data.amount)} units traded`;
  if (event.type === "OfferPosted") {
    const offer = data.offer as StandingOffer;
    return `${offer.asset} price: ${offer.pricePerUnit} coin`;
  }
  return null;
}

export function App() {
  const [session, setSession] = useState(() => loadSession());
  const [, setRevision] = useState(0);
  const [view, setView] = useState<View>("decide");
  const [showCustom, setShowCustom] = useState(false);
  const [product, setProduct] = useState<ProductDraft>(initialProduct);
  const [feedback, setFeedback] = useState<Feedback>({
    message: "Start by opening one loan offer.",
    tone: "info",
  });
  const [projection, setProjection] = useState<{ applicationId: string; summary: ProjectionSummary } | null>(null);

  const { engine, agents } = session;
  const state = engine.inspect();
  const events = engine.events();
  const products = [...state.products.values()];
  const applications = [...state.applications.values()].filter((application) => application.status === "open");
  const inboundProposals = [...state.agreements.values()].filter(
    (agreement) =>
      agreement.status === "proposed" &&
      agreement.parties.includes("player") &&
      !agreement.signatures.has("player"),
  );
  const offers = openOffers(state);
  const claims = [...state.repaymentClaims.values()].filter((claim) => claim.holder === "player");
  const activeClaims = claims.filter((claim) => claim.status === "active");
  const atRiskClaims = activeClaims.filter((claim) => claim.dueAt - state.time <= DISTRESS_HORIZON);
  const playerCash = balanceOf(state, "player", "coin");
  const deployments = [...state.productFundings.values()].filter((funding) => funding.funder === "player");

  function refresh(message: string, tone: FeedbackTone = "info"): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(engine.events()));
    } catch {
      // The in-memory game remains playable when browser storage is unavailable.
    }
    setFeedback({ message, tone });
    setRevision((value) => value + 1);
  }

  function publishDraft(event?: FormEvent<HTMLFormElement>): void {
    event?.preventDefault();
    try {
      engine.publishProduct({
        creator: "player",
        name: "Working Capital Line",
        fundingAsset: "coin",
        principalAmount: Number(product.principalAmount),
        term: Number(product.term),
        fixedInterestRate: Number(product.fixedInterestRate),
        creatorFeeRate: 0.02,
        minimumRepaymentReputation: 0,
        ...(product.collateralAsset !== "none"
          ? { collateral: { asset: product.collateralAsset, amount: 1 } }
          : {}),
      });
      runAgents(engine, agents);
      const applicantCount = [...engine.inspect().applications.values()].filter(
        (application) => application.status === "open",
      ).length;
      setShowCustom(false);
      refresh(
        applicantCount === 1
          ? "One business applied."
          : `${applicantCount} businesses applied. Choose one to fund.`,
        "success",
      );
    } catch (caught) {
      refresh(caught instanceof Error ? caught.message : String(caught), "danger");
    }
  }

  function fund(productId: string, borrower: string): void {
    try {
      engine.fundProduct({ productId, funder: "player", borrower });
      runAgents(engine, agents);
      refresh(`${borrowerInfo[borrower]?.label ?? borrower} received your money.`, "success");
    } catch (caught) {
      refresh(caught instanceof Error ? caught.message : String(caught), "danger");
    }
  }

  function preview(applicationId: string, product: FinancialProduct, borrower: string): void {
    try {
      const summary = projectOutcome({
        events: engine.events(),
        agents,
        ticks: product.term,
        seeds: PROJECTION_SEEDS,
        perspective: "player",
        valuation,
        apply: (projectedEngine) =>
          projectedEngine.fundProduct({ productId: product.id, funder: "player", borrower }),
      });
      setProjection({ applicationId, summary });
    } catch (caught) {
      refresh(caught instanceof Error ? caught.message : String(caught), "danger");
    }
  }

  function advance(ticks: number): void {
    try {
      const beforeState = state;
      const beforeEvents = events.length;
      advanceWithAgents(engine, agents, ticks);
      const digest = summarizeTicks(beforeState, engine.inspect(), engine.events().slice(beforeEvents));
      const rival = digest.capitalDeployments.find((deployment) => deployment.funder === "rival");
      const price = digest.priceMoves[0];
      const message = digest.defaults
        ? `${digest.defaults} repayment missed.`
        : rival
          ? `Aster funded ${borrowerInfo[rival.borrower]?.label ?? rival.borrower}.`
          : digest.productionSuccesses
            ? "Production succeeded."
            : digest.productionFailures
              ? "Production was disrupted."
              : price?.to !== null && price
                ? `${price.asset} price moved to ${price.to}.`
                : `Time moved to t${engine.inspect().time}.`;
      refresh(message, digest.defaults ? "danger" : digest.productionFailures ? "warning" : "success");
    } catch (caught) {
      refresh(caught instanceof Error ? caught.message : String(caught), "danger");
    }
  }

  function respondToProposal(agreementId: string, accept: boolean): void {
    try {
      if (accept) engine.acceptAgreement(agreementId, "player");
      else engine.declineAgreement(agreementId, "player");
      runAgents(engine, agents);
      refresh(accept ? "Barter accepted." : "Barter declined.", accept ? "success" : "info");
    } catch (caught) {
      refresh(caught instanceof Error ? caught.message : String(caught), "danger");
    }
  }

  function fillOffer(offer: StandingOffer): void {
    const amount = maxFillable(offer);
    if (amount < 1) return;
    try {
      engine.fillOffer({ actor: "player", offerId: offer.id, amount });
      runAgents(engine, agents);
      refresh(`${offer.side === "buy" ? "Sold" : "Bought"} ${amount} ${offer.asset}.`, "success");
    } catch (caught) {
      refresh(caught instanceof Error ? caught.message : String(caught), "danger");
    }
  }

  function maxFillable(offer: StandingOffer): number {
    if (offer.side === "buy") {
      return Math.max(0, Math.min(
        offer.remaining,
        Math.floor(balanceOf(state, "player", offer.asset)),
        Math.floor(balanceOf(state, offer.poster, offer.priceAsset) / offer.pricePerUnit),
      ));
    }
    return Math.max(0, Math.min(
      offer.remaining,
      Math.floor(playerCash / offer.pricePerUnit),
      Math.floor(balanceOf(state, offer.poster, offer.asset)),
    ));
  }

  function extendClaim(claim: RepaymentClaim): void {
    try {
      engine.extendObligation({
        actor: "player",
        agreementId: claim.agreementId,
        obligationId: claim.obligationId,
        newDueAt: claim.dueAt + DISTRESS_HORIZON,
      });
      refresh("Payment extended by 3 ticks.", "info");
    } catch (caught) {
      refresh(caught instanceof Error ? caught.message : String(caught), "danger");
    }
  }

  function callClaim(claim: RepaymentClaim): void {
    try {
      engine.callInObligation({ actor: "player", agreementId: claim.agreementId, obligationId: claim.obligationId });
      refresh("Payment resolved now.", "info");
    } catch (caught) {
      refresh(caught instanceof Error ? caught.message : String(caught), "danger");
    }
  }

  function sellClaim(claim: RepaymentClaim): void {
    try {
      const price = Math.round(claim.amount * 0.9 * 100) / 100;
      engine.sellRepaymentClaim({ actor: "player", claimId: claim.id, to: "merchant", price });
      refresh(`Claim sold for ${price} coin.`, "success");
    } catch (caught) {
      refresh(caught instanceof Error ? caught.message : String(caught), "danger");
    }
  }

  function borrowerFor(claim: RepaymentClaim): string {
    const agreement = state.agreements.get(claim.agreementId);
    return agreement?.obligations.find((obligation) => obligation.id === claim.obligationId)?.from ?? "Borrower";
  }

  function reset(): void {
    localStorage.removeItem(STORAGE_KEY);
    setSession(createDefaultScenario());
    setProduct(initialProduct);
    setProjection(null);
    setView("decide");
    setShowCustom(false);
    setFeedback({ message: "Start by opening one loan offer.", tone: "info" });
  }

  return (
    <div className="simple-shell">
      <header className="topbar">
        <div className="brand"><Landmark size={21} /><strong>Small Bank</strong></div>
        <div className="top-stats">
          <span><Coins size={16} /><b>{formatNumber(playerCash)}</b></span>
          <span><Clock3 size={16} /><b>t{state.time}</b></span>
        </div>
        <div className="time-actions">
          <button type="button" onClick={() => advance(1)} aria-label="Advance one tick"><Play size={16} /> +1</button>
          <button type="button" onClick={() => advance(6)} aria-label="Advance six ticks"><FastForward size={16} /> +6</button>
          <button type="button" className="reset-button" onClick={reset} aria-label="Reset game"><RefreshCcw size={16} /></button>
        </div>
      </header>

      <nav className="main-tabs" aria-label="Game views">
        <button type="button" className={view === "decide" ? "active" : ""} onClick={() => setView("decide")}>
          <HandCoins size={18} /> Decide
          {(applications.length + inboundProposals.length) > 0 && <i>{applications.length + inboundProposals.length}</i>}
        </button>
        <button type="button" className={view === "portfolio" ? "active" : ""} onClick={() => setView("portfolio")}>
          <WalletCards size={18} /> Your money
          {atRiskClaims.length > 0 && <i>{atRiskClaims.length}</i>}
        </button>
        <button type="button" className={view === "world" ? "active" : ""} onClick={() => setView("world")}>
          <Activity size={18} /> World
        </button>
      </nav>

      <div className={`feedback feedback-${feedback.tone}`} role="status">{feedback.message}</div>

      <main className="content">
        {view === "decide" && (
          <section className="view-panel">
            {products.length === 0 ? (
              <div className="start-card">
                <span className="step-label">First move</span>
                <h1>Offer one simple loan</h1>
                <div className="starter-terms">
                  <span><b>10</b> coin now</span>
                  <ArrowRight size={18} />
                  <span><b>11.5</b> coin back</span>
                  <span className="term-time">in 12 ticks</span>
                </div>
                <button type="button" className="primary big" onClick={() => publishDraft()}>
                  Open this offer <ArrowRight size={17} />
                </button>
                <button type="button" className="text-button" onClick={() => setShowCustom((value) => !value)}>
                  Change terms <ChevronDown size={15} />
                </button>
                {showCustom && <TermsForm product={product} setProduct={setProduct} onSubmit={publishDraft} />}
              </div>
            ) : applications.length > 0 ? (
              <>
                <div className="view-heading">
                  <span className="step-label">Your decision</span>
                  <h1>Who gets your money?</h1>
                  <p>You have {formatNumber(playerCash)} coin. Aster can act after time moves.</p>
                </div>
                <div className="application-grid">
                  {applications.map((application) => {
                    const marketProduct = state.products.get(application.productId);
                    if (!marketProduct) return null;
                    const info = borrowerInfo[application.borrower];
                    const Icon = info?.icon ?? Building2;
                    const result = projection?.applicationId === application.id ? projection.summary : null;
                    return (
                      <article className="application-card" key={application.id}>
                        <div className="borrower-icon"><Icon size={24} /></div>
                        <div className="borrower-copy">
                          <h2>{info?.label ?? application.borrower}</h2>
                          <p>{info?.chain} <span>·</span> {info?.chance}</p>
                        </div>
                        <div className="loan-numbers">
                          <span><small>You give</small><b>{marketProduct.principalAmount}</b></span>
                          <span><small>You may get</small><b>{repaymentOf(marketProduct)}</b></span>
                          <span><small>Wait</small><b>{marketProduct.term}</b></span>
                        </div>
                        {result && (
                          <div className="risk-result">
                            <span><b>{Math.round(result.probabilityOfDefault * 100)}%</b> miss chance</span>
                            <span><b>{formatNumber(result.meanNetValue)}</b> expected value</span>
                          </div>
                        )}
                        <div className="card-actions">
                          <button type="button" className="primary" disabled={playerCash < marketProduct.principalAmount} onClick={() => fund(marketProduct.id, application.borrower)}>
                            Fund {info?.label.split("'")[0] ?? application.borrower}
                          </button>
                          <button type="button" className="secondary" onClick={() => preview(application.id, marketProduct, application.borrower)}>
                            Check risk
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
                <div className="quiet-note"><Clock3 size={15} /> Moving time gives Aster a chance to take one application.</div>
                {!applications.some((application) => {
                  const candidate = state.products.get(application.productId);
                  return candidate ? candidate.principalAmount <= playerCash : false;
                }) && (
                  <button type="button" className="primary next-step" onClick={() => advance(1)}>
                    Move 1 tick <ArrowRight size={16} />
                  </button>
                )}
              </>
            ) : (
              <div className="next-card">
                <span className="step-label">Decision made</span>
                <h1>Now watch what happens</h1>
                <p>Production and repayments happen as time moves.</p>
                <button type="button" className="primary big" onClick={() => advance(1)}><Play size={17} /> Move 1 tick</button>
                <button type="button" className="text-button" onClick={() => setShowCustom((value) => !value)}>Create another offer</button>
                {showCustom && <TermsForm product={product} setProduct={setProduct} onSubmit={publishDraft} />}
              </div>
            )}

            {products.length > 0 && inboundProposals.map((agreement) => (
              <article className="barter-card" key={agreement.id}>
                <div><span className="step-label">Another option</span><h2>Mina offers grain for your seed</h2></div>
                <div className="card-actions">
                  <button type="button" className="primary" onClick={() => respondToProposal(agreement.id, true)}>Accept</button>
                  <button type="button" className="secondary" onClick={() => respondToProposal(agreement.id, false)}>Decline</button>
                </div>
              </article>
            ))}
          </section>
        )}

        {view === "portfolio" && (
          <section className="view-panel">
            <div className="view-heading"><span className="step-label">Portfolio</span><h1>Your money</h1></div>
            <div className="summary-grid">
              <div><Coins size={21} /><span><small>Available</small><b>{formatNumber(playerCash)} coin</b></span></div>
              <div><Ticket size={21} /><span><small>Active loans</small><b>{activeClaims.length}</b></span></div>
              <div><AlertTriangle size={21} /><span><small>Due soon</small><b>{atRiskClaims.length}</b></span></div>
            </div>
            <div className="section-title"><h2>Loans</h2><span>{deployments.length} funded</span></div>
            {claims.length === 0 ? (
              <div className="empty-state">Fund a business to create your first loan.</div>
            ) : claims.map((claim) => {
              const borrower = borrowerFor(claim);
              return (
                <article className={`claim-card status-${claim.status}`} key={claim.id}>
                  <div><strong>{borrowerInfo[borrower]?.label ?? borrower}</strong><span>{formatNumber(claim.amount)} coin · due t{claim.dueAt}</span></div>
                  <b>{claim.status}</b>
                  {claim.status === "active" && claim.dueAt - state.time <= DISTRESS_HORIZON && (
                    <div className="claim-actions">
                      <button type="button" onClick={() => extendClaim(claim)}>Extend</button>
                      <button type="button" onClick={() => callClaim(claim)}>Call now</button>
                      <button type="button" onClick={() => sellClaim(claim)}>Sell</button>
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        )}

        {view === "world" && (
          <section className="view-panel world-view">
            <div className="view-heading"><span className="step-label">Economy</span><h1>World</h1></div>
            <div className="world-columns">
              <div>
                <div className="section-title"><h2>Prices</h2><span>live</span></div>
                <div className="price-list">
                  {offers.map((offer) => {
                    const fillable = maxFillable(offer);
                    return (
                      <div className="price-card" key={offer.id}>
                        <Package size={19} />
                        <span><strong>{offer.asset}</strong><small>{offer.side === "buy" ? "buyer pays" : "seller asks"}</small></span>
                        <b>{offer.pricePerUnit}</b>
                        {fillable > 0 && <button type="button" onClick={() => fillOffer(offer)}>Trade {fillable}</button>}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                <div className="section-title"><h2>Businesses</h2><span>coin</span></div>
                <div className="business-list">
                  {[
                    ["farmer", Wheat],
                    ["mill", Building2],
                    ["merchant", Store],
                    ["rival", Landmark],
                  ].map(([id, Icon]) => {
                    const BusinessIcon = Icon as LucideIcon;
                    return <div key={id as string}><BusinessIcon size={18} /><span>{state.entities.get(id as string)?.name}</span><b>{formatNumber(balanceOf(state, id as string, "coin"))}</b></div>;
                  })}
                </div>
              </div>
            </div>
            <div className="section-title"><h2>Recent events</h2><span>latest</span></div>
            <div className="event-list">
              {[...events].reverse().map((event) => ({ event, summary: eventSummary(event) })).filter((item) => item.summary).slice(0, 6).map(({ event, summary }) => (
                <div key={event.id}><span>{summary}</span><time>t{event.at}</time></div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function TermsForm({
  product,
  setProduct,
  onSubmit,
}: {
  product: ProductDraft;
  setProduct: (product: ProductDraft) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="terms-form" onSubmit={onSubmit}>
      <label><span>Loan</span><input aria-label="Loan amount" type="number" min="1" value={product.principalAmount} onChange={(event) => setProduct({ ...product, principalAmount: event.target.value })} /></label>
      <label><span>Ticks</span><input aria-label="Loan term" type="number" min="1" value={product.term} onChange={(event) => setProduct({ ...product, term: event.target.value })} /></label>
      <label><span>Interest</span><input aria-label="Interest rate" type="number" min="0" max="0.99" step="0.01" value={product.fixedInterestRate} onChange={(event) => setProduct({ ...product, fixedInterestRate: event.target.value })} /></label>
      <label><span>Backup</span><select aria-label="Collateral" value={product.collateralAsset} onChange={(event) => setProduct({ ...product, collateralAsset: event.target.value })}><option value="none">None</option><option value="land">Land</option></select></label>
      <button type="submit" className="primary">Publish terms</button>
    </form>
  );
}
