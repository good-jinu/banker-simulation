import type { Messages } from "./en.ts";

/** Korean UI message catalog. Typed against the English shape. */
export const ko: Messages = {
  balance: {
    assetValues: "자산 현황",
    cash: "현금",
    totalAssets: "총자산",
    openAssetValues: "자산 현황 보기",
    closeAssetValues: "자산 현황 닫기",
    loanTo: (name) => `${name} 대출`,
    dueDay: (day) => `상환 예정 ${day}일차`,
    loanValueBasis: "진행 중인 대출은 미상환 원금으로 평가됩니다.",
  },
  timebar: {
    gameCalendar: "게임 달력",
    dayN: (day) => `${day}일차`,
    objective: (focus, complete, target) =>
      `목표 · ${focus} · ${complete}/${target}건 상환`,
    noRecentEvents: "최근 이벤트 없음",
    displayBoard: "정보 게시판",
    currentObjective: "현재 목표",
    openDisplayBoard: "정보 게시판 열기",
    closeDisplayBoard: "정보 게시판 닫기",
    resume: "시간 재개",
    pause: "시간 정지",
    skip: "다음 이벤트로 건너뛰기",
  },
  customer: {
    neededNow: "필요 금액",
    returnLabel: "상환",
    termsLabel: "조건",
  },
  builder: {
    clause: "조항",
    nodeIssue: (title, issue) => `${title}: ${issue}`,
    dismissTip: "도움말 닫기",
  },
  mine: {
    completeStage: (stageNumber) => `스테이지 ${stageNumber} 완료`,
  },
  inspector: {
    deleteNode: "노드 삭제",
    sender: "보내는 쪽",
    transferRecipient: "받는 쪽",
    amount: "금액",
    waitDays: "대기 일수",
  },
  nodeLabels: {
    startActive: "조건 발효",
    endResolved: "모든 의무 이행 완료",
  },
  nodes: {
    start: { title: "시작" },
    transfer: { title: "송금" },
    wait: { title: "대기" },
    condition: { title: "조건" },
    decision: { title: "처리 게이트" },
    variable: { title: "변수 설정" },
    end: { title: "종료" },
  },
  marketSim: {
    postContract: "새 컨트랙트 게시",
    genderFemale: "여성",
    genderMale: "남성",
    ageYears: (age) => `${age}세`,
    unemployed: "무직",
    factGender: "성별",
    factAge: "나이",
    factOccupation: "직업",
    factIncome: "소득",
    perMonth: (amount) => `월 $${amount.toLocaleString()}`,
    demandBadge: "요청 내용",
    demandNeedTitle: "수요",
    needsNow: (amount) => `현금 $${amount.toLocaleString()}`,
    payableAfter: (days) =>
      `${Math.round(days / 30)}개월(${days}일) 후 상환 가능`,
    maxRepayment: (amount) =>
      `총 $${amount.toLocaleString()}까지 상환 의사 있음`,
    draftContract: "맞춤 컨트랙트 작성",
    lends: "빌려주는 금액",
    termLabel: "기간",
    asksBack: "돌려받는 금액",
    daysCount: (days) => `${days}일`,
    requestsTitle: "요청",
    pendingCount: (count) => `대기 ${count}건`,
    requestQueueCount: (pending, review) =>
      review > 0
        ? `대기 ${pending}건 · 검토 필요 ${review}건`
        : `대기 ${pending}건`,
    noRequests:
      "아직 요청이 없습니다. 조건이 맞는 사람들이 시간이 지나면 찾아옵니다.",
    accept: "수락",
    reject: "거절",
    editContract: "컨트랙트 수정",
    borrower: "대출자",
    builderSummary: "제안 요약",
    previewLine: (principal, days, repayment) =>
      `샘플 $100 · 90일 요청자 → $${principal.toLocaleString()} 대출, ${days}일 후 $${repayment.toLocaleString()} 회수`,
    brokenPreview:
      "이 수식으로는 유효한 조건이 만들어지지 않습니다. 금액, 대기, 상환 수식을 확인하세요.",
    conditionIf: "만약",
    conditionThen: "그러면",
    conditionElse: "아니면",
    conditionMerge: "합류",
    conditionVariableLabel: "변수 이름",
    conditionNeedsVariable:
      "조건 블록에는 변수 이름이 필요합니다(영문과 _만 사용).",
    variableReserved: (name) => `"${name}"은(는) 이미 정의된 이름입니다.`,
    outcomeDraft: "보류(직접 검토)",
    requestEvaluationError:
      "검토 필요 — 이 대출자에 대해 컨트랙트를 안전하게 계산할 수 없습니다.",
    requestInsufficientCash: (amount) =>
      `자동화 보류 — 이 대출을 실행하려면 현금 $${amount.toLocaleString()}이 필요합니다.`,
    requestTerms: (principal, repayment, days) =>
      `$${principal.toLocaleString()} → $${repayment.toLocaleString()} · ${days}일`,
    builderReady: "이 컨트랙트를 오픈 마켓에 게시할 수 있습니다.",
    needOutgoing: "대출자에게 현금을 보내는 전송을 추가하세요.",
    needWait: "대출자가 갚을 시간을 주는 대기를 추가하세요.",
    needIncoming: "나에게 현금이 돌아오는 전송을 추가하세요.",
    postToMarket: "마켓에 게시",
    saveChanges: "변경 사항 저장",
    posted: "컨트랙트가 게시되었습니다. 지도에서 요청을 기다리세요.",
    updated:
      "컨트랙트가 수정되었습니다. 대기 중이던 요청자는 마켓으로 돌아갑니다.",
    withdrawn: "컨트랙트를 마켓에서 내렸습니다.",
    withdrawContract: "이 컨트랙트 내리기",
    insufficientCash: (amount) =>
      `이 대출을 실행하려면 현금 $${amount.toLocaleString()}이 필요합니다.`,
    requestGone: "이미 철회된 요청입니다.",
    backToMap: "지도로 돌아가기",
    slotEmpty: "모든 값 슬롯을 채워 주세요.",
    valueUnavailable: (name) =>
      `"${name}"은(는) 이 경로에서 사용할 수 없습니다.`,
    conditionCanvasHelp:
      "캔버스에서 각 분기의 + 버튼을 눌러 경로를 확장하세요.",
    addNodeTitle: "노드 추가",
    fitGraph: "그래프 맞춤",
    valueCards: "값 카드",
    operatorCards: "연산 카드",
    numberCard: "# 숫자",
    numberPadTitle: "숫자",
    deleteDigit: "한 자리 지우기",
    done: "완료",
    cancel: "취소",
    removeBranchTitle: "이 분기 전체를 삭제할까요?",
    removeBranchBody: (title, count) =>
      `${title} 노드와 그 아래 연결된 ${count}개 노드가 함께 삭제됩니다.`,
    removeBranchConfirm: "노드와 분기 삭제",
    events: {
      demandAppeared: (name) => `${name} 마켓 진입`,
      demandExpired: (name) => `${name} 마켓 떠남`,
      requestFiled: (name) => `${name} 컨트랙트 요청`,
      loanSigned: (name, amount) =>
        `${name} 계약 체결 · -$${amount.toLocaleString()}`,
      loanRepaid: (name, amount) =>
        `${name} 상환 · +$${amount.toLocaleString()}`,
      loanDefaulted: (name, amount) =>
        `${name} 채무 불이행 · $${amount.toLocaleString()}`,
    },
    specialEvents: {
      tutorialTag: "특별 이벤트 · 튜토리얼",
      firstYieldTitle: "요청이 도착했습니다",
      firstYieldBody: (name) =>
        `${name}이(가) 자금을 요청했습니다. 지도에서 요청을 확인하고 첫 번째 마켓 제안으로 만들어 보세요.`,
      firstYieldInspect:
        "강조된 수요 노드를 눌러 이 대출자가 필요한 내용을 확인하세요.",
      firstYieldBuild:
        "수요 화면에서 ‘맞춤 컨트랙트 작성’을 눌러 빌더를 여세요.",
      firstYieldPost:
        "빌더에서 대출자에게 보내는 송금, 대기, 나에게 돌아오는 송금을 연결한 뒤 마켓에 게시하세요.",
      timePaused: "이 이벤트를 닫을 때까지 시간이 멈춥니다.",
      closeEvent: "이벤트 닫고 계속하기",
    },
    tutorial: {
      label: (step, total) => `가이드 진행 · ${step}/${total}`,
      inspectRequest: "강조된 요청을 선택하세요.",
      openBuilder: "이 요청을 컨트랙트로 만들어 보세요.",
      buildContract:
        "송금, 대기, 회수 송금을 추가하세요. 준비되면 빌더가 알려드립니다.",
      postContract: "컨트랙트가 준비되었습니다. 마켓에 게시하세요.",
      awaitRequest:
        "조건이 맞는 요청이 강조된 컨트랙트로 자동 연결되고 있습니다.",
      approveRequest: "요청이 도착했습니다. 컨트랙트를 열어 승인하세요.",
      collectRepayment:
        "시간을 시작하고 컨트랙트가 상환을 회수하는 모습을 확인하세요.",
      rewardEyebrow: "첫 자동화 완료",
      rewardTitle: "첫 수익 계약이 작동했습니다.",
      rewardBody: (cash) =>
        `현재 현금은 $${cash.toLocaleString()}이며, 작동하는 컨트랙트 흐름을 만들었습니다.`,
      rewardName: "창립자 컨트랙트 스탬프",
      rewardDescription:
        "작동하는 금융 시스템을 만들었다는 영구적인 증표입니다.",
      rewardAction: "스테이지 02 해금",
    },
  },
  gameApp: {
    stageSelection: "스테이지 선택",
    backToMainMenu: "메인 메뉴로 돌아가기",
    campaignStages: "캠페인 스테이지",
    completePriorStage: "이전 스테이지를 완료하세요",
    locked: "잠김",
    playAgain: "다시 플레이",
    language: "언어",
  },
};
