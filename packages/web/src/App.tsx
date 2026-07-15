import { useState, type FormEvent } from "react";
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

const eventLabels: Record<string, string> = {
  AgreementProposed: "Contract proposed",
  AgreementSigned: "Contract signed",
  AgreementActivated: "Contract activated",
  AssetTransferred: "Ownership transferred",
  ObligationSettled: "Promise fulfilled",
  ObligationDefaulted: "Promise defaulted",
  ProductionCompleted: "Production resolved",
  ProductionSkipped: "Production missed",
  ProductPublished: "Product published",
  ProductFunded: "Product funded",
  RepaymentClaimCreated: "Repayment claim issued",
  RepaymentClaimTransferred: "Claim transferred",
  CollateralLocked: "Collateral locked",
  CollateralReleased: "Collateral released",
  CollateralLiquidated: "Collateral liquidated",
  AuditPublished: "Audit published",
  TimeAdvanced: "World advanced",
};

function productInterest(product: FinancialProduct): string {
  return `${Math.round(product.fixedInterestRate * 100)}% fixed`;
}

function productRepayment(product: FinancialProduct): number {
  return Math.round(product.principalAmount * (1 + product.fixedInterestRate) * 100) / 100;
}

function eventDetail(event: StoredEvent): string {
  const data = event.data as Record<string, unknown>;
  if (event.type === "AssetTransferred") {
    return `${String(data.from)} sent ${String(data.amount)} ${String(data.asset)} to ${String(data.to)}.`;
  }
  if (event.type === "ProductPublished") {
    const product = data.product as { name?: string };
    return `${product.name ?? "A new template"} is available for use.`;
  }
  if (event.type === "ProductFunded") return "A template became a live contract.";
  if (event.type === "RepaymentClaimTransferred") {
    return `${String(data.from)} assigned a repayment right to ${String(data.to)}.`;
  }
  if (event.type === "CollateralLiquidated") return "A locked asset moved to the claim holder.";
  if (event.type === "ProductionCompleted") {
    return data.successful ? "The harvest was abundant." : "The harvest suffered a shock.";
  }
  if (event.type === "ObligationDefaulted") {
    return `${String(data.debtor)} could not cover a shortfall of ${String(data.shortfall)}.`;
  }
  return `Recorded at world time ${event.at}.`;
}

function agreementSummary(agreement: AgreementState): string {
  return agreement.obligations
    .map(
      (obligation) =>
        `${obligation.amount} ${obligation.asset}: ${obligation.from} → ${obligation.to} at t${obligation.dueAt}`,
    )
    .join(" · ");
}

export function App() {
  const [session, setSession] = useState(() => createDefaultScenario());
  const [, setRevision] = useState(0);
  const [product, setProduct] = useState<ProductDraft>(initialProduct);
  const [borrower, setBorrower] = useState("farmer");
  const [notice, setNotice] = useState("Publish a safe product template, then fund an eligible borrower.");
  const [error, setError] = useState("");

  const { engine, agents } = session;
  const state = engine.inspect();
  const events = engine.events();
  const latestProduction = [...events]
    .reverse()
    .find((event) => event.type === "ProductionCompleted");
  const borrowers = [...state.entities.values()].filter((entity) => entity.id !== "player");
  const player = state.entities.get("player");
  const heldClaims = [...state.repaymentClaims.values()].filter(
    (claim) => claim.holder === "player" && claim.status === "active",
  );

  function refresh(message: string): void {
    setError("");
    setNotice(message);
    setRevision((value) => value + 1);
  }

  function advance(ticks: number): void {
    try {
      engine.advanceTo(state.time + ticks);
      const actions = runAgents(engine, agents);
      refresh(
        actions > 0
          ? `Time advanced ${ticks} ticks. The world generated ${actions} new economic action${actions === 1 ? "" : "s"}.`
          : `Time advanced ${ticks} ticks.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  function publishProduct(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    try {
      const productId = engine.publishProduct({
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
      refresh(`${productId} is live. Other participants can now fund or fork its disclosed terms.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  function fundProduct(productId: string): void {
    try {
      const funded = engine.fundProduct({ productId, funder: "player", borrower });
      refresh(`Funded ${funded.agreementId}. A transferable repayment claim now represents the future promise.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  function forkProduct(productId: string): void {
    try {
      const forkId = engine.forkProduct(productId, "player");
      refresh(`${forkId} is your fork. Its origin remains visible in the market.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
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
      refresh("A signed public audit report was added to the product history.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  function transferClaim(claimId: string): void {
    try {
      engine.transferRepaymentClaim({ actor: "player", claimId, to: "merchant" });
      refresh("The repayment claim now belongs to Jun's Trading House. Future enforcement follows the claim.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  function resetWorld(): void {
    setSession(createDefaultScenario());
    setProduct(initialProduct);
    setBorrower("farmer");
    setError("");
    setNotice("A fresh world began. Build a financial product from the available atoms.");
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">BS</div>
          <div>
            <p className="eyebrow">Economic sandbox / local session</p>
            <h1>Banker Simulation</h1>
          </div>
        </div>
        <div className="time-control" aria-label="World time controls">
          <span><small>World time</small><strong>{state.time}</strong></span>
          <button type="button" className="button ghost" onClick={() => advance(1)}>+1 tick</button>
          <button type="button" className="button primary" onClick={() => advance(6)}>Run 6 ticks</button>
        </div>
      </header>

      <main>
        <section className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow accent">No banks were placed in this world</p>
            <h2>Build the terms. Let the economy test them.</h2>
            <p>
              Products are safe compositions of ownership, transfers, time, conditions, information, and enforcement.
              Start with a need, publish a template, then see whether participants adopt it.
            </p>
          </div>
          <div className="world-signal">
            <span className="pulse" aria-hidden="true" />
            <div>
              <small>Latest world signal</small>
              <strong>
                {latestProduction
                  ? (latestProduction.data as { successful: boolean }).successful
                    ? "Harvest succeeded"
                    : "Harvest shock"
                  : "Capital is waiting for a use"}
              </strong>
            </div>
          </div>
        </section>

        <section className="atom-strip" aria-label="Economic atoms available in this prototype">
          <span><b>Ownership</b> balances &amp; claims</span>
          <span><b>Transfer</b> immediate settlement</span>
          <span><b>Time</b> future payment</span>
          <span><b>Condition</b> repayment history</span>
          <span><b>Enforcement</b> collateral &amp; default</span>
        </section>

        {(notice || error) && (
          <div className={`notice ${error ? "error" : ""}`} role="status">
            {error || notice}
          </div>
        )}

        <section className="dashboard-grid">
          <div className="main-column">
            <section className="panel market-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Market engine</p>
                  <h3>Product market</h3>
                </div>
                <label className="compact-select">
                  Fund for
                  <select value={borrower} onChange={(event) => setBorrower(event.target.value)}>
                    {borrowers.map((entity) => <option value={entity.id} key={entity.id}>{entity.name}</option>)}
                  </select>
                </label>
              </div>
              <div className="product-grid">
                {[...state.products.values()].map((marketProduct) => {
                  const audits = [...state.audits.values()].filter(
                    (audit) => audit.subjectType === "product" && audit.subjectId === marketProduct.id,
                  );
                  const uses = [...state.productFundings.values()].filter(
                    (funding) => funding.productId === marketProduct.id,
                  );
                  const collateralName = marketProduct.collateral
                    ? state.assets.get(marketProduct.collateral.asset)?.name ?? marketProduct.collateral.asset
                    : "None";
                  return (
                    <article className="product-card" key={marketProduct.id}>
                      <div className="agreement-topline">
                        <span className="status active">published</span>
                        <code>{marketProduct.id.slice(0, 18)}</code>
                      </div>
                      <h4>{marketProduct.name}</h4>
                      {marketProduct.sourceProductId && <p className="origin">Forked from {marketProduct.sourceProductId}</p>}
                      <dl className="product-terms">
                        <div><dt>Transfer now</dt><dd>{marketProduct.principalAmount} {marketProduct.fundingAsset}</dd></div>
                        <div><dt>Promise</dt><dd>{productInterest(marketProduct)} / {marketProduct.term} ticks</dd></div>
                        <div><dt>Repayment</dt><dd>{productRepayment(marketProduct)} {marketProduct.fundingAsset}</dd></div>
                        <div><dt>Eligibility</dt><dd>{Math.round(marketProduct.minimumRepaymentReputation * 100)}% repayment history</dd></div>
                        <div><dt>Collateral</dt><dd>{marketProduct.collateral ? `${marketProduct.collateral.amount} ${collateralName}` : "Not required"}</dd></div>
                        <div><dt>Creator fee</dt><dd>{Math.round(marketProduct.creatorFeeRate * 100)}% of repayment</dd></div>
                      </dl>
                      <div className="product-meta">
                        <span>{uses.length} funded</span>
                        <span>{audits.length ? `${audits.length} audit${audits.length === 1 ? "" : "s"}` : "unaudited"}</span>
                      </div>
                      <div className="product-actions">
                        <button type="button" className="button primary compact" onClick={() => fundProduct(marketProduct.id)}>
                          Fund for {state.entities.get(borrower)?.name ?? borrower}
                        </button>
                        <button type="button" className="text-button" onClick={() => forkProduct(marketProduct.id)}>Fork</button>
                        <button type="button" className="text-button" onClick={() => auditProduct(marketProduct.id)}>Audit</button>
                      </div>
                    </article>
                  );
                })}
                {state.products.size === 0 && (
                  <div className="empty-state">No public products yet. Configure one from safe modules on the right.</div>
                )}
              </div>
            </section>

            <section className="panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">World simulation</p>
                  <h3>Participants</h3>
                </div>
                <button type="button" className="text-button" onClick={resetWorld}>Reset world</button>
              </div>
              <div className="entity-grid">
                {[...state.entities.values()].map((entity) => {
                  const reputation = reputationOf(state, entity.id);
                  const holdings = [...state.assets.values()].filter(
                    (asset) => balanceOf(state, entity.id, asset.id) > 0,
                  );
                  return (
                    <article className={`entity-card ${entity.id === "player" ? "player-card" : ""}`} key={entity.id}>
                      <div className="entity-title">
                        <div>
                          <span className="controller">{entity.controller}</span>
                          <h4>{entity.name}</h4>
                        </div>
                        <span className="trust">
                          {reputation.score === null ? "Unproven" : `${Math.round(reputation.score * 100)}% repayment`}
                        </span>
                      </div>
                      <div className="holdings">
                        {holdings.map((asset) => (
                          <span key={asset.id}><strong>{balanceOf(state, entity.id, asset.id)}</strong> {asset.name}</span>
                        ))}
                        {holdings.length === 0 && <span>No assets</span>}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Contract engine</p>
                  <h3>Live agreements</h3>
                </div>
                <span className="count">{state.agreements.size} total</span>
              </div>
              <div className="agreement-list">
                {[...state.agreements.values()].map((agreement) => (
                  <article className="agreement" key={agreement.id}>
                    <div className="agreement-topline">
                      <span className={`status ${agreement.status}`}>{agreement.status}</span>
                      <code>{agreement.id.slice(0, 20)}</code>
                    </div>
                    <h4>{agreement.memo || "Untitled economic agreement"}</h4>
                    <p>{agreementSummary(agreement)}</p>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <aside className="side-column">
            <section className="panel offer-panel">
              <p className="eyebrow accent">Product builder</p>
              <h3>Compose a fixed-term advance</h3>
              <p className="muted">This prototype exposes safe modules only; no arbitrary code or hidden terms.</p>
              <form onSubmit={publishProduct}>
                <label>
                  Product name
                  <input value={product.name} onChange={(event) => setProduct({ ...product, name: event.target.value })} />
                </label>
                <div className="form-pair">
                  <label>
                    Funding asset
                    <select value={product.fundingAsset} onChange={(event) => setProduct({ ...product, fundingAsset: event.target.value })}>
                      {[...state.assets.values()].filter((asset) => asset.divisible).map((asset) => <option value={asset.id} key={asset.id}>{asset.name}</option>)}
                    </select>
                  </label>
                  <label>
                    Transfer now
                    <input type="number" min="0.01" step="0.01" value={product.principalAmount} onChange={(event) => setProduct({ ...product, principalAmount: event.target.value })} />
                  </label>
                </div>
                <div className="form-pair">
                  <label>
                    Fixed interest
                    <input type="number" min="0" max="0.99" step="0.01" value={product.fixedInterestRate} onChange={(event) => setProduct({ ...product, fixedInterestRate: event.target.value })} />
                  </label>
                  <label>
                    Term in ticks
                    <input type="number" min="1" step="1" value={product.term} onChange={(event) => setProduct({ ...product, term: event.target.value })} />
                  </label>
                </div>
                <div className="form-pair">
                  <label>
                    Repayment threshold
                    <input type="number" min="0" max="1" step="0.05" value={product.minimumRepaymentReputation} onChange={(event) => setProduct({ ...product, minimumRepaymentReputation: event.target.value })} />
                  </label>
                  <label>
                    Creator fee
                    <input type="number" min="0" max="0.99" step="0.01" value={product.creatorFeeRate} onChange={(event) => setProduct({ ...product, creatorFeeRate: event.target.value })} />
                  </label>
                </div>
                <div className="form-pair">
                  <label>
                    Lock as collateral
                    <select value={product.collateralAsset} onChange={(event) => setProduct({ ...product, collateralAsset: event.target.value })}>
                      <option value="none">None</option>
                      {[...state.assets.values()].map((asset) => <option value={asset.id} key={asset.id}>{asset.name}</option>)}
                    </select>
                  </label>
                  <label>
                    Amount
                    <input disabled={product.collateralAsset === "none"} type="number" min="0.01" step="0.01" value={product.collateralAmount} onChange={(event) => setProduct({ ...product, collateralAmount: event.target.value })} />
                  </label>
                </div>
                <button type="submit" className="button primary full">Publish product</button>
              </form>
            </section>

            <section className="panel claim-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Claim market</p>
                  <h3>Repayment claims</h3>
                </div>
                <span className="count">{heldClaims.length} held</span>
              </div>
              {heldClaims.length === 0 && <p className="muted">Fund a product to receive a claim on its future repayment.</p>}
              <div className="claim-list">
                {heldClaims.map((claim) => (
                  <article className="claim" key={claim.id}>
                    <strong>{claim.amount} {claim.asset}</strong>
                    <p>Due t{claim.dueAt} · held by you</p>
                    <button type="button" className="text-button" onClick={() => transferClaim(claim.id)}>Transfer to Trading House</button>
                  </article>
                ))}
              </div>
            </section>

            <section className="panel event-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Append-only history</p>
                  <h3>Recent events</h3>
                </div>
                <span className="count">{events.length}</span>
              </div>
              <ol className="event-list">
                {[...events].reverse().slice(0, 10).map((event) => (
                  <li key={event.id}>
                    <span className="event-sequence">{String(event.sequence).padStart(3, "0")}</span>
                    <div>
                      <strong>{eventLabels[event.type] ?? event.type}</strong>
                      <p>{eventDetail(event)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </aside>
        </section>
      </main>
    </div>
  );
}
