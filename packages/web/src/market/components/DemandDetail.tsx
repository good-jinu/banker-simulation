import { Send } from "lucide-react";
import { localize } from "../../i18n/local-text.ts";
import type { Locale } from "../../i18n/locale.ts";
import { messagesFor } from "../../i18n/messages/index.ts";
import type { Demand } from "../market-world.ts";

export function DemandDetail({
  demand,
  locale,
  onDraft,
  highlightDraftAction = false,
}: {
  demand: Demand;
  locale: Locale;
  onDraft?: (() => void) | undefined;
  highlightDraftAction?: boolean;
}) {
  const m = messagesFor(locale);
  const t = m.marketSim;
  const actor = demand.actor;
  return (
    <section className="cs-customer-detail mk-detail-scroll">
      <div className="cs-profile-hero">
        <img src={actor.image} alt="" />
        <div>
          <small>
            {actor.gender === "female" ? t.genderFemale : t.genderMale} ·{" "}
            {t.ageYears(actor.age)}
          </small>
          <h1>{actor.name}</h1>
          <p>
            {actor.occupation
              ? localize(actor.occupation, locale)
              : t.unemployed}
          </p>
        </div>
      </div>
      <dl className="cs-profile-facts">
        <div>
          <dt>{t.factGender}</dt>
          <dd>{actor.gender === "female" ? t.genderFemale : t.genderMale}</dd>
        </div>
        <div>
          <dt>{t.factAge}</dt>
          <dd>{t.ageYears(actor.age)}</dd>
        </div>
        <div>
          <dt>{t.factOccupation}</dt>
          <dd>
            {actor.occupation
              ? localize(actor.occupation, locale)
              : t.unemployed}
          </dd>
        </div>
        <div>
          <dt>{t.factIncome}</dt>
          <dd>
            {actor.monthlyIncome > 0 ? t.perMonth(actor.monthlyIncome) : "—"}
          </dd>
        </div>
      </dl>
      <article className="cs-need-card">
        <span>{t.demandBadge}</span>
        <h2>{t.demandNeedTitle}</h2>
        <div>
          <p>
            <small>{m.customer.neededNow}</small>
            <strong>{t.needsNow(demand.amount)}</strong>
          </p>
          <p>
            <small>{m.customer.returnLabel}</small>
            <strong>{t.payableAfter(demand.payableAfterDays)}</strong>
          </p>
          <p>
            <small>{m.customer.termsLabel}</small>
            <strong>{t.maxRepayment(demand.maxRepayment)}</strong>
          </p>
        </div>
      </article>
      {onDraft && (
        <button
          className={`cs-build-button mk-demand-cta${
            highlightDraftAction ? " mk-tutorial-target" : ""
          }`}
          onClick={onDraft}
        >
          <Send aria-hidden="true" /> {t.draftContract}
        </button>
      )}
    </section>
  );
}
