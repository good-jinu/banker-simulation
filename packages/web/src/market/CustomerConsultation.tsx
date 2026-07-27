import { useEffect, useMemo, useState } from "react";
import { localize } from "../i18n/local-text.ts";
import type { Locale } from "../i18n/locale.ts";
import { messagesFor } from "../i18n/messages/index.ts";
import { money } from "./market-format.ts";
import { ConsultationQuestions } from "./ConsultationQuestions.tsx";
import { LoanDecisionActions } from "./LoanDecisionActions.tsx";
import {
  CONSULTATION_QUESTIONS,
  type ConsultationProgress,
  type ConsultationQuestionId,
} from "./market-consultation.ts";
import {
  avatarFor,
  type Customer,
  type CustomerExpression,
} from "./market-world.ts";

type ConversationMode = "intro" | "request";

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
  requireQuestionsBeforeDecision = false,
  forceApproval = false,
  initialProgress,
  onProgressChange,
  onQuestionAsked,
}: {
  customer: Customer;
  locale: Locale;
  /** Adjust the opening dialogue for stages with randomized defaults. */
  showRiskEstimate: boolean;
  learnCustomerHint: string;
  mode: ConversationMode;
  sceneLabel: string;
  onProceed?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  onNeedFunding?: () => void;
  canApprove?: boolean;
  /** The first customer teaches information gathering before a decision. */
  requireQuestionsBeforeDecision?: boolean;
  forceApproval?: boolean;
  initialProgress?: ConsultationProgress;
  onProgressChange?: (progress: ConsultationProgress) => void;
  onQuestionAsked?: (question: ConsultationQuestionId) => void;
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
    onQuestionAsked?.(question);
  }

  function evidence(question: ConsultationQuestionId): string {
    return question === "purpose"
      ? localize(customer.evidence.purpose, locale)
      : `${localize(customer.job, locale)} · ${money(customer.income)}`;
  }

  const openingMessage =
    mode === "intro"
      ? `${showRiskEstimate ? m.challengeGreeting : m.greeting} ${showRiskEstimate ? m.challengeLoanQuestion(money(customer.amount)) : m.loanQuestion}`
      : m.requestCopy(money(customer.amount));
  const hasRequiredInformation =
    !requireQuestionsBeforeDecision ||
    answered.length === CONSULTATION_QUESTIONS.length;
  const canMakeDecision = canApprove && hasRequiredInformation;

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
        <div className="loan-request-amount" aria-label={m.loanAmount}>
          <small>{m.loanAmount}</small>
          <strong>{money(customer.amount)}</strong>
        </div>
        <p className="action-guide">{learnCustomerHint}</p>
        <ConsultationQuestions
          asked={consultation}
          locale={locale}
          onAsk={ask}
        />
        <LoanDecisionActions
          amount={customer.amount}
          canApprove={canMakeDecision}
          canReject={hasRequiredInformation && !forceApproval}
          needsFunding={!canApprove}
          locale={locale}
          mode={mode}
          showRiskEstimate={showRiskEstimate}
          onApprove={onApprove}
          onNeedFunding={onNeedFunding}
          onProceed={onProceed}
          onReject={onReject}
          {...(forceApproval
            ? { rejectLockedHint: m.firstLoanRejectLocked }
            : {})}
        />
      </div>
    </section>
  );
}
