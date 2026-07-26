import type { Locale } from "../i18n/locale.ts";
import { messagesFor } from "../i18n/messages/index.ts";
import { FundingOfferList } from "./FundingOfferList.tsx";
import type { Funding } from "./market-world.ts";

export function InterbankConversation({
  funding,
  locale,
  onBorrow,
}: {
  funding: Funding[];
  locale: Locale;
  onBorrow: (lender: Funding) => void;
}) {
  const m = messagesFor(locale).market;

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
        <FundingOfferList
          funding={funding}
          locale={locale}
          onBorrow={onBorrow}
        />
      </div>
    </section>
  );
}
