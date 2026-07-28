import {
  ArrowLeft,
  Check,
  Gauge,
  Landmark,
  Newspaper,
  Pause,
  Play,
  Plus,
  SlidersHorizontal,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { localize } from "../i18n/local-text.ts";
import type { Locale } from "../i18n/locale.ts";
import { messagesFor } from "../i18n/messages/index.ts";
import type { ClockView } from "./hooks/useMarketModalClock.ts";
import { money } from "./market-format.ts";
import type { FlowAnimation, FlowStamp } from "./market-flow.ts";
import type { MarketCampaignStage } from "./market-campaign.ts";
import { onboardingCapabilities } from "./market-onboarding.ts";
import { coachmarkTarget } from "./market-ui-state.ts";
import { MapViewport } from "./map/MapViewport.tsx";
import { MarketMapOverview } from "./map/MarketMapOverview.tsx";
import {
  initialMarketCamera,
  mapLod,
  projectMapPoint,
  type MapProjection,
} from "./map/market-camera.ts";
import { mapNodeForKind, marketPoint } from "./map/market-map.ts";
import {
  selectDetailedMapCustomers,
  summarizeMapClusters,
  summarizeMapDistricts,
} from "./map/market-map-state.ts";
import {
  avatarFor,
  summarize,
  upcomingRepayment,
  type Customer,
  type LoanProduct,
  type MarketSegment,
  type MarketWorld,
  type Product,
  type TrustReason,
} from "./market-world.ts";
import {
  hasMarketAlertForSegment,
  unreadMarketNewsCount,
} from "./market-news.ts";
import { loanModuleCopy, loanModuleLabel } from "./market-modules.ts";
import {
  LOAN_PRODUCT_MODULES,
  LOAN_PRODUCT_MODULE_CAPACITY,
  type LoanProductModule,
} from "./market-product-types.ts";

/** Each module carries a glyph so a configured line reads at map scale. */
const MODULE_ICONS: Record<LoanProductModule, LucideIcon> = {
  "credit-check": Gauge,
  guarantor: UserCheck,
};

type MarketGameViewProps = {
  stage: MarketCampaignStage;
  locale: Locale;
  world: MarketWorld;
  activeFlow: FlowAnimation | null;
  stamps: FlowStamp[];
  loanRequestNotice: Customer | null;
  trustPulse: "up" | "down" | null;
  trustReason: TrustReason | null;
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
  onToggleProductModule: (
    productId: string,
    module: LoanProductModule,
    enabled: boolean,
  ) => void;
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
  trustReason,
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
  onToggleProductModule,
  onOpenFunding,
  onToggleClock,
  onCycleSpeed,
  onFirstMapDrag,
}: MarketGameViewProps) {
  const m = messagesFor(locale).market;
  const [showPlayPrompt, setShowPlayPrompt] = useState(false);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [moduleMenuProductId, setModuleMenuProductId] = useState<string | null>(
    null,
  );
  useEffect(() => {
    onProductPickerOpenChange(showProductPicker);
  }, [showProductPicker, onProductPickerOpenChange]);
  const map = world.config.map;
  const [projection, setProjection] = useState<MapProjection>(() => ({
    camera: initialMarketCamera(map.camera),
    viewport: { width: 1, height: 1 },
  }));
  const lod = mapLod(map, projection.camera.zoom);
  const districtSummaries = useMemo(
    () => summarizeMapDistricts(map, world),
    [map, world],
  );
  const districtStates = useMemo(
    () =>
      districtSummaries.map((summary) => ({
        districtId: summary.district.id,
        stress: summary.stress,
        alert: summary.alert,
        outstandingBalance: summary.outstandingBalance,
        sales: world.districtSales[summary.district.id] ?? 0,
        trust: world.trust,
      })),
    [districtSummaries, world.districtSales, world.trust],
  );
  const bankMapPoint =
    mapNodeForKind(map, "bank")?.point ?? map.camera.initialCenter;
  const bankPoint = projectMapPoint(map, projection, bankMapPoint);
  const projectedLocation = (locationId: string) =>
    projectMapPoint(map, projection, marketPoint(map, locationId));
  const projectedWorldPoint = (point: { x: number; y: number }) =>
    projectMapPoint(map, projection, point);
  const { fundingEligible, trustBand } = summarize(world);
  const { cash, day, customers, funding, products, trust, onboarding } = world;
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
  // mission-clear check reads the raw value, and rounding up would show the
  // goal as met a step before it actually is.
  const displayedTrust = Math.floor(trust);
  const visibleCustomers = customers.filter((customer) => {
    if (customer.appears > day) return false;
    if (openingLesson || awaitingFirstRepayment)
      return customer.id === world.config.introCustomerId;
    if (onboarding === "second-decision")
      return customer.id !== world.config.introCustomerId;
    return true;
  });
  const recentCustomerIds = new Set(
    world.events.flatMap((event) =>
      "customer" in event ? [event.customer.id] : [],
    ),
  );
  const detailedLimit =
    projection.viewport.width <= 620
      ? map.detailedNodeLimit.mobile
      : map.detailedNodeLimit.desktop;
  const mapCustomers =
    lod !== "detail"
      ? []
      : selectDetailedMapCustomers(map, projection, visibleCustomers, {
          limit: detailedLimit,
          highlightedSegment,
          recentCustomerIds,
        });
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
  const activeFlowFrom = activeFlow
    ? projectedWorldPoint(activeFlow.from)
    : null;
  const activeFlowTo = activeFlow ? projectedWorldPoint(activeFlow.to) : null;
  const flowStyle =
    activeFlowFrom && activeFlowTo
      ? ({
          "--from-x": `${activeFlowFrom.x}px`,
          "--from-y": `${activeFlowFrom.y}px`,
          "--to-x": `${activeFlowTo.x}px`,
          "--to-y": `${activeFlowTo.y}px`,
          "--mid-x": `${(activeFlowFrom.x + activeFlowTo.x) / 2}px`,
          "--mid-y": `${(activeFlowFrom.y + activeFlowTo.y) / 2}px`,
        } as React.CSSProperties)
      : undefined;
  const overviewTargets =
    lod === "district"
      ? districtSummaries
          .filter(
            (summary) =>
              summary.acceptedLoans > 0 || summary.waitingApplicants > 0,
          )
          .map((summary) => ({
            id: summary.district.id,
            point: projectedWorldPoint(summary.point),
          }))
      : lod === "cluster"
        ? summarizeMapClusters(map, world).map((cluster) => ({
            id: cluster.id,
            point: projectedWorldPoint(cluster.point),
          }))
        : [];

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
          map={map}
          seed={world.seed}
          districtStates={districtStates}
          dragHint={m.dragCityHint}
          hasDraggedMap={hasDraggedMap}
          zoomInLabel={m.zoomIn}
          zoomOutLabel={m.zoomOut}
          onProjectionChange={setProjection}
          onFirstDrag={onFirstMapDrag}
          showNavigation={showFullMarket}
        />
        {lod !== "detail" && (
          <MarketMapOverview
            world={world}
            locale={locale}
            projection={projection}
            lod={lod}
          />
        )}
        {showFullMarket && (
          <span className="map-lod-indicator" aria-live="polite">
            {lod === "district"
              ? m.mapLodDistrict
              : lod === "cluster"
                ? m.mapLodCluster
                : m.mapLodDetail}
          </span>
        )}
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
            {/* The run turns on one number, so it has to say why it moved. */}
            {trustReason && (
              <p className="trust-rail-reason">{m.trustReason[trustReason]}</p>
            )}
          </aside>
        )}
        <div className="map-world-layer">
          <svg
            className="connection-layer"
            viewBox={`0 0 ${projection.viewport.width} ${projection.viewport.height}`}
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
            {overviewTargets.map((target) => (
              <line
                key={`overview-${target.id}`}
                className="future-edge aggregate-edge"
                x1={bankPoint.x}
                y1={bankPoint.y}
                x2={target.point.x}
                y2={target.point.y}
              />
            ))}
            {lod === "detail" &&
              products
                .filter(
                  (product) =>
                    (product.kind === "loan" && showProducts) ||
                    (product.kind === "deposit" && showDeposits),
                )
                .map((product) => {
                  const point = projectedLocation(product.locationId);
                  return (
                    <line
                      key={product.id}
                      className="future-edge product-edge"
                      x1={bankPoint.x}
                      y1={bankPoint.y}
                      x2={point.x}
                      y2={point.y}
                    />
                  );
                })}
            {map.districts.length === 1 &&
              mapCustomers
                .filter((customer) => customer.status === "accepted")
                .map((customer) => {
                  const point = projectedLocation(customer.locationId);
                  return (
                    <line
                      key={customer.id}
                      className="future-edge customer-edge"
                      x1={point.x}
                      y1={point.y}
                      x2={bankPoint.x}
                      y2={bankPoint.y}
                      markerEnd="url(#arrow-in)"
                    />
                  );
                })}
            {lod === "detail" &&
              funding
                .filter((lender) => lender.accepted)
                .map((lender) => {
                  const point = projectedLocation(lender.locationId);
                  return (
                    <line
                      key={lender.id}
                      className="future-edge debt-edge"
                      x1={bankPoint.x}
                      y1={bankPoint.y}
                      x2={point.x}
                      y2={point.y}
                      markerEnd="url(#arrow-in)"
                    />
                  );
                })}
            {activeFlow && activeFlowFrom && activeFlowTo && (
              <line
                className={`event-edge event-edge-${activeFlow.kind}`}
                x1={activeFlowFrom.x}
                y1={activeFlowFrom.y}
                x2={activeFlowTo.x}
                y2={activeFlowTo.y}
              />
            )}
          </svg>
          <div
            className="banker-node map-node"
            style={{ left: bankPoint.x, top: bankPoint.y }}
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
                            className="product-type-option loan-product-option"
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
                            className="product-type-option deposit-product-option"
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
          {lod === "detail" &&
            showProducts &&
            products
              .filter(
                (product): product is LoanProduct => product.kind === "loan",
              )
              .map((product) => {
                const statusLabel = `${product.name} (${product.active ? m.productActive : m.productPaused})`;
                const installed = product.modules ?? [];
                const slotLabel = m.productModuleSlots(
                  installed.length,
                  LOAN_PRODUCT_MODULE_CAPACITY,
                );
                const menuOpen = moduleMenuProductId === product.id;
                const point = projectedLocation(product.locationId);
                return (
                  <div
                    key={product.id}
                    className={`product-node map-node${product.active ? "" : " paused"}${menuOpen ? " menu-open" : ""}`}
                    style={{ left: point.x, top: point.y }}
                  >
                    <div className="product-node-core">
                      <button
                        type="button"
                        className="product-icon"
                        aria-label={statusLabel}
                        title={statusLabel}
                        onClick={() => onSelectProduct(product)}
                      >
                        <SlidersHorizontal aria-hidden="true" />
                      </button>
                      <div className="product-module-wrap">
                        <button
                          type="button"
                          className="product-module-button"
                          aria-label={m.openModuleMenu(product.name)}
                          aria-expanded={menuOpen}
                          title={slotLabel}
                          onClick={() =>
                            setModuleMenuProductId(menuOpen ? null : product.id)
                          }
                        >
                          <Plus aria-hidden="true" />
                        </button>
                        {menuOpen && (
                          <>
                            <div
                              className="product-picker-backdrop"
                              onMouseDown={() => setModuleMenuProductId(null)}
                            />
                            <div
                              className="product-module-menu"
                              role="menu"
                              aria-label={m.productModules}
                              onMouseDown={(event) => event.stopPropagation()}
                            >
                              <span className="product-module-menu-title">
                                {m.productModules}
                              </span>
                              <span className="product-module-menu-slots">
                                {slotLabel}
                              </span>
                              {LOAN_PRODUCT_MODULES.map((module) => {
                                const isInstalled = installed.includes(module);
                                const ModuleIcon = MODULE_ICONS[module];
                                const label = loanModuleLabel(m, module);
                                return (
                                  <button
                                    key={module}
                                    type="button"
                                    role="menuitem"
                                    className={`product-module-option${isInstalled ? " installed" : ""}`}
                                    disabled={
                                      !isInstalled &&
                                      installed.length >=
                                        LOAN_PRODUCT_MODULE_CAPACITY
                                    }
                                    title={loanModuleCopy(m, module)}
                                    aria-label={
                                      isInstalled
                                        ? m.removeModuleNamed(label)
                                        : m.installModuleNamed(label)
                                    }
                                    aria-pressed={isInstalled}
                                    onClick={() =>
                                      onToggleProductModule(
                                        product.id,
                                        module,
                                        !isInstalled,
                                      )
                                    }
                                  >
                                    <ModuleIcon aria-hidden="true" />
                                    <span>{label}</span>
                                    {isInstalled && (
                                      <Check
                                        className="product-module-check"
                                        aria-hidden="true"
                                      />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    {installed.length > 0 && (
                      <span className="product-module-chips">
                        {installed.map((module) => {
                          const ModuleIcon = MODULE_ICONS[module];
                          return (
                            <span
                              key={module}
                              className="product-module-chip"
                              title={loanModuleLabel(m, module)}
                            >
                              <ModuleIcon aria-hidden="true" />
                            </span>
                          );
                        })}
                      </span>
                    )}
                  </div>
                );
              })}
          {lod === "detail" &&
            showDeposits &&
            products
              .filter((product) => product.kind === "deposit")
              .map((product) => {
                const point = projectedLocation(product.locationId);
                return (
                  <div
                    key={product.id}
                    className={`product-node deposit-product-node map-node${product.active ? "" : " paused"}`}
                    style={{ left: point.x, top: point.y }}
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
                );
              })}
          {mapCustomers.map((customer) => {
            const isWaiting = customer.status === "waiting";
            const point = projectedLocation(customer.locationId);
            return (
              <div
                key={customer.id}
                className={`customer-node map-node ${customer.status}${isWaiting ? " interactive" : ""}${customer.id === world.config.introCustomerId && isWaiting ? " intro-customer" : ""}${customer.segment === highlightedSegment ? " market-highlight" : ""}${hasMarketAlertForSegment(world.news, customer.segment) ? " market-alert" : ""}`}
                style={{ left: point.x, top: point.y }}
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
          {lod === "detail" &&
            funding
              .filter((lender) => lender.accepted)
              .map((lender) => {
                const point = projectedLocation(lender.locationId);
                return (
                  <div
                    key={lender.id}
                    className={`lender-node map-node${lender.defaulted ? " defaulted" : ""}`}
                    style={{ left: point.x, top: point.y }}
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
                );
              })}
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
              {stamps.map((stamp) => {
                const point = projectedWorldPoint(stamp.at);
                return (
                  <span
                    key={stamp.id}
                    className={`flow-stamp flow-stamp-${stamp.kind}`}
                    style={
                      {
                        "--stamp-x": `${point.x}px`,
                        "--stamp-y": `${point.y}px`,
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
                );
              })}
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
