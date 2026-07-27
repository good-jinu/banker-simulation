import { Landmark } from "lucide-react";
import type { Locale } from "../i18n/locale.ts";
import { messagesFor } from "../i18n/messages/index.ts";
import { money } from "./market-format.ts";
import { coachmarkTarget } from "./market-ui-state.ts";

export function LoanDecisionActions({
  amount,
  canApprove,
  canReject,
  needsFunding,
  locale,
  mode,
  showRiskEstimate,
  onApprove,
  onNeedFunding,
  onProceed,
  onReject,
  rejectLockedHint,
}: {
  amount: number;
  canApprove: boolean;
  canReject: boolean;
  needsFunding: boolean;
  locale: Locale;
  mode: "intro" | "request";
  showRiskEstimate: boolean;
  onApprove?: (() => void) | undefined;
  onNeedFunding?: (() => void) | undefined;
  onProceed?: (() => void) | undefined;
  onReject?: (() => void) | undefined;
  rejectLockedHint?: string;
}) {
  const m = messagesFor(locale).market;
  return (
    <div className="decision-actions">
      {mode === "intro" ? (
        <button onClick={onProceed}>
          <Landmark />
          {showRiskEstimate ? m.openUnderwriting : m.approveRequest}
        </button>
      ) : (
        <div className="decision-row">
          {onReject && (
            <button
              className="reject-button"
              onClick={onReject}
              disabled={!canReject}
            >
              {m.reject}
            </button>
          )}
          <button
            className="accept-button"
            onClick={onApprove}
            disabled={!canApprove}
            {...coachmarkTarget("approve-first-loan")}
          >
            {m.lend(money(amount))}
          </button>
        </div>
      )}
      {rejectLockedHint && (
        <small className="decision-lock-hint">{rejectLockedHint}</small>
      )}
      {mode === "request" && needsFunding && onNeedFunding && (
        <button className="need-funding" onClick={onNeedFunding}>
          {m.fundingNeeded}
        </button>
      )}
    </div>
  );
}
