import {
  ArrowRightLeft,
  CalendarClock,
  Check,
  Landmark,
  Wallet,
} from "lucide-react";
import { localize } from "../i18n/local-text.ts";
import type { Locale } from "../i18n/locale.ts";
import { messagesFor } from "../i18n/messages/index.ts";
import { money } from "./market-format.ts";
import type { Funding } from "./market-world.ts";

export function InterbankConversation({
  funding,
  locale,
  showRiskWarning,
  currentCash,
  onBorrow,
}: {
  funding: Funding[];
  locale: Locale;
  showRiskWarning: boolean;
  currentCash: number;
  onBorrow: (lender: Funding) => void;
}) {
  const m = messagesFor(locale).market;
  const availableFunding = funding.filter((item) => !item.accepted);

  return (
    <section className="conversation-card funding-conversation">
      <div className="conversation-scene">
        <span className="scene-label">{m.fundingConversationScene}</span>
        <img
          className="funding-character"
          src="/assets/pop-art/avatars/fund-manager-neutral.png"
          alt={m.fundingManagerAlt}
        />
        <div className="conversation-messages" aria-live="polite">
          <div className="speech-bubble bubble-neutral">
            <small>{m.fundingManagerName}</small>
            <p>{m.fundingConversationGreeting}</p>
          </div>
        </div>
      </div>
      <div className="conversation-actions">
        <p className="action-guide">{m.fundingConversationPrompt}</p>
        <div className="funding-lesson" role="note">
          <div className="funding-lesson-flow">
            <span>
              <Wallet />
              <strong>{money(currentCash)}</strong>
              <small>{m.fundingConversationCurrentCash}</small>
            </span>
            <ArrowRightLeft aria-hidden="true" />
            <span>
              <Landmark />
              <strong>{m.fundingConversationMoreLending}</strong>
              <small>{m.fundingConversationLesson}</small>
            </span>
          </div>
          {showRiskWarning && (
            <p className="funding-lesson-warning">
              <CalendarClock /> {m.fundingRiskInsolvency}
            </p>
          )}
        </div>
        <div className="funding-conversation-options">
          {availableFunding.map((lender, index) => (
            <button
              className="funding-offer"
              key={lender.id}
              onClick={() => onBorrow(lender)}
            >
              <span className="funding-offer-index">{index + 1}</span>
              <span className="funding-offer-main">
                <strong>{localize(lender.name, locale)}</strong>
                <small>{m.fundingOfferLine}</small>
              </span>
              <span className="funding-offer-amount">
                <strong>{money(lender.amount)}</strong>
                <small>{m.annualRate(lender.rate)}</small>
              </span>
              <span className="funding-offer-terms">
                <small>{m.fundingCashNow}</small>
                <small>{m.dueInDays(lender.dueDay)}</small>
              </span>
              <span className="funding-offer-select">
                <Check aria-hidden="true" />
                {m.select}
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
