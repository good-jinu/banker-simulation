import { Landmark } from "lucide-react";
import type { Locale } from "../i18n/locale.ts";
import { messagesFor } from "../i18n/messages/index.ts";
import { money } from "./market-format.ts";

export function LoanDecisionActions({
  amount,
  canApprove,
  locale,
  mode,
  showRiskEstimate,
  onApprove,
  onNeedFunding,
  onProceed,
  onReject,
}: {
  amount: number;
  canApprove: boolean;
  locale: Locale;
  mode: "intro" | "request";
  showRiskEstimate: boolean;
  onApprove?: (() => void) | undefined;
  onNeedFunding?: (() => void) | undefined;
  onProceed?: (() => void) | undefined;
  onReject?: (() => void) | undefined;
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
          <button className="reject-button" onClick={onReject}>
            {m.reject}
          </button>
          <button
            className="accept-button"
            onClick={onApprove}
            disabled={!canApprove}
          >
            {m.lend(money(amount))}
          </button>
        </div>
      )}
      {mode === "request" && !canApprove && onNeedFunding && (
        <button className="need-funding" onClick={onNeedFunding}>
          {m.fundingNeeded}
        </button>
      )}
    </div>
  );
}
