import { Landmark } from "lucide-react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import type { Locale } from "../i18n/locale.ts";
import { messagesFor } from "../i18n/messages/index.ts";
import { CLOCK_SPEEDS } from "../lib/game-clock.ts";
import { CoachmarkSpotlight } from "./CoachmarkSpotlight.tsx";
import { MarketDialogs } from "./MarketDialogs.tsx";
import { MarketGameView } from "./MarketGameView.tsx";
import {
  initialConsultationProgress,
  type ConsultationProgress,
} from "./market-consultation.ts";
import type { MarketOverlay } from "./market-overlay.ts";
import { useMarketClock } from "./hooks/useMarketClock.ts";
import { useMarketEffects } from "./hooks/useMarketEffects.ts";
import { useMarketProductCreation } from "./hooks/useMarketProductCreation.ts";
import {
  useMarketModalClock,
  type ClockView,
} from "./hooks/useMarketModalClock.ts";
import { useMarketSession } from "./hooks/useMarketSession.ts";
import type { MarketCampaignStage } from "./market-campaign.ts";
import { shouldPauseOnOnboardingEntry } from "./market-onboarding.ts";
import {
  activeCoachmarkFor,
  COACHMARKS,
  completeCoachmark,
  initialMarketUiState,
  introduceCoachmark,
  type CoachmarkId,
  type MarketUiState,
} from "./market-ui-state.ts";
import { useMarketRunOptions } from "./market-run.tsx";
import {
  createWorld,
  marketReducer,
  summarize,
  type Customer,
  type Funding,
  type MarketSegment,
} from "./market-world.ts";
import { type GameClock } from "../lib/game-clock.ts";
import "./market.css";
import "./products.css";
import "./coachmark.css";
import "./city/city.css";

const MarketDevTools = import.meta.env.DEV
  ? lazy(async () => {
      const module = await import("../dev/MarketDevTools.tsx");
      return { default: module.MarketDevTools };
    })
  : null;

const MARKET_HIGHLIGHT_DURATION_MS = 2_400;

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
  const [overlay, setOverlay] = useState<MarketOverlay | null>(null);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [highlightedSegment, setHighlightedSegment] =
    useState<MarketSegment | null>(null);
  useEffect(() => {
    if (!highlightedSegment) return;
    const timeout = window.setTimeout(
      () => setHighlightedSegment(null),
      MARKET_HIGHLIGHT_DURATION_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [highlightedSegment]);
  const [clockView, setClockView] = useState<ClockView>({
    paused: true,
    speed: 1,
  });
  const [ui, setUi] = useState<MarketUiState>(initialMarketUiState);
  const [consultation, setConsultation] = useState<ConsultationProgress>(
    initialConsultationProgress,
  );
  const clockRef = useRef<GameClock | null>(null);
  const openedFirstConsultation = useRef(false);
  const previousOnboarding = useRef(world.onboarding);
  const session = useMarketSession({
    stage,
    world,
    dispatch,
    clockView,
    setClockView,
    ui,
    setUi,
    consultation,
    setConsultation,
    devMode,
    devPhase,
    devFresh,
  });
  useEffect(() => {
    if (
      !session.sessionReady ||
      openedFirstConsultation.current ||
      world.onboarding !== "first-customer"
    )
      return;
    const firstCustomer = world.customers.find(
      (customer) => customer.id === world.config.introCustomerId,
    );
    if (!firstCustomer) return;
    openedFirstConsultation.current = true;
    setOverlay({ kind: "customer", customerId: firstCustomer.id });
  }, [
    session.sessionReady,
    world.config.introCustomerId,
    world.customers,
    world.onboarding,
  ]);
  useMarketClock(session.sessionReady, dispatch, clockRef);
  const openProductBuilder = useCallback(
    () => setOverlay({ kind: "product-builder", productKind: "loan" }),
    [],
  );
  const openDepositProductBuilder = useCallback(
    () => setOverlay({ kind: "product-builder", productKind: "deposit" }),
    [],
  );
  const openFunding = useCallback(() => setOverlay({ kind: "funding" }), []);
  const { activeFlow, loanRequestNotice, notice, setNotice, trustPulse } =
    useMarketEffects({
      world,
      locale,
      onOpenProductBuilder: openProductBuilder,
      onOpenFunding: openFunding,
    });
  const modalOpen = Boolean(overlay || world.missionCleared || world.insolvent);
  const markCoachmarkIntroduced = useCallback((id: CoachmarkId) => {
    setUi((current) => introduceCoachmark(current, id));
  }, []);
  const markCoachmarkCompleted = useCallback((id: CoachmarkId) => {
    setUi((current) => completeCoachmark(current, id));
  }, []);
  const pendingCoachmark =
    stage.config.onboarding === "guided"
      ? activeCoachmarkFor(world.onboarding, ui, consultation.asked)
      : null;
  const activeCoachmark =
    overlay?.kind !== "product-builder" &&
    !productPickerOpen &&
    !world.missionCleared &&
    !world.insolvent
      ? pendingCoachmark
      : null;
  const coachmarkDefinition = activeCoachmark
    ? COACHMARKS[activeCoachmark]
    : null;
  const coachmarkCopy = coachmarkDefinition
    ? m[coachmarkDefinition.copyKey]
    : "";
  useMarketModalClock(modalOpen, clockRef, setClockView);
  useEffect(() => {
    if (previousOnboarding.current === world.onboarding) return;
    previousOnboarding.current = world.onboarding;
    if (!shouldPauseOnOnboardingEntry(world.onboarding)) return;
    clockRef.current?.pause();
    setClockView((current) =>
      current.paused ? current : { ...current, paused: true },
    );
  }, [world.onboarding]);

  const { cash, fundingEligible } = { cash: world.cash, ...summarize(world) };
  const approve = useCallback(
    (customer: Customer) => {
      setOverlay(null);
      if (cash < customer.amount) {
        if (fundingEligible) setOverlay({ kind: "funding" });
        setNotice(
          fundingEligible
            ? `${m.insufficientCash} ${m.viewFunding}`
            : `${m.insufficientCash} ${m.fundingUnavailable}`,
        );
        return;
      }
      dispatch({ type: "approve", customerId: customer.id });
      if (
        world.onboarding === "first-customer" &&
        customer.id === world.config.introCustomerId
      )
        markCoachmarkCompleted("approve-first-loan");
      setConsultation(initialConsultationProgress());
    },
    [
      cash,
      dispatch,
      fundingEligible,
      m,
      markCoachmarkCompleted,
      setNotice,
      world.config.introCustomerId,
      world.onboarding,
    ],
  );
  const reject = useCallback(
    (customer: Customer) => {
      dispatch({ type: "reject", customerId: customer.id });
      setOverlay(null);
      setConsultation(initialConsultationProgress());
    },
    [dispatch],
  );
  const { createDepositProduct, createLoanProduct } = useMarketProductCreation({
    world,
    locale,
    dispatch,
    closeBuilder: () => setOverlay(null),
    completeCoachmark: markCoachmarkCompleted,
    setNotice,
  });
  const borrow = useCallback(
    (lender: Funding) => {
      dispatch({ type: "borrow", lenderId: lender.id });
      setOverlay(null);
    },
    [dispatch],
  );

  function toggleClock(): void {
    const gameClock = clockRef.current;
    if (!gameClock) return;
    if (gameClock.paused) {
      gameClock.play();
      if (world.onboarding === "first-repayment")
        markCoachmarkCompleted("play-first-repayment");
    } else gameClock.pause();
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
        highlightedSegment={highlightedSegment}
        onBack={onBack}
        onOpenAssets={() => setOverlay({ kind: "assets" })}
        onOpenNews={() => {
          dispatch({ type: "read-market-news" });
          setOverlay({ kind: "news" });
        }}
        onOpenProductBuilder={openProductBuilder}
        onOpenDepositProductBuilder={openDepositProductBuilder}
        onProductPickerOpenChange={setProductPickerOpen}
        onSelectCustomer={(customer) => {
          if (world.onboarding === "second-decision")
            markCoachmarkCompleted("second-customer");
          setOverlay({ kind: "customer", customerId: customer.id });
        }}
        onSelectProduct={(product) =>
          setOverlay({ kind: "product", productId: product.id })
        }
        onOpenFunding={openFunding}
        onToggleClock={toggleClock}
        onCycleSpeed={cycleSpeed}
        onFirstMapDrag={() =>
          setUi((current) => ({
            ...completeCoachmark(current, "drag-market-map"),
            hasDraggedMap: true,
          }))
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
        overlay={overlay}
        consultation={consultation}
        onCloseOverlay={() => setOverlay(null)}
        onConsultationProgress={setConsultation}
        onConsultationQuestionAsked={(question) => {
          if (question === "purpose" && world.onboarding === "first-customer")
            markCoachmarkCompleted("first-customer");
        }}
        onApprove={approve}
        onReject={reject}
        onNeedFunding={() => {
          setOverlay({ kind: "funding" });
        }}
        onCreateProduct={createLoanProduct}
        onCreateDepositProduct={createDepositProduct}
        onToggleProduct={(productId, active) =>
          dispatch({ type: "set-product-active", productId, active })
        }
        onToggleProductAlertGuard={(productId, enabled) =>
          dispatch({ type: "set-product-alert-guard", productId, enabled })
        }
        onShowNewsSegment={(segment) => {
          setHighlightedSegment(segment);
          setOverlay(null);
        }}
        onBorrow={borrow}
        onComplete={() => (onComplete ? onComplete() : onBack())}
        onBack={onBack}
      />
      {activeCoachmark && (
        <CoachmarkSpotlight
          id={activeCoachmark}
          title={
            coachmarkDefinition?.title === "first-step"
              ? m.onboardingFirstStep
              : m.coachmarkNewControl
          }
          copy={coachmarkCopy}
          onShown={markCoachmarkIntroduced}
        />
      )}
    </>
  );
}
