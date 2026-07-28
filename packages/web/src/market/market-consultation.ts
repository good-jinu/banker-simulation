import type { CustomerExpression } from "./market-world.ts";

export const CONSULTATION_QUESTIONS = ["purpose", "income"] as const;

export type ConsultationQuestionId = (typeof CONSULTATION_QUESTIONS)[number];

/** What the player learned in a conversation, and whose conversation it was. */
export type ConsultationProgress = {
  /**
   * The customer this progress belongs to. Without it the answers follow the
   * player from one applicant to the next, so every consultation after the
   * first opens already "asked" — skipping the game's core loop.
   */
  customerId: string | null;
  asked: ConsultationQuestionId[];
  lastQuestion: ConsultationQuestionId | null;
  expression: CustomerExpression;
};

/** The answers a consultation reports back; the customer is supplied by the
 * caller, which is the side that knows whose dialog is open. */
export type ConsultationAnswers = Omit<ConsultationProgress, "customerId">;

export function initialConsultationProgress(
  customerId: string | null = null,
): ConsultationProgress {
  return {
    customerId,
    asked: [],
    lastQuestion: null,
    expression: "requesting",
  };
}

export function isConsultationQuestionId(
  value: unknown,
): value is ConsultationQuestionId {
  return CONSULTATION_QUESTIONS.includes(value as ConsultationQuestionId);
}
