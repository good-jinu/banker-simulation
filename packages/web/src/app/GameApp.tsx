import { useEffect, useState } from "react";
import { ArrowLeft, Check, Landmark, LockKeyhole, Play } from "lucide-react";
import { MarketApp } from "../market/MarketApp.tsx";
import { localize } from "../i18n/local-text.ts";
import {
  marketCampaignStages,
  marketStageById,
  type MarketCampaignStage,
} from "../market/market-campaign.ts";
import { detectLocale, type Locale } from "../i18n/locale.ts";
import { messagesFor } from "../i18n/messages/index.ts";
import {
  deleteMarketSession,
  emptySave,
  loadGame,
  saveGame,
  type CampaignProgress,
  type PlayerSettings,
} from "./persistence.ts";
import "./game.css";

type Screen = "home" | "stages" | "campaign";

export function GameApp() {
  const devQuery = new URLSearchParams(window.location.search);
  const devMode = import.meta.env.DEV && devQuery.get("dev") === "market";
  const devStage = marketStageById(
    devQuery.get("stage") ?? marketCampaignStages[0]!.id,
  );
  const devPhase = devQuery.get("phase") === "map" ? "map" : "intro";
  const devFresh = devQuery.get("fresh") === "1";
  const [hydrated, setHydrated] = useState(false);
  const [screen, setScreen] = useState<Screen>(devMode ? "campaign" : "home");
  const [selectedStageId, setSelectedStageId] = useState(
    devMode ? devStage.id : marketCampaignStages[0]!.id,
  );
  const [campaign, setCampaign] = useState<CampaignProgress>(
    () => emptySave().campaign,
  );
  const [settings, setSettings] = useState<PlayerSettings>(
    () => emptySave().settings,
  );
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
        devMode={devMode}
        devPhase={devPhase}
        devFresh={devFresh}
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
        onSelect={(stageId) => {
          setSelectedStageId(stageId);
          setScreen("campaign");
        }}
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
}: {
  campaign: CampaignProgress;
  locale: Locale;
  onBack: () => void;
  onChangeLocale: (locale: Locale) => void;
  onSelect: (stageId: string) => void;
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
                disabled={!unlocked}
                onClick={() => onSelect(stage.id)}
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
