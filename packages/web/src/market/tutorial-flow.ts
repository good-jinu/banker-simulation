/**
 * A small, pure controller for the first-stage teaching flow.
 *
 * It deliberately receives a compact snapshot instead of mutating the market
 * world. The simulation remains identical for every campaign stage; this
 * module only decides which one-action prompt the UI should show.
 */
export type FirstYieldTutorialStep =
  | "inspect-request"
  | "open-builder"
  | "build-contract"
  | "post-contract"
  | "await-request"
  | "approve-request"
  | "collect-repayment"
  | "claim-reward";

export type FirstYieldTutorialSnapshot = {
  view: "map" | "demand" | "contract" | "builder";
  hasPostedContract: boolean;
  targetRequestStatus: "pending" | "accepted" | null;
  hasActiveTargetLoan: boolean;
  repaidLoans: number;
  draftIsReady: boolean;
};

export function deriveFirstYieldTutorialStep({
  view,
  hasPostedContract,
  targetRequestStatus,
  hasActiveTargetLoan,
  repaidLoans,
  draftIsReady,
}: FirstYieldTutorialSnapshot): FirstYieldTutorialStep {
  if (repaidLoans > 0) return "claim-reward";
  if (hasActiveTargetLoan || targetRequestStatus === "accepted")
    return "collect-repayment";
  if (targetRequestStatus === "pending") return "approve-request";
  if (hasPostedContract) return "await-request";
  if (view === "builder")
    return draftIsReady ? "post-contract" : "build-contract";
  if (view === "demand") return "open-builder";
  return "inspect-request";
}
