/**
 * English UI message catalog.  This file defines the catalog shape: ko.ts is
 * typed against `Messages`, so adding or removing a key here surfaces as a
 * compile error until every locale is updated.  Parameterized strings are
 * functions so word order stays free per locale.  Stage copy is not here — it
 * lives as LocalText data in market-campaign.ts.
 */
export const en = {
  balance: {
    assetValues: "Asset values",
    cash: "Cash",
    totalAssets: "Total assets",
    openAssetValues: "View asset values",
    closeAssetValues: "Close asset values",
    loanTo: (name: string) => `Loan to ${name}`,
    dueDay: (day: number) => `Due day ${day}`,
    loanValueBasis: "Active loans are valued at outstanding principal.",
  },
  timebar: {
    gameCalendar: "Game calendar",
    dayN: (day: number) => `Day ${day}`,
    objective: (focus: string, complete: number, target: number) =>
      `Objective · ${focus} · ${complete}/${target} repaid`,
    noRecentEvents: "No recent events",
    displayBoard: "Display board",
    currentObjective: "Current objective",
    openDisplayBoard: "Open display board",
    closeDisplayBoard: "Close display board",
    resume: "Resume time",
    pause: "Pause time",
    skip: "Skip to next event",
  },
  customer: {
    neededNow: "Needed now",
    returnLabel: "Return",
    termsLabel: "Terms",
  },
  builder: {
    clause: "Clause",
    nodeIssue: (title: string, issue: string) => `${title}: ${issue}`,
    dismissTip: "Dismiss tip",
  },
  mine: {
    completeStage: (stageNumber: string) => `Complete Stage ${stageNumber}`,
  },
  inspector: {
    deleteNode: "Delete node",
    sender: "Sender",
    transferRecipient: "Recipient",
    amount: "Amount",
    waitDays: "Wait days",
  },
  nodeLabels: {
    startActive: "Terms become active",
    endResolved: "All obligations resolved",
  },
  nodes: {
    start: { title: "Start" },
    transfer: { title: "Transfer Money" },
    wait: { title: "Wait" },
    condition: { title: "Condition" },
    decision: { title: "Decision" },
    variable: { title: "Set Variable" },
    end: { title: "End" },
  },
  marketSim: {
    postContract: "Post a new contract",
    genderFemale: "Female",
    genderMale: "Male",
    ageYears: (age: number) => `${age} years old`,
    unemployed: "No job",
    factGender: "Gender",
    factAge: "Age",
    factOccupation: "Occupation",
    factIncome: "Income",
    perMonth: (amount: number) => `$${amount.toLocaleString()} / mo`,
    demandBadge: "What they ask",
    demandNeedTitle: "The demand",
    needsNow: (amount: number) => `$${amount.toLocaleString()} in cash`,
    payableAfter: (days: number) =>
      `Can pay back after ${Math.round(days / 30)} months (${days} days)`,
    maxRepayment: (amount: number) =>
      `Will repay up to $${amount.toLocaleString()} total`,
    draftContract: "Draft a matching contract",
    lends: "You lend",
    termLabel: "Term",
    asksBack: "You ask back",
    daysCount: (days: number) => `${days} days`,
    requestsTitle: "Requests",
    pendingCount: (count: number) => `${count} pending`,
    noRequests:
      "No requests yet. People whose demand fits these terms will knock as the days pass.",
    accept: "Accept",
    reject: "Reject",
    editContract: "Edit contract",
    borrower: "Borrower",
    builderSummary: "Offer summary",
    previewLine: (principal: number, days: number, repayment: number) =>
      `Sample $100 · 90-day requester → lend $${principal.toLocaleString()}, collect $${repayment.toLocaleString()} after ${days} days.`,
    brokenPreview:
      "These formulas do not produce valid terms — check the amounts, the wait, and the repayment.",
    conditionIf: "If",
    conditionThen: "Then",
    conditionElse: "Else",
    conditionMerge: "Merge",
    conditionVariableLabel: "Variable name",
    conditionNeedsVariable:
      "The condition block needs a variable name (letters and _ only).",
    variableReserved: (name: string) => `"${name}" is already defined.`,
    outcomeDraft: "Draft (review myself)",
    requestTerms: (principal: number, repayment: number, days: number) =>
      `$${principal.toLocaleString()} → $${repayment.toLocaleString()} · ${days}d`,
    builderReady: "This contract is ready to post on the open market.",
    needOutgoing: "Add a transfer that sends the borrower cash.",
    needWait: "Add a wait so the borrower has time to repay.",
    needIncoming: "Add a transfer that returns cash to you.",
    postToMarket: "Post to market",
    saveChanges: "Save changes",
    posted: "Contract posted. Watch the map for requests.",
    updated: "Contract updated. Pending requesters returned to the market.",
    withdrawn: "Contract withdrawn from the market.",
    withdrawContract: "Withdraw this contract",
    insufficientCash: (amount: number) =>
      `You need $${amount.toLocaleString()} liquid to fund this loan.`,
    requestGone: "That request has already been withdrawn.",
    backToMap: "Back to the map",
    slotEmpty: "Complete every value slot.",
    valueUnavailable: (name: string) =>
      `"${name}" is not available on this path.`,
    conditionCanvasHelp:
      "Use the + control on either branch in the canvas to extend it.",
    addNodeTitle: "Add node",
    fitGraph: "Fit graph",
    valueCards: "Value cards",
    operatorCards: "Operator cards",
    numberCard: "# Number",
    numberPadTitle: "Number",
    deleteDigit: "Delete digit",
    done: "Done",
    cancel: "Cancel",
    removeBranchTitle: "Remove this entire branch?",
    removeBranchBody: (title: string, count: number) =>
      `This will remove ${title} and all ${count} connected nodes beneath it.`,
    removeBranchConfirm: "Remove node and branches",
    events: {
      demandAppeared: (name: string) => `${name} entered the market`,
      demandExpired: (name: string) => `${name} left the market`,
      requestFiled: (name: string) => `${name} requested a contract`,
      loanSigned: (name: string, amount: number) =>
        `Signed ${name} · −$${amount.toLocaleString()}`,
      loanRepaid: (name: string, amount: number) =>
        `${name} repaid · +$${amount.toLocaleString()}`,
      loanDefaulted: (name: string, amount: number) =>
        `${name} defaulted on $${amount.toLocaleString()}`,
    },
    specialEvents: {
      tutorialTag: "SPECIAL EVENT · TUTORIAL",
      firstYieldTitle: "A request is waiting",
      firstYieldBody: (name: string) =>
        `${name} needs funding. Follow the request from the map and turn it into your first market offer.`,
      firstYieldInspect:
        "Tap the highlighted demand node to inspect what this borrower needs.",
      firstYieldBuild:
        "On the demand page, choose “Draft a matching contract” to open the builder.",
      firstYieldPost:
        "In the builder, connect a transfer to the borrower, a wait, and a transfer back to you. Then post it to the market.",
      timePaused: "Time is paused until you close this event.",
      closeEvent: "Close event and continue",
    },
    tutorial: {
      label: (step: number, total: number) => `GUIDED RUN · ${step}/${total}`,
      inspectRequest: "Choose the highlighted request.",
      openBuilder: "Turn this request into a contract.",
      buildContract:
        "Add a transfer out, a wait, and a transfer back. The builder will confirm when it is ready.",
      postContract: "Your contract is ready. Post it to the market.",
      awaitRequest:
        "A matching request is being routed into the highlighted contract.",
      approveRequest:
        "The request is waiting. Open the contract and approve it.",
      collectRepayment:
        "Start time and watch the contract collect its repayment.",
      rewardEyebrow: "FIRST AUTOMATION COMPLETE",
      rewardTitle: "Your first yield is working.",
      rewardBody: (cash: number) =>
        `You now have $${cash.toLocaleString()} in cash and a proven contract loop.`,
      rewardName: "Founder's Contract Stamp",
      rewardDescription:
        "Permanent proof that you built a working financial machine.",
      rewardAction: "Unlock Stage 02",
    },
  },
  gameApp: {
    stageSelection: "Stage selection",
    backToMainMenu: "Back to main menu",
    campaignStages: "Campaign stages",
    completePriorStage: "Complete prior stage",
    locked: "Locked",
    playAgain: "Play again",
    language: "Language",
  },
};

export type Messages = typeof en;
