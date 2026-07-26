import { Landmark } from "lucide-react";
import {
  lazy,
  Suspense,
  useCallback,
  useReducer,
  useRef,
  useState,
} from "react";
import type { Locale } from "../i18n/locale.ts";
import { messagesFor } from "../i18n/messages/index.ts";
import { CLOCK_SPEEDS } from "../lib/game-clock.ts";
import { MarketDialogs } from "./MarketDialogs.tsx";
import { MarketGameView } from "./MarketGameView.tsx";
import { useMarketClock } from "./hooks/useMarketClock.ts";
import { useMarketEffects } from "./hooks/useMarketEffects.ts";
import {
  useMarketModalClock,
  type ClockView,
} from "./hooks/useMarketModalClock.ts";
import { useMarketSession } from "./hooks/useMarketSession.ts";
import type { MarketCampaignStage } from "./market-campaign.ts";
import { money } from "./market-format.ts";
import { initialMarketUiState, type MarketUiState } from "./market-ui-state.ts";
import { useMarketRunOptions } from "./market-run.tsx";
import {
  createWorld,
  marketReducer,
  summarize,
  type Customer,
  type Funding,
  type LoanProduct,
  type LoanProductRules,
} from "./market-world.ts";
import { type GameClock } from "../lib/game-clock.ts";
import "./market.css";
import "./city/city.css";

const MarketDevTools = import.meta.env.DEV
  ? lazy(async () => {
      const module = await import("../dev/MarketDevTools.tsx");
      return { default: module.MarketDevTools };
    })
  : null;

type MarketAppProps = {
  locale: Locale;
  onBack: () => void;
  stage: MarketCampaignStage;
  onComplete?: () => void;
};

/** Composes the pure simulation, focused feature hooks, and presentational views. */
export function MarketApp({
  locale,
  onBack,
  stage,
  onComplete,
}: MarketAppProps) {
  const m = messagesFor(locale).market;
  const runOptions = useMarketRunOptions();
  const devMode = runOptions?.showDevTools ?? false;
  const devPhase = runOptions?.phase ?? "intro";
  const devFresh = runOptions?.fresh ?? false;
  const [world, dispatch] = useReducer(marketReducer, undefined, () =>
    createWorld(Date.now() >>> 0, stage.config),
  );
  const [selected, setSelected] = useState<Customer | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    null,
  );
  const [productBuilderOpen, setProductBuilderOpen] = useState(false);
  const [fundingOpen, setFundingOpen] = useState(false);
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [clockView, setClockView] = useState<ClockView>({
    paused: true,
    speed: 1,
  });
  const [ui, setUi] = useState<MarketUiState>(initialMarketUiState);
  const clockRef = useRef<GameClock | null>(null);
  const session = useMarketSession({
    stage,
    world,
    dispatch,
    clockView,
    setClockView,
    ui,
    setUi,
    devMode,
    devPhase,
    devFresh,
  });
  useMarketClock(session.sessionReady, dispatch, clockRef);
  const openProductBuilder = useCallback(() => setProductBuilderOpen(true), []);
  const openFunding = useCallback(() => setFundingOpen(true), []);
  const { activeFlow, loanRequestNotice, notice, setNotice, trustPulse } =
    useMarketEffects({
      world,
      locale,
      hasProductGoal: world.config.goals.productCount > 0,
      onOpenProductBuilder: openProductBuilder,
      onOpenFunding: openFunding,
    });
  const modalOpen = Boolean(
    selected ||
    productBuilderOpen ||
    fundingOpen ||
    assetsOpen ||
    selectedProductId !== null ||
    world.missionCleared ||
    world.insolvent,
  );
  useMarketModalClock(modalOpen, clockRef, setClockView);

  const { cash, fundingEligible } = { cash: world.cash, ...summarize(world) };
  const hasProductGoal = world.config.goals.productCount > 0;

  const approve = useCallback(
    (customer: Customer) => {
      setSelected(null);
      if (cash < customer.amount) {
        if (fundingEligible) setFundingOpen(true);
        setNotice(
          fundingEligible
            ? `${m.insufficientCash} ${m.viewFunding}`
            : `${m.insufficientCash} ${m.fundingUnavailable}`,
        );
        return;
      }
      dispatch({ type: "approve", customerId: customer.id });
    },
    [cash, dispatch, fundingEligible, m, setNotice],
  );
  const reject = useCallback(
    (customer: Customer) => {
      dispatch({ type: "reject", customerId: customer.id });
      setSelected(null);
      if (hasProductGoal && world.products.length === 0)
        setProductBuilderOpen(true);
    },
    [dispatch, hasProductGoal, world.products.length],
  );
  const createLoanProduct = useCallback(
    (rules: LoanProductRules) => {
      if (cash < world.config.productCreationCost) {
        setNotice(
          m.productInsufficientCash(money(world.config.productCreationCost)),
        );
        return;
      }
      const product: LoanProduct = {
        id: `loan-product-${world.products.filter((item) => item.kind === "loan").length + 1}`,
        kind: "loan",
        name: m.loanProductName,
        x: 50,
        y: 26,
        active: true,
        rules,
      };
      dispatch({ type: "create-product", product });
      setProductBuilderOpen(false);
      setNotice(m.productActivated);
    },
    [
      cash,
      dispatch,
      m,
      setNotice,
      world.config.productCreationCost,
      world.products,
    ],
  );
  const borrow = useCallback(
    (lender: Funding) => {
      dispatch({ type: "borrow", lenderId: lender.id });
      setFundingOpen(false);
    },
    [dispatch],
  );

  function toggleClock(): void {
    const gameClock = clockRef.current;
    if (!gameClock) return;
    if (gameClock.paused) gameClock.play();
    else gameClock.pause();
    setClockView((current) => ({ ...current, paused: gameClock.paused }));
  }
  function cycleSpeed(): void {
    const index = CLOCK_SPEEDS.indexOf(clockView.speed);
    const speed = CLOCK_SPEEDS[(index + 1) % CLOCK_SPEEDS.length]!;
    clockRef.current?.setSpeed(speed);
    setClockView((current) => ({ ...current, speed }));
  }

  if (!session.sessionReady) {
    return (
      <main className="loading-screen" aria-live="polite">
        <div className="brand-mark">
          <Landmark aria-hidden="true" />
        </div>
        <p className="eyebrow">Banker Simulation</p>
        <h1>{m.loadingMarket}</h1>
      </main>
    );
  }

  return (
    <>
      <MarketGameView
        stage={stage}
        locale={locale}
        world={world}
        activeFlow={activeFlow}
        loanRequestNotice={loanRequestNotice}
        trustPulse={trustPulse}
        clockView={clockView}
        modalOpen={modalOpen}
        hasDraggedMap={ui.hasDraggedMap}
        goalsOpen={goalsOpen}
        onBack={onBack}
        onOpenAssets={() => setAssetsOpen(true)}
        onOpenProductBuilder={openProductBuilder}
        onToggleGoals={() => setGoalsOpen((value) => !value)}
        onSelectCustomer={setSelected}
        onSelectProduct={(product) => setSelectedProductId(product.id)}
        onOpenFunding={openFunding}
        onToggleClock={toggleClock}
        onCycleSpeed={cycleSpeed}
        onFirstMapDrag={() =>
          setUi((current) =>
            current.hasDraggedMap
              ? current
              : { ...current, hasDraggedMap: true },
          )
        }
      />
      {notice && (
        <div className="game-notice" role="status" aria-live="polite">
          <img src="/assets/pop-art/atoms/speech-bubble.svg" alt="" />
          <span>{notice}</span>
        </div>
      )}
      {devMode && MarketDevTools && (
        <Suspense fallback={null}>
          <MarketDevTools
            stage={stage}
            world={world}
            dispatch={dispatch}
            clockView={clockView}
            setClockView={setClockView}
            ui={ui}
            setUi={setUi}
            clockRef={clockRef}
          />
        </Suspense>
      )}
      <MarketDialogs
        stage={stage}
        locale={locale}
        world={world}
        selected={selected}
        selectedProductId={selectedProductId}
        productBuilderOpen={productBuilderOpen}
        fundingOpen={fundingOpen}
        assetsOpen={assetsOpen}
        onCloseSelected={() => setSelected(null)}
        onCloseSelectedProduct={() => setSelectedProductId(null)}
        onCloseProductBuilder={() => setProductBuilderOpen(false)}
        onCloseFunding={() => setFundingOpen(false)}
        onCloseAssets={() => setAssetsOpen(false)}
        onApprove={approve}
        onReject={reject}
        onNeedFunding={() => {
          setSelected(null);
          setFundingOpen(true);
        }}
        onCreateProduct={createLoanProduct}
        onToggleProduct={(productId, active) =>
          dispatch({ type: "set-product-active", productId, active })
        }
        onBorrow={borrow}
        onComplete={() => (onComplete ? onComplete() : onBack())}
        onBack={onBack}
      />
    </>
  );
}
