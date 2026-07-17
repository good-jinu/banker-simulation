/**
 * English UI message catalog.  This file defines the catalog shape: ko.ts is
 * typed against `Messages`, so adding or removing a key here surfaces as a
 * compile error until every locale is updated.  Parameterized strings are
 * functions so word order stays free per locale.  Stage and customer copy is
 * not here — it lives as LocalText data in campaign-stages.ts.
 */
export const en = {
  common: {
    days: "days",
  },
  header: {
    back: "Back",
    stage: "Stage",
    contractBuilder: "Contract Builder",
    mine: "My Book",
    tutorial: "Tutorial",
    stageSections: "Stage sections",
    contractsWord: "contracts",
  },
  balance: {
    assetValues: "Asset values",
    cash: "Cash",
    nonCash: "Non-cash",
    totalAssets: "Total assets",
  },
  timebar: {
    gameCalendar: "Game calendar",
    dayN: (day: number) => `Day ${day}`,
    resume: "Resume time",
    pause: "Pause time",
    skip: "Skip to next event",
  },
  market: {
    openMarket: "Open Market",
    chooseDemand: "Choose a demand to analyze",
    contractActive: "Contract active",
    needs: "Needs",
  },
  customer: {
    alwaysVisible: "Always visible",
    customerNeed: "Customer need",
    neededNow: "Needed now",
    returnLabel: "Return",
    termsLabel: "Terms",
    buildContract: "Build contract",
  },
  builder: {
    snapped: (title: string) => `${title} snapped into the contract.`,
    needsBlocks: (needed: number, current: number) =>
      `This demand needs ${needed} contract blocks. You currently have ${current}.`,
    blockShouldBe: (position: number, title: string | null) =>
      `Block ${position} should be ${title ?? "different"}. Reorder the stack.`,
    termsMismatch: (title: string) =>
      `${title} has terms that do not match this demand.`,
    variableNeedsName: "The variable block needs a name.",
    nodeIssue: (title: string, issue: string) => `${title}: ${issue}`,
    demandsAtLeast: (name: string, amount: number, day: number) =>
      `${name} demands at least $${amount.toLocaleString()} back at day ${day}.`,
    noLessThanPrincipal: (name: string, principal: number) =>
      `${name} will not accept less than the $${principal} principal on an early withdrawal.`,
    alreadySold: "This demand already has one of your contracts.",
    accepted: (name: string, date: string) =>
      `${name} accepted on ${date}. The contract now plays out as the calendar advances.`,
    contractGoal: "Contract goal",
    demandVariables: "Demand variables",
    blockStack: "Contract block stack",
    contractBoundary: "Contract boundary",
    clause: "Clause",
    moveUp: "Move block up",
    moveDown: "Move block down",
    emptyStack:
      "Add a clause from the tray. Blocks connect automatically when they snap into the stack.",
    clauseTray: "Clause tray",
    tapToSnap: "Tap a block to snap it into the contract",
    add: "Add",
    offerContract: "Offer contract",
  },
  mine: {
    subtitle: "Balance sheet · contracts · people",
    totalAssetValue: "Total asset value",
    nonCashValue: "Non-cash value",
    liabilities: "Contract liabilities",
    agreements: "Agreements",
    myContracts: "My contracts",
    nonCashAsset: "Non-cash asset",
    principal: "Principal",
    promisedReturn: "Promised return",
    status: "Status",
    settled: "Settled",
    active: "Active",
    allResolved: "Every obligation has resolved.",
    nextEvent: (date: string, event: string) =>
      `Next event on ${date}: ${event}`,
    noContracts: "No contracts yet",
    noContractsHint:
      "Build a contract in the market. It will appear here as an asset with its stakeholders.",
    openMarketButton: "Open market",
    network: "Network",
    stakeholders: "Stakeholders",
    bankerRole: "Banker · contract owner",
    stakeholderRole: "Contract stakeholder",
    buildMore: (count: number) => `Build ${count} more contract`,
    completeStage: (stageNumber: string) => `Complete Stage ${stageNumber}`,
  },
  dialogs: {
    gotIt: "Got it",
    liquidityFailure: "Liquidity failure",
    liquidityDetail: (name: string, due: number, available: number) =>
      `${name} asked for $${due.toLocaleString()}, but only $${available.toLocaleString()} was liquid.`,
    restartStage: "Restart stage",
    contractSettled: "Contract settled",
    objectiveReached: "Stage objective reached",
    viewMine: "View My Book",
    offerAccepted: "Offer accepted",
    offerRejected: "Offer rejected",
    reviseContract: "Revise contract",
  },
  inspector: {
    deleteNode: "Delete node",
    sender: "Sender",
    transferRecipient: "Recipient",
    amount: "Amount",
    waitDays: "Wait days",
    assetHeld: "Asset held",
    ifSettled: "If settled",
    collectRelease: "Collect + release asset",
    collectKeep: "Collect + keep asset",
    ifDefaulted: "If defaulted",
    recoverFromAsset: "Recover from asset",
    waiveObligation: "Waive obligation",
    repeatCount: "Repeat count",
    everyDays: "Every days",
    provider: "Provider",
    receive: "Receive",
    intakeTermDays: "Term days",
    returnAmount: "Return amount",
    settleRecipient: "Recipient",
    afterDays: "After days",
    loopHelp:
      "Runs the blocks below once per day. A firing case pays out and ends the contract; otherwise the loop waits one day.",
    variableName: "Name",
    formula: "Formula (principal, day)",
    trigger: "Trigger",
    termEnded: "Deposit term ended",
    withdrawRequested: "Giver wants money back",
    caseTermDays: "Term days",
    payTo: "Pay to",
    amountFormula: "Amount formula",
    endHelp: "All obligations must resolve before this node.",
    currentParty: "Current party",
  },
  nodeLabels: {
    startActive: "Terms become active",
    endResolved: "All obligations resolved",
    waitAdvance: (days: number) => `Advance ${days} days`,
    chooseAsset: "Choose asset",
    conditionOutcomes: "Settled / defaulted outcomes",
    repeatEvery: (count: number, intervalDays: number) =>
      `${count}× · every ${intervalDays}d`,
    receiveNow: (amount: number) => `Receive $${amount} now`,
    loopUntilCase: "Every day until a case ends it",
    caseTermPay: (day: number, formula: string) => `Day ${day}: pay ${formula}`,
    caseRequestPay: (formula: string) => `On request: pay ${formula}`,
    settleAmount: (amount: number) => `Settle $${amount}`,
    twoOutcomes: "Two outcomes",
    dailyLoop: "daily loop",
    onDemand: "on demand",
  },
  nodes: {
    start: {
      title: "Start",
      explanation: "The immutable entry point of every contract.",
    },
    transfer: {
      title: "Transfer Money",
      explanation: "Move a chosen amount from one party to another.",
    },
    wait: {
      title: "Wait",
      explanation: "Pause the contract flow for a fixed number of days.",
    },
    asset: {
      title: "Secure Asset",
      explanation: "Hold a named asset until the contract outcome is known.",
    },
    condition: {
      title: "Condition",
      explanation: "Choose one action after success and another after failure.",
    },
    decision: {
      title: "Decision",
      explanation:
        "Automatically accept or reject a requester the moment they apply. Draft leaves them for your manual review.",
    },
    repeat: {
      title: "Repeat",
      explanation:
        "Repeat the next exchange a fixed number of times on a schedule.",
    },
    intake: {
      title: "Intake",
      explanation:
        "Receive money now while recording how much must be returned later.",
    },
    settle: {
      title: "Settle",
      explanation:
        "Close a recorded obligation after its funding has returned.",
    },
    loop: {
      title: "Daily Loop",
      explanation:
        "Re-evaluate the blocks below every day until a case ends the contract.",
    },
    variable: {
      title: "Set Variable",
      explanation:
        "Define a named amount from principal and the days elapsed, e.g. principal * (1 + day * 0.0005).",
    },
    case: {
      title: "Exit Case",
      explanation:
        "When its trigger is true, pay the giver and end the contract. If no case fires, the loop waits one day.",
    },
    end: {
      title: "End",
      explanation: "Finish the contract after every obligation has resolved.",
    },
  },
  flowKinds: {
    fund: "Funding sent",
    intake: "Funding received",
    installment: "Installment received",
    repayment: "Repayment received",
    settle: "Obligation settled",
    resolve: "Contract resolved",
    maturity: "Deposit matured",
    withdrawal: "Early withdrawal",
  },
  marketSim: {
    eyebrow: "Banker Simulation",
    title: "Open Market",
    mapHint:
      "Tap a person to inspect their need, then post a contract. Matching people apply automatically; tap your contract to review and decide on requests.",
    postContract: "Post a new contract",
    deployed: "Deployed",
    demandTitle: "Borrower Demand",
    contractTitle: "Posted Contract",
    builderTitleNew: "New Market Contract",
    builderTitleEdit: "Edit Contract",
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
    insertVariable: "Insert:",
    conditionIf: "If",
    conditionThen: "Then",
    conditionElse: "Else",
    conditionVariableLabel: "Variable name",
    conditionNeedsVariable:
      "The condition block needs a variable name (letters and _ only).",
    variableReserved: (name: string) => `"${name}" is already defined.`,
    outcomeDraft: "Draft (review myself)",
    decisionHelp:
      "Runs the moment someone applies. Accept signs the loan instantly, Reject turns them away, Draft leaves them in the request list. Without a Decision block every requester becomes a draft.",
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
  },
  /** Locale renderings of content data values (borrower facts). */
  factValues: {} as Record<string, string>,
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
