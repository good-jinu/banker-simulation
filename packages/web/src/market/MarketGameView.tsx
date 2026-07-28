import {
  ArrowLeft,
  Landmark,
  Newspaper,
  Pause,
  Play,
  Plus,
  SlidersHorizontal,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { localize } from "../i18n/local-text.ts";
import type { Locale } from "../i18n/locale.ts";
import { messagesFor } from "../i18n/messages/index.ts";
import type { CityPan } from "./city/city-scene.ts";
import type { ClockView } from "./hooks/useMarketModalClock.ts";
import { money } from "./market-format.ts";
import type { FlowAnimation, FlowStamp } from "./market-flow.ts";
import type { MarketCampaignStage } from "./market-campaign.ts";
import { onboardingCapabilities } from "./market-onboarding.ts";
import { coachmarkTarget } from "./market-ui-state.ts";
import { MapViewport } from "./map/MapViewport.tsx";
import {
  avatarFor,
  summarize,
  upcomingRepayment,
  type Customer,
  type LoanProduct,
  type MarketSegment,
  type MarketWorld,
  type Product,
} from "./market-world.ts";
import {
  hasMarketAlertForSegment,
  unreadMarketNewsCount,
} from "./market-news.ts";

type MarketGameViewProps = {
  stage: MarketCampaignStage;
  locale: Locale;
  world: MarketWorld;
  activeFlow: FlowAnimation | null;
  stamps: FlowStamp[];
  loanRequestNotice: Customer | null;
  trustPulse: "up" | "down" | null;
  clockView: ClockView;
  modalOpen: boolean;
  hasDraggedMap: boolean;
  highlightedSegment: MarketSegment | null;
  onBack: () => void;
  onOpenAssets: () => void;
  onOpenNews: () => void;
  onOpenProductBuilder: () => void;
  onOpenDepositProductBuilder: () => void;
  onProductPickerOpenChange: (open: boolean) => void;
  onSelectCustomer: (customer: Customer) => void;
  onSelectProduct: (product: Product) => void;
  onOpenFunding: () => void;
  onToggleClock: () => void;
  onCycleSpeed: () => void;
  onFirstMapDrag: () => void;
};

export function MarketGameView({
  stage,
  locale,
  world,
  activeFlow,
  stamps,
  loanRequestNotice,
  trustPulse,
  clockView,
  modalOpen,
  hasDraggedMap,
  highlightedSegment,
  onBack,
  onOpenAssets,
  onOpenNews,
  onOpenProductBuilder,
  onOpenDepositProductBuilder,
  onProductPickerOpenChange,
  onSelectCustomer,
  onSelectProduct,
  onOpenFunding,
  onToggleClock,
  onCycleSpeed,
  onFirstMapDrag,
}: MarketGameViewProps) {
  const m = messagesFor(locale).market;
  const [showPlayPrompt, setShowPlayPrompt] = useState(false);
  const [showProductPicker, setShowProductPicker] = useState(false);
  useEffect(() => {
    onProductPickerOpenChange(showProductPicker);
  }, [showProductPicker, onProductPickerOpenChange]);
  const mapWorldRef = useRef<HTMLDivElement>(null);
  const mapPanRef = useRef<CityPan>({ x: 0, y: 0 });
  const mapZoomRef = useRef(1);
  const updateMapWorldTransform = useCallback(() => {
    if (!mapWorldRef.current) return;
    const { x, y } = mapPanRef.current;
    mapWorldRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${mapZoomRef.current})`;
  }, []);
  const moveMapWorld = useCallback(
    ({ x, y }: CityPan) => {
      mapPanRef.current = { x, y };
      updateMapWorldTransform();
    },
    [updateMapWorldTransform],
  );
  const zoomMapWorld = useCallback(
    (zoom: number) => {
      mapZoomRef.current = zoom;
      updateMapWorldTransform();
    },
    [updateMapWorldTransform],
  );
  const { fundingEligible, trustBand } = summarize(world);
  const {
    cash,
    day,
    customers,
    funding,
    products,
    loanCount,
    trust,
    onboarding,
  } = world;
  const capabilities = onboardingCapabilities(onboarding);
  const {
    openingLesson,
    awaitingFirstRepayment,
    trust: showTrust,
    deposits: showDeposits,
    products: showProducts,
    fullMarket: showFullMarket,
  } = capabilities;
  const showDepositProductLesson = onboarding === "deposits";
  // Trust walks toward its target in fractional steps; the rail shows whole
  // points so a slow climb doesn't read as jitter. Floor, not round: the
  // mission-clear check needs the raw value at 100, and rounding 99.5+ up
  // to "100" would show the goal as met a step before it actually is.
  const displayedTrust = Math.floor(trust);
  const visibleCustomers = customers.filter((customer) => {
    if (customer.appears > day) return false;
    if (openingLesson || awaitingFirstRepayment)
      return customer.id === world.config.introCustomerId;
    if (onboarding === "second-decision")
      return customer.id !== world.config.introCustomerId;
    return true;
  });
  const mapCustomers = visibleCustomers.filter(
    (customer) => !customer.productId,
  );
  const introCustomer = customers.find(
    (customer) => customer.id === world.config.introCustomerId,
  );
  const productLessonReady = introCustomer?.status !== "waiting";
  const hasLoanProduct = products.some((product) => product.kind === "loan");
  const highlightProductButton = productLessonReady && !hasLoanProduct;
  const canAddProduct = showProducts || showDepositProductLesson;
  const highlightAddProduct =
    highlightProductButton || showDepositProductLesson;
  const addProductCoachmark = showDepositProductLesson
    ? "launch-deposit-product"
    : highlightProductButton
      ? "create-loan-product"
      : null;
  const showFundingHint = fundingEligible;
  const unreadNews = unreadMarketNewsCount(world.news);
  const nextMovement = upcomingRepayment(world);

  useEffect(() => {
    setShowPlayPrompt(false);
    if (!clockView.paused || modalOpen) return;
    const timeout = window.setTimeout(() => setShowPlayPrompt(true), 3_000);
    return () => window.clearTimeout(timeout);
  }, [clockView.paused, modalOpen]);
  const flowStyle = activeFlow
    ? ({
        "--from-x": `${activeFlow.from.x}%`,
        "--from-y": `${activeFlow.from.y}%`,
        "--to-x": `${activeFlow.to.x}%`,
        "--to-y": `${activeFlow.to.y}%`,
        "--mid-x": `${(activeFlow.from.x + activeFlow.to.x) / 2}%`,
        "--mid-y": `${(activeFlow.from.y + activeFlow.to.y) / 2}%`,
      } as React.CSSProperties)
    : undefined;

  return (
    <main className={`loan-game stage-${stage.id}`}>
      <header className="map-header">
        <button className="round-button" onClick={onBack} aria-label={m.back}>
          <ArrowLeft />
        </button>
        {!openingLesson && (
          <div className="market-status">
            <button
              className="brand"
              onClick={onOpenAssets}
              aria-label={m.bankAssets}
            >
              <Landmark />
              <span>
                <small>MY BANK</small>
                <strong>{money(cash)}</strong>
              </span>
            </button>
          </div>
        )}
        {!openingLesson && nextMovement && (
          <div className="next-cash-movement" aria-label={m.nextCashMovement}>
            <small>{m.nextCashMovement}</small>
            <strong>
              {m.repaymentDueIn(Math.max(nextMovement.dueDay - day, 0))}
            </strong>
            <span>
              {nextMovement.incomingAmount > 0 &&
                m.incomingRepayment(money(nextMovement.incomingAmount))}
              {nextMovement.incomingAmount > 0 &&
                nextMovement.outgoingAmount > 0 &&
                ", "}
              {nextMovement.outgoingAmount > 0 &&
                m.outgoingRepayment(money(nextMovement.outgoingAmount))}
            </span>
          </div>
        )}
        {showFullMarket && (
          <button
            className={`market-news-button${unreadNews > 0 ? " unread" : ""}`}
            onClick={onOpenNews}
            aria-label={m.openMarketWire}
          >
            <Newspaper aria-hidden="true" />
            <span>{m.marketWire}</span>
            {unreadNews > 0 && <b>{unreadNews}</b>}
          </button>
        )}
      </header>

      <section
        className="state-map"
        aria-label={m.loanStatusMap}
        {...coachmarkTarget("drag-market-map")}
      >
        <MapViewport
          customerCount={loanCount}
          dragHint={m.dragCityHint}
          hasDraggedMap={hasDraggedMap}
          zoomInLabel={m.zoomIn}
          zoomOutLabel={m.zoomOut}
          onPanChange={moveMapWorld}
          onZoomChange={zoomMapWorld}
          onFirstDrag={onFirstMapDrag}
          showNavigation={showFullMarket}
        />
        {showTrust && (
          <aside
            className={`trust-rail trust-${trustBand}${trustPulse ? ` trust-pulse-${trustPulse}` : ""}`}
            aria-label={`${m.trust} ${m.trustScore(displayedTrust)}`}
          >
            <div className="trust-rail-header">
              <span>{m.trust}</span>
              <strong>{m.trustScore(displayedTrust)}</strong>
            </div>
            <div className="trust-rail-gauge">
              <div className="trust-rail-meter" aria-hidden="true">
                <span style={{ height: `${trust}%` }} />
                <i style={{ bottom: "80%" }} />
                <i style={{ bottom: "60%" }} />
                <i style={{ bottom: "30%" }} />
              </div>
              <div className="trust-rail-scale" aria-hidden="true">
                <small>100</small>
                <small>0</small>
              </div>
            </div>
          </aside>
        )}
        <div className="map-world-layer" ref={mapWorldRef}>
          <svg
            className="connection-layer"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <marker
                id="arrow-in"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" />
              </marker>
            </defs>
            {products
              .filter(
                (product) =>
                  (product.kind === "loan" && showProducts) ||
                  (product.kind === "deposit" && showDeposits),
              )
              .map((product) => (
                <line
                  key={product.id}
                  className="future-edge product-edge"
                  x1="50"
                  y1="49"
                  x2={product.x}
                  y2={product.y}
                />
              ))}
            {mapCustomers
              .filter((customer) => customer.status === "accepted")
              .map((customer) => (
                <line
                  key={customer.id}
                  className="future-edge customer-edge"
                  x1={customer.x}
                  y1={customer.y}
                  x2="50"
                  y2="49"
                  markerEnd="url(#arrow-in)"
                />
              ))}
            {funding
              .filter((lender) => lender.accepted)
              .map((lender) => (
                <line
                  key={lender.id}
                  className="future-edge debt-edge"
                  x1="50"
                  y1="49"
                  x2={lender.x}
                  y2={lender.y}
                  markerEnd="url(#arrow-in)"
                />
              ))}
            {activeFlow && (
              <line
                className={`event-edge event-edge-${activeFlow.kind}`}
                x1={activeFlow.from.x}
                y1={activeFlow.from.y}
                x2={activeFlow.to.x}
                y2={activeFlow.to.y}
              />
            )}
          </svg>
          <div
            className="banker-node map-node"
            style={{ left: "50%", top: "49%" }}
          >
            <span className="node-orbit" />
            <span className="bank-icon">
              <img src="/assets/pop-art/atoms/bank-hub-marker.svg" alt="" />
              {canAddProduct && (
                <div className="product-add-wrap">
                  {highlightAddProduct && (
                    <span className="product-tutorial-callout" role="status">
                      {showDepositProductLesson
                        ? m.onboardingDepositProduct
                        : m.productTutorialClick}
                    </span>
                  )}
                  <button
                    type="button"
                    className={`product-add-button${highlightAddProduct ? " tutorial-highlight" : ""}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setShowProductPicker((open) => !open);
                    }}
                    aria-label={m.addProduct}
                    aria-expanded={showProductPicker}
                    disabled={
                      !productLessonReady && !hasLoanProduct && !showDeposits
                    }
                    {...coachmarkTarget(addProductCoachmark)}
                  >
                    <Plus aria-hidden="true" />
                  </button>
                  {showProductPicker && (
                    <>
                      <div
                        className="product-picker-backdrop"
                        onMouseDown={() => setShowProductPicker(false)}
                      />
                      <div
                        className="product-type-menu"
                        role="menu"
                        onMouseDown={(event) => event.stopPropagation()}
                      >
                        {showProducts && (
                          <button
                            type="button"
                            role="menuitem"
                            className="product-type-option"
                            disabled={!productLessonReady && !hasLoanProduct}
                            onClick={() => {
                              setShowProductPicker(false);
                              onOpenProductBuilder();
                            }}
                          >
                            <SlidersHorizontal aria-hidden="true" />
                            <span>{m.productPickerLoan}</span>
                          </button>
                        )}
                        {showDeposits && (
                          <button
                            type="button"
                            role="menuitem"
                            className="product-type-option"
                            onClick={() => {
                              setShowProductPicker(false);
                              onOpenDepositProductBuilder();
                            }}
                          >
                            <Landmark aria-hidden="true" />
                            <span>{m.productPickerDeposit}</span>
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </span>
            <strong>{money(cash)}</strong>
          </div>
          {showProducts &&
            products
              .filter(
                (product): product is LoanProduct => product.kind === "loan",
              )
              .map((product) => (
                <div
                  key={product.id}
                  className={`product-node map-node${product.active ? "" : " paused"}${product.pauseOnMarketAlert ? " guarded" : ""}`}
                  style={{ left: `${product.x}%`, top: `${product.y}%` }}
                  role="button"
                  tabIndex={0}
                  aria-label={`${product.name} (${product.active ? m.productActive : m.productPaused})`}
                  title={`${product.name} (${product.active ? m.productActive : m.productPaused})`}
                  onClick={() => onSelectProduct(product)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectProduct(product);
                    }
                  }}
                >
                  <span className="product-icon">
                    <SlidersHorizontal aria-hidden="true" />
                  </span>
                </div>
              ))}
          {showDeposits &&
            products
              .filter((product) => product.kind === "deposit")
              .map((product) => (
                <div
                  key={product.id}
                  className={`product-node deposit-product-node map-node${product.active ? "" : " paused"}`}
                  style={{ left: `${product.x}%`, top: `${product.y}%` }}
                  role="button"
                  tabIndex={0}
                  aria-label={`${product.name} (${product.active ? m.productActive : m.productPaused})`}
                  title={`${product.name} (${product.active ? m.productActive : m.productPaused})`}
                  onClick={() => onSelectProduct(product)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectProduct(product);
                    }
                  }}
                >
                  <span className="product-icon">
                    <Landmark aria-hidden="true" />
                  </span>
                </div>
              ))}
          {mapCustomers.map((customer) => {
            const isWaiting = customer.status === "waiting";
            return (
              <div
                key={customer.id}
                className={`customer-node map-node ${customer.status}${isWaiting ? " interactive" : ""}${customer.id === world.config.introCustomerId && isWaiting ? " intro-customer" : ""}${customer.segment === highlightedSegment ? " market-highlight" : ""}${hasMarketAlertForSegment(world.news, customer.segment) ? " market-alert" : ""}`}
                style={{ left: `${customer.x}%`, top: `${customer.y}%` }}
                role={isWaiting ? "button" : undefined}
                tabIndex={isWaiting ? 0 : undefined}
                aria-label={
                  isWaiting
                    ? m.noticeLoanRequest(
                        localize(customer.name, locale),
                        money(customer.amount),
                      )
                    : undefined
                }
                onClick={() => {
                  if (isWaiting) onSelectCustomer(customer);
                }}
                {...coachmarkTarget(
                  onboarding === "second-decision" ? "second-customer" : null,
                )}
                onKeyDown={(event) => {
                  if (
                    isWaiting &&
                    (event.key === "Enter" || event.key === " ")
                  ) {
                    event.preventDefault();
                    onSelectCustomer(customer);
                  }
                }}
              >
                {isWaiting && loanRequestNotice?.id === customer.id && (
                  <span className="node-event-popup" role="status">
                    {m.noticeLoanRequest(
                      localize(customer.name, locale),
                      money(customer.amount),
                    )}
                  </span>
                )}
                <span className="portrait">
                  <img
                    src={avatarFor(
                      customer,
                      customer.status === "waiting" ? "requesting" : "relieved",
                    )}
                    alt={m.customerAlt(
                      localize(customer.name, locale),
                      m.mapMarker,
                    )}
                  />
                </span>
                <span className="node-label">
                  <strong>
                    {customer.status === "waiting"
                      ? money(customer.amount)
                      : m.repaymentIn(Math.max(customer.dueDay - day, 0))}
                  </strong>
                  <small>
                    {customer.status === "waiting"
                      ? `${customer.rate}%`
                      : m.repaymentDue(
                          money(customer.amount * (1 + customer.rate / 100)),
                        )}
                  </small>
                </span>
              </div>
            );
          })}
          {funding
            .filter((lender) => lender.accepted)
            .map((lender) => (
              <div
                key={lender.id}
                className={`lender-node map-node${lender.defaulted ? " defaulted" : ""}`}
                style={{ left: `${lender.x}%`, top: `${lender.y}%` }}
                aria-label={
                  lender.defaulted
                    ? `${m.defaulted} ${money(lender.amount * (1 + lender.rate / 100))}`
                    : undefined
                }
              >
                <span className="bank-icon small">
                  <img
                    src={`/assets/pop-art/atoms/${lender.defaulted ? "rejection-stamp" : "funding-badge"}.svg`}
                    alt=""
                  />
                </span>
                <span className="node-label">
                  <strong>
                    {lender.defaulted
                      ? m.defaulted
                      : m.repaymentIn(Math.max(lender.dueDay - day, 0))}
                  </strong>
                  <small>
                    {lender.defaulted
                      ? m.defaultedDebt(
                          money(lender.amount * (1 + lender.rate / 100)),
                        )
                      : m.repaymentDue(
                          money(lender.amount * (1 + lender.rate / 100)),
                        )}
                  </small>
                </span>
              </div>
            ))}
          {(activeFlow || stamps.length > 0) && (
            <div className="flow-layer" aria-hidden="true">
              {activeFlow && (
                <div
                  key={activeFlow.id}
                  className={`flow-token flow-${activeFlow.kind}`}
                  style={flowStyle}
                >
                  <img src="/assets/pop-art/atoms/cash-symbol.svg" alt="" />
                </div>
              )}
              {stamps.map((stamp) => (
                <span
                  key={stamp.id}
                  className={`flow-stamp flow-stamp-${stamp.kind}`}
                  style={
                    {
                      "--stamp-x": `${stamp.at.x}%`,
                      "--stamp-y": `${stamp.at.y}%`,
                      // Consecutive stamps overlap in time now, and repayments
                      // all land on the same hub — stagger them so a stack
                      // stays legible instead of hiding behind the newest.
                      "--stamp-lift": `${(stamp.id % 3) * -17}px`,
                    } as React.CSSProperties
                  }
                >
                  <strong>{money(stamp.amount)}</strong>
                  <small>{stamp.label}</small>
                </span>
              ))}
            </div>
          )}
          {showFullMarket && showFundingHint && (
            <button
              className="funding-hint"
              onClick={onOpenFunding}
              aria-label={m.viewFunding}
            >
              <Landmark />
              <Plus className="funding-plus" aria-hidden="true" />
              <span className="sr-only">{m.newFunding}</span>
            </button>
          )}
        </div>
      </section>
      {!openingLesson && (
        <footer className="time-controller">
          <div className="time-status">
            <span
              className={clockView.paused ? "status-dot paused" : "status-dot"}
            />
            <strong>{m.dayStatus(day + 1)}</strong>
          </div>
          <div className="time-actions">
            <button
              className={`play-time${showPlayPrompt ? " play-time-prompt" : ""}`}
              onClick={onToggleClock}
              aria-label={clockView.paused ? m.playTime : m.pause}
              {...coachmarkTarget("play-first-repayment")}
            >
              {clockView.paused ? (
                <Play fill="currentColor" aria-hidden="true" />
              ) : (
                <Pause fill="currentColor" aria-hidden="true" />
              )}
            </button>
            {showFullMarket && (
              <button className="speed-time" onClick={onCycleSpeed}>
                <span>{clockView.speed}×</span>
                <small>{m.speed}</small>
              </button>
            )}
          </div>
        </footer>
      )}
    </main>
  );
}
