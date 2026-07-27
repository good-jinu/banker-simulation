import { Check, Info } from "lucide-react";
import type { Locale } from "../i18n/locale.ts";
import { messagesFor } from "../i18n/messages/index.ts";
import {
  CONSULTATION_QUESTIONS,
  type ConsultationQuestionId,
} from "./market-consultation.ts";
import { coachmarkTarget } from "./market-ui-state.ts";

export function ConsultationQuestions({
  asked,
  locale,
  onAsk,
}: {
  asked: Partial<Record<ConsultationQuestionId, boolean>>;
  locale: Locale;
  onAsk: (question: ConsultationQuestionId) => void;
}) {
  const m = messagesFor(locale).market;
  return (
    <div className="question-list">
      {CONSULTATION_QUESTIONS.map((question) => {
        const wasAsked = Boolean(asked[question]);
        return (
          <div className="question-group" key={question}>
            <button
              className={wasAsked ? "asked" : ""}
              onClick={() => onAsk(question)}
              aria-pressed={wasAsked}
              {...coachmarkTarget(
                question === "purpose" ? "first-customer" : null,
              )}
            >
              {wasAsked ? <Check /> : <Info />}
              {question === "purpose" ? m.askPurpose : m.askIncome}
            </button>
          </div>
        );
      })}
    </div>
  );
}
