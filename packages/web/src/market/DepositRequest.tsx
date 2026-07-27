import { Landmark } from "lucide-react";
import { localize } from "../i18n/local-text.ts";
import type { Locale } from "../i18n/locale.ts";
import { messagesFor } from "../i18n/messages/index.ts";
import { money } from "./market-format.ts";
import type { Depositor } from "./market-world.ts";

export function DepositRequest({
  depositor,
  locale,
  onAccept,
  onReject,
}: {
  depositor: Depositor;
  locale: Locale;
  onAccept: () => void;
  onReject: () => void;
}) {
  const m = messagesFor(locale).market;
  return (
    <section
      className="deposit-request"
      aria-labelledby="deposit-request-title"
    >
      <div className="deposit-request-scene">
        <span id="deposit-request-title">{m.depositRequestTitle}</span>
        <img src={depositor.avatar} alt={localize(depositor.name, locale)} />
        <p>{m.depositRequestCopy(money(depositor.amount))}</p>
      </div>
      <div className="deposit-request-details">
        <small>{localize(depositor.job, locale)}</small>
        <strong>{money(depositor.amount)}</strong>
        <span>{m.depositRate(depositor.rate)}</span>
        <p>{m.depositRequestWarning}</p>
        <div>
          <button className="reject-button" onClick={onReject}>
            {m.reject}
          </button>
          <button className="accept-button" onClick={onAccept}>
            <Landmark aria-hidden="true" />{" "}
            {m.acceptDeposit(money(depositor.amount))}
          </button>
        </div>
      </div>
    </section>
  );
}
