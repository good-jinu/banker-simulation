import { localize } from "../i18n/local-text.ts";
import type { Locale } from "../i18n/locale.ts";
import { messagesFor } from "../i18n/messages/index.ts";
import type { MarketCampaignStage } from "./market-campaign.ts";
import { money } from "./market-format.ts";
import { resultDiagnoses, type ResultDiagnosis } from "./market-report.ts";
import { summarize, type MarketWorld } from "./market-world.ts";

type MarketResultReportProps = {
  stage: MarketCampaignStage;
  locale: Locale;
  world: MarketWorld;
  won: boolean;
  onContinue: () => void;
};

function diagnosisCopy(diagnosis: ResultDiagnosis, locale: Locale): string {
  const m = messagesFor(locale).market;
  switch (diagnosis) {
    case "funding":
      return m.diagnosisFunding;
    case "losses":
      return m.diagnosisLosses;
    case "automation":
      return m.diagnosisAutomation;
    case "thin-book":
      return m.diagnosisThinBook;
    case "resilient":
      return m.diagnosisResilient;
  }
}

export function MarketResultReport({
  stage,
  locale,
  world,
  won,
  onContinue,
}: MarketResultReportProps) {
  const m = messagesFor(locale).market;
  const summary = summarize(world);
  const stats = world.stats;
  const title = won
    ? "MISSION CLEAR!"
    : world.failureReason === "trust"
      ? m.trustFailureTitle
      : m.insolventTitle;
  const description = won
    ? localize(stage.config.copy.missionCompleteLabel, locale)
    : world.failureReason === "trust"
      ? m.trustFailureDescription
      : m.insolventDescription;
  return (
    <section className={`mission-clear-card${won ? "" : " loss-card"}`}>
      <span className="clear-seal">
        <img
          src={`/assets/pop-art/atoms/${won ? "approval-stamp" : "rejection-stamp"}.svg`}
          alt=""
        />
      </span>
      <small>{m.resultReport}</small>
      <h2 id={won ? "mission-clear-title" : "loss-title"}>{title}</h2>
      <p>{description}</p>
      <div className="result-grid">
        <div>
          <span>{m.elapsedTime}</span>
          <strong>DAY {world.day + 1}</strong>
        </div>
        <div>
          <span>{m.trust}</span>
          <strong>{m.trustScore(world.trust)}</strong>
        </div>
        <div>
          <span>{m.contractsCompleted}</span>
          <strong>{m.loanProgress(stats.repaid)}</strong>
        </div>
        <div>
          <span>{m.contractsDefaulted}</span>
          <strong>{m.loanProgress(stats.defaulted)}</strong>
        </div>
        <div>
          <span>{m.automatedLoans}</span>
          <strong>{m.loanProgress(stats.automatedIssued)}</strong>
        </div>
        <div>
          <span>{m.automatedOutcome}</span>
          <strong>
            {stats.automatedRepaid} / {stats.automatedDefaulted}
          </strong>
        </div>
        <div>
          <span>{m.interestEarned}</span>
          <strong>{money(stats.interestEarned)}</strong>
        </div>
        <div>
          <span>{m.currentCash}</span>
          <strong>{money(world.cash)}</strong>
        </div>
        <div>
          <span>{m.fundingBorrowed}</span>
          <strong>{money(stats.fundingBorrowed)}</strong>
        </div>
        <div>
          <span>
            {m.fundingHonored} / {m.fundingMissed}
          </span>
          <strong>
            {stats.fundingRepaid} / {stats.fundingMissed}
          </strong>
        </div>
        <div>
          <span>{m.depositsAccepted}</span>
          <strong>{stats.depositsAccepted}</strong>
        </div>
        <div>
          <span>{m.depositsWithdrawn}</span>
          <strong>{money(stats.depositPrincipalWithdrawn)}</strong>
        </div>
        <div>
          <span>{m.depositInterestPaid}</span>
          <strong>{money(stats.depositInterestPaid)}</strong>
        </div>
        <div className="result-total">
          <span>{m.finalNetWorth}</span>
          <strong>{money(summary.netWorth)}</strong>
        </div>
      </div>
      <div className="result-diagnoses">
        <h3>{m.resultDiagnosis}</h3>
        {resultDiagnoses(stats).map((diagnosis) => (
          <p key={diagnosis}>{diagnosisCopy(diagnosis, locale)}</p>
        ))}
      </div>
      <button onClick={onContinue}>
        {won ? m.checkResult : m.returnToStages}
      </button>
    </section>
  );
}
