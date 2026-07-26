import { Check } from "lucide-react";
import { localize } from "../i18n/local-text.ts";
import type { Locale } from "../i18n/locale.ts";
import { messagesFor } from "../i18n/messages/index.ts";
import { money } from "./market-format.ts";
import type { Funding } from "./market-world.ts";

export function FundingOfferList({
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
    <div className="funding-conversation-options">
      {funding
        .filter((lender) => !lender.accepted)
        .map((lender, index) => (
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
  );
}
