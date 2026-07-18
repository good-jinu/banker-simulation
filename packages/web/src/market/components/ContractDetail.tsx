import { Check, Pencil, X } from "lucide-react";
import type { Locale } from "../../i18n/locale.ts";
import { messagesFor } from "../../i18n/messages/index.ts";
import { draftExpressions } from "../builder-draft.ts";
import { staticContractTerms, type ContractOffer } from "../market-world.ts";

export function ContractDetail({
  contract,
  locale,
  onDecide,
  onOpenActor,
  onEdit,
  highlightAcceptRequestId,
}: {
  contract: ContractOffer;
  locale: Locale;
  onDecide: (requestId: string, accept: boolean) => void;
  onOpenActor: (demandId: string) => void;
  onEdit: () => void;
  highlightAcceptRequestId?: string | undefined;
}) {
  const m = messagesFor(locale);
  const t = m.marketSim;
  const pending = contract.requests.filter(
    (request) => request.status === "pending",
  );
  const review = contract.requests.filter(
    (request) => request.status === "review",
  );
  const queued = [...review, ...pending];
  const statics = staticContractTerms(contract.builderNodes);
  const formulas = draftExpressions(contract.builderNodes);
  return (
    <div className="mk-detail-scroll" style={{ position: "relative" }}>
      <article className="mk-contract-summary">
        <div>
          <small>{t.lends}</small>
          <strong className={statics ? "" : "formula"}>
            {statics ? `$${statics.principal.toLocaleString()}` : formulas.lend}
          </strong>
        </div>
        <div>
          <small>{t.termLabel}</small>
          <strong className={statics ? "" : "formula"}>
            {statics ? t.daysCount(statics.termDays) : formulas.term}
          </strong>
        </div>
        <div>
          <small>{t.asksBack}</small>
          <strong className={statics ? "" : "formula"}>
            {statics
              ? `$${statics.repayment.toLocaleString()}`
              : formulas.repay}
          </strong>
        </div>
      </article>
      <div className="mk-request-heading">
        <h2>{t.requestsTitle}</h2>
        <b>{t.requestQueueCount(pending.length, review.length)}</b>
      </div>
      {queued.length > 0 ? (
        <div className="mk-request-grid">
          {queued.map((request) => (
            <div
              className={`mk-request-cell${
                request.status === "review" ? " needs-review" : ""
              }`}
              key={request.id}
            >
              <button
                className="mk-request-portrait"
                onClick={() => onOpenActor(request.demandId)}
                aria-label={request.actor.name}
              >
                <img src={request.actor.image} alt="" />
              </button>
              <strong>{request.actor.name}</strong>
              {request.status === "review" ? (
                <em>{t.requestEvaluationError}</em>
              ) : (
                <>
                  <em>
                    {request.issue === "insufficient-cash"
                      ? t.requestInsufficientCash(request.principal)
                      : t.requestTerms(
                          request.principal,
                          request.repayment,
                          request.termDays,
                        )}
                  </em>
                  <span className="mk-request-actions">
                    <button
                      className={`accept${
                        request.id === highlightAcceptRequestId
                          ? " mk-tutorial-target"
                          : ""
                      }`}
                      onClick={() => onDecide(request.id, true)}
                      aria-label={`${t.accept} · ${request.actor.name}`}
                    >
                      <Check aria-hidden="true" />
                    </button>
                    <button
                      className="reject"
                      onClick={() => onDecide(request.id, false)}
                      aria-label={`${t.reject} · ${request.actor.name}`}
                    >
                      <X aria-hidden="true" />
                    </button>
                  </span>
                </>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="mk-request-empty">{t.noRequests}</p>
      )}
      <button className="mk-fab" onClick={onEdit} aria-label={t.editContract}>
        <Pencil aria-hidden="true" />
      </button>
    </div>
  );
}
