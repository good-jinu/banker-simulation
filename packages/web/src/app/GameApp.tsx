import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Check,
  Landmark,
  LockKeyhole,
  Play,
  RotateCcw,
} from "lucide-react";
import { MarketApp } from "../market/MarketApp.tsx";
import { localize } from "../i18n/local-text.ts";
import {
  marketCampaignStages,
  marketStageById,
} from "../market/market-campaign.ts";
import { detectLocale, type Locale } from "../i18n/locale.ts";
import { messagesFor } from "../i18n/messages/index.ts";
import {
  deleteMarketSession,
  emptySave,
  loadMarketSession,
  loadGame,
  saveGame,
  type CampaignProgress,
  type PlayerSettings,
} from "./persistence.ts";
import "./game.css";

type Screen = "home" | "stages" | "campaign";
type GameAppProps = {
  /** A typed initial route supplied by an alternate bootstrap, if any. */
  initialScreen?: Screen;
  initialStageId?: string;
};

export function GameApp({
  initialScreen = "home",
  initialStageId = marketCampaignStages[0]!.id,
}: GameAppProps) {
  const [hydrated, setHydrated] = useState(false);
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [selectedStageId, setSelectedStageId] = useState(
    () => marketStageById(initialStageId).id,
  );
  const [campaign, setCampaign] = useState<CampaignProgress>(
    () => emptySave().campaign,
  );
  const [settings, setSettings] = useState<PlayerSettings>(
    () => emptySave().settings,
  );
  const [savedRunStageId, setSavedRunStageId] = useState<string | null>(null);
  const [checkingStageId, setCheckingStageId] = useState<string | null>(null);
  const locale: Locale = settings.locale ?? detectLocale();
  const m = messagesFor(locale);
  const selectedStage = marketStageById(selectedStageId);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    let cancelled = false;
    loadGame()
      .then((save) => {
        if (cancelled) return;
        setCampaign(save.campaign);
        setSettings(save.settings);
        setHydrated(true);
      })
      .catch(() => {
        if (cancelled) return;
        const fallback = emptySave();
        setCampaign(fallback.campaign);
        setSettings(fallback.settings);
        setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void saveGame({ schemaVersion: 2, campaign, settings });
  }, [campaign, hydrated, settings]);

  function changeLocale(nextLocale: Locale): void {
    setSettings((current) => ({ ...current, locale: nextLocale }));
  }

  function beginStage(stageId: string): void {
    setSelectedStageId(stageId);
    setScreen("campaign");
  }

  async function selectStage(stageId: string): Promise<void> {
    const stage = marketStageById(stageId);
    setCheckingStageId(stageId);
    try {
      const session = await loadMarketSession(stage.id, stage.config);
      if (session) {
        setSavedRunStageId(stage.id);
        return;
      }
      beginStage(stage.id);
    } catch {
      beginStage(stage.id);
    } finally {
      setCheckingStageId(null);
    }
  }

  async function startNewStage(stageId: string): Promise<void> {
    try {
      await deleteMarketSession(stageId);
    } finally {
      setSavedRunStageId(null);
      beginStage(stageId);
    }
  }

  if (!hydrated) {
    return (
      <main className="loading-screen" aria-live="polite">
        <div className="brand-mark">
          <Landmark aria-hidden="true" />
        </div>
        <p className="eyebrow">Banker Simulation</p>
        <h1>{m.gameApp.loading}</h1>
      </main>
    );
  }

  if (screen === "campaign") {
    return (
      <MarketApp
        stage={selectedStage}
        locale={locale}
        onBack={() => setScreen("stages")}
        onComplete={() => {
          void deleteMarketSession(selectedStage.id);
          setCampaign((current) => {
            const stage = selectedStage;
            return {
              ...current,
              completedStageIds: current.completedStageIds.includes(stage.id)
                ? current.completedStageIds
                : [...current.completedStageIds, stage.id],
              rewards: current.rewards.includes(stage.rewardId)
                ? current.rewards
                : [...current.rewards, stage.rewardId],
              mostRecentStageId: stage.id,
            };
          });
          setScreen("stages");
        }}
      />
    );
  }

  if (screen === "stages") {
    return (
      <StageSelection
        campaign={campaign}
        locale={locale}
        onBack={() => setScreen("home")}
        onChangeLocale={changeLocale}
        onSelect={selectStage}
        checkingStageId={checkingStageId}
        savedRunStageId={savedRunStageId}
        onContinue={() => {
          if (savedRunStageId) beginStage(savedRunStageId);
          setSavedRunStageId(null);
        }}
        onStartNew={() => {
          if (savedRunStageId) void startNewStage(savedRunStageId);
        }}
        onCancelSavedRun={() => setSavedRunStageId(null)}
      />
    );
  }

  return (
    <main className="home-screen">
      <div className="home-language">
        <LanguageSelect locale={locale} onChange={changeLocale} />
      </div>
      <div className="home-title" aria-label="Banker Simulation">
        <span className="home-logo-mark">
          <Landmark aria-hidden="true" />
        </span>
        <strong>
          <span>Banker</span>
          <span>Simulation</span>
        </strong>
        <button
          className="home-play-button"
          onClick={() => setScreen("stages")}
        >
          <Play aria-hidden="true" fill="currentColor" /> {m.gameApp.play}
        </button>
      </div>
    </main>
  );
}

function StageSelection({
  campaign,
  locale,
  onBack,
  onChangeLocale,
  onSelect,
  checkingStageId,
  savedRunStageId,
  onContinue,
  onStartNew,
  onCancelSavedRun,
}: {
  campaign: CampaignProgress;
  locale: Locale;
  onBack: () => void;
  onChangeLocale: (locale: Locale) => void;
  onSelect: (stageId: string) => Promise<void>;
  checkingStageId: string | null;
  savedRunStageId: string | null;
  onContinue: () => void;
  onStartNew: () => void;
  onCancelSavedRun: () => void;
}) {
  const m = messagesFor(locale);
  return (
    <main className="home-screen">
      <section
        className="stage-card-overlay"
        aria-label={m.gameApp.stageSelection}
      >
        <header className="stage-card-header">
          <button
            className="stage-card-back"
            onClick={onBack}
            aria-label={m.gameApp.backToMainMenu}
          >
            <ArrowLeft aria-hidden="true" />
          </button>
          <strong>{m.gameApp.campaignStages}</strong>
          <LanguageSelect locale={locale} onChange={onChangeLocale} />
        </header>
        <div className="stage-card-grid">
          {marketCampaignStages.map((stage, index) => {
            const complete = campaign.completedStageIds.includes(stage.id);
            const unlocked =
              index === 0 ||
              campaign.completedStageIds.includes(
                marketCampaignStages[index - 1]!.id,
              );
            return (
              <button
                key={stage.id}
                className={`stage-card${unlocked ? " active" : " locked"}${complete ? " complete" : ""}`}
                disabled={!unlocked || checkingStageId !== null}
                onClick={() => void onSelect(stage.id)}
              >
                <span className="stage-card-image">
                  <img src={stage.image} alt="" />
                  <b>{String(stage.number).padStart(2, "0")}</b>
                  {complete ? (
                    <Check aria-label={m.gameApp.playAgain} />
                  ) : !unlocked ? (
                    <LockKeyhole aria-label={m.gameApp.locked} />
                  ) : null}
                </span>
                <span className="stage-card-copy">
                  <strong>{localize(stage.title, locale)}</strong>
                  <small>
                    {complete
                      ? m.gameApp.playAgain
                      : unlocked
                        ? localize(stage.subtitle, locale)
                        : m.gameApp.completePriorStage}
                  </small>
                </span>
              </button>
            );
          })}
        </div>
      </section>
      {savedRunStageId && (
        <div className="saved-run-backdrop" role="presentation">
          <section
            className="saved-run-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="saved-run-title"
          >
            <Landmark aria-hidden="true" />
            <h2 id="saved-run-title">{m.gameApp.savedRunTitle}</h2>
            <p>{m.gameApp.savedRunDescription}</p>
            <div className="saved-run-actions">
              <button className="saved-run-continue" onClick={onContinue}>
                <Play aria-hidden="true" fill="currentColor" />
                {m.gameApp.continueRun}
              </button>
              <button className="saved-run-new" onClick={onStartNew}>
                <RotateCcw aria-hidden="true" />
                {m.gameApp.newRun}
              </button>
              <button className="saved-run-cancel" onClick={onCancelSavedRun}>
                {m.gameApp.cancel}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function LanguageSelect({
  locale,
  onChange,
}: {
  locale: Locale;
  onChange: (locale: Locale) => void;
}) {
  return (
    <label className="language-select compact">
      <span className="sr-only">{messagesFor(locale).gameApp.language}</span>
      <select
        aria-label={messagesFor(locale).gameApp.language}
        value={locale}
        onChange={(event) => onChange(event.target.value as Locale)}
      >
        <option value="en">English</option>
        <option value="ko">한국어</option>
      </select>
    </label>
  );
}
