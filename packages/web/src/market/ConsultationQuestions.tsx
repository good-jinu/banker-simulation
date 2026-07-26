import { Check, Info } from "lucide-react";
import type { Locale } from "../i18n/locale.ts";
import { messagesFor } from "../i18n/messages/index.ts";
import type { ConsultationQuestionId } from "./CustomerConsultation.tsx";

const QUESTIONS: ConsultationQuestionId[] = ["purpose", "income"];

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
      {QUESTIONS.map((question) => {
        const wasAsked = Boolean(asked[question]);
        return (
          <div className="question-group" key={question}>
            <button
              className={wasAsked ? "asked" : ""}
              onClick={() => onAsk(question)}
              disabled={wasAsked}
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
