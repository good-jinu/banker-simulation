import { Check, Info, Landmark } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { localize } from "../i18n/local-text.ts";
import type { Locale } from "../i18n/locale.ts";
import { messagesFor } from "../i18n/messages/index.ts";
import { money } from "./market-format.ts";
import {
  avatarFor,
  defaultRisk,
  type Customer,
  type CustomerExpression,
} from "./market-world.ts";

export type ConsultationQuestionId = "purpose" | "income";
export type ConsultationProgress = {
  asked: ConsultationQuestionId[];
  lastQuestion: ConsultationQuestionId | null;
  expression: CustomerExpression;
};
type ConversationMode = "intro" | "request";

const CONSULTATION_QUESTIONS: ConsultationQuestionId[] = ["purpose", "income"];

export function CustomerConsultation({
  customer,
  locale,
  showRiskEstimate,
  learnCustomerHint,
  mode,
  sceneLabel,
  onProceed,
  onApprove,
  onReject,
  onNeedFunding,
  canApprove = true,
  initialProgress,
  onProgressChange,
}: {
  customer: Customer;
  locale: Locale;
  /** Show the computed default-risk % instead of a plain repayment amount —
   * only meaningful on stages where defaults are actually randomized. */
  showRiskEstimate: boolean;
  learnCustomerHint: string;
  mode: ConversationMode;
  sceneLabel: string;
  onProceed?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  onNeedFunding?: () => void;
  canApprove?: boolean;
  initialProgress?: ConsultationProgress;
  onProgressChange?: (progress: ConsultationProgress) => void;
}) {
  const m = messagesFor(locale).market;
  const [consultation, setConsultation] = useState<
    Partial<Record<ConsultationQuestionId, boolean>>
  >(() =>
    Object.fromEntries(
      (initialProgress?.asked ?? []).map((question) => [question, true]),
    ),
  );
  const [lastQuestion, setLastQuestion] =
    useState<ConsultationQuestionId | null>(
      initialProgress?.lastQuestion ?? null,
    );
  const [expression, setExpression] = useState<CustomerExpression>(
    initialProgress?.expression ?? "requesting",
  );
  const answered = useMemo(
    () => CONSULTATION_QUESTIONS.filter((question) => consultation[question]),
    [consultation],
  );
  const enoughInformation = answered.length === CONSULTATION_QUESTIONS.length;
  const risk = defaultRisk(customer);

  useEffect(() => {
    onProgressChange?.({
      asked: answered,
      lastQuestion,
      expression,
    });
  }, [answered, expression, lastQuestion, onProgressChange]);

  function ask(question: ConsultationQuestionId): void {
    setConsultation((current) => ({ ...current, [question]: true }));
    setLastQuestion(question);
    setExpression("relieved");
  }

  function label(question: ConsultationQuestionId): string {
    return question === "purpose" ? m.askPurpose : m.askIncome;
  }

  function evidence(question: ConsultationQuestionId): string {
    return question === "purpose"
      ? localize(customer.evidence.purpose, locale)
      : `${localize(customer.job, locale)} · ${money(customer.income)}`;
  }

  function riskLabel(value: number): string {
    if (value < 20) return m.riskLow;
    if (value < 40) return m.riskMedium;
    return m.riskHigh;
  }

  const openingMessage =
    mode === "intro"
      ? `${showRiskEstimate ? m.challengeGreeting : m.greeting} ${showRiskEstimate ? m.challengeLoanQuestion(money(customer.amount)) : m.loanQuestion}`
      : m.requestCopy(money(customer.amount));

  return (
    <section
      className={`conversation-card customer-conversation${mode === "request" ? " request-conversation" : ""}`}
    >
      <div className="conversation-scene">
        <span className="scene-label">{sceneLabel}</span>
        <img
          className={`consultation-character expression-${expression}`}
          src={avatarFor(customer, expression)}
          alt={m.customerAlt(
            localize(customer.name, locale),
            m.expressionAlt(expression),
          )}
        />
        <div className="conversation-messages" aria-live="polite">
          <div className={`speech-bubble bubble-${expression}`}>
            <small>{localize(customer.name, locale)}</small>
            <p>{lastQuestion ? evidence(lastQuestion) : openingMessage}</p>
          </div>
        </div>
      </div>
      <div className="conversation-actions">
        <p className="action-guide">{learnCustomerHint}</p>
        <div className="question-list">
          {CONSULTATION_QUESTIONS.map((question) => {
            const asked = Boolean(consultation[question]);
            return (
              <div className="question-group" key={question}>
                <button
                  className={asked ? "asked" : ""}
                  onClick={() => ask(question)}
                  disabled={asked}
                >
                  {asked ? <Check /> : <Info />} {label(question)}
                </button>
              </div>
            );
          })}
        </div>
        {enoughInformation && (
          <div className="approve-reveal">
            <div className="underwriting-callout">
              <img
                src={`/assets/pop-art/atoms/${showRiskEstimate && risk >= 40 ? "warning-burst" : "goal-badge"}.svg`}
                alt=""
              />
              <span>
                <small>{m.underwritingDecision}</small>
                <strong>
                  {showRiskEstimate
                    ? `${m.estimatedRisk}: ${risk}% · ${riskLabel(risk)}`
                    : m.informationChecked(
                        money(customer.amount * (1 + customer.rate / 100)),
                        customer.term,
                      )}
                </strong>
              </span>
            </div>
            {mode === "intro" ? (
              <button onClick={onProceed}>
                <Landmark />
                {showRiskEstimate ? m.openUnderwriting : m.approveRequest}
              </button>
            ) : (
              <div className="decision-row">
                <button className="reject-button" onClick={onReject}>
                  {m.reject}
                </button>
                <button
                  className="accept-button"
                  onClick={onApprove}
                  disabled={!canApprove}
                >
                  {m.lend(money(customer.amount))}
                </button>
              </div>
            )}
            {mode === "request" && !canApprove && onNeedFunding && (
              <button className="need-funding" onClick={onNeedFunding}>
                {m.fundingNeeded}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
