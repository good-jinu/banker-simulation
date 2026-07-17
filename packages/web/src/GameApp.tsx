import { useEffect, useState } from "react";
import { Landmark, Play } from "lucide-react";
import { MarketApp } from "./MarketApp.tsx";
import { detectLocale, type Locale } from "./i18n.tsx";
import { messagesFor } from "./messages/index.ts";
import {
  emptySave,
  loadGame,
  saveGame,
  type CampaignProgress,
  type PlayerSettings,
} from "./persistence.ts";
import "./game.css";

type Screen = "home" | "market";

export function GameApp() {
  const [hydrated, setHydrated] = useState(false);
  const [screen, setScreen] = useState<Screen>("home");
  const [campaign, setCampaign] = useState<CampaignProgress>(
    () => emptySave().campaign,
  );
  const [settings, setSettings] = useState<PlayerSettings>(
    () => emptySave().settings,
  );
  const locale: Locale = settings.locale ?? detectLocale();

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
        <h1>Rebuilding your ledger…</h1>
      </main>
    );
  }

  if (screen === "market")
    return <MarketApp locale={locale} onBack={() => setScreen("home")} />;

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
          onClick={() => setScreen("market")}
        >
          <Play aria-hidden="true" fill="currentColor" /> Play
        </button>
      </div>
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
