import type { CustomerExpression } from "./market-world.ts";

export const CONSULTATION_QUESTIONS = ["purpose", "income"] as const;

export type ConsultationQuestionId = (typeof CONSULTATION_QUESTIONS)[number];

export type ConsultationProgress = {
  asked: ConsultationQuestionId[];
  lastQuestion: ConsultationQuestionId | null;
  expression: CustomerExpression;
};

export function initialConsultationProgress(): ConsultationProgress {
  return {
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
