# Banker Simulation — Required Media Assets

## 제품 비주얼 방향

### 선택된 기준 시안

- 방향명: **Aurora Financial Network**
- 기준 이미지: `packages/web/public/assets/reference/aurora-network-ui-concept.png`
- 기본 톤: 밝은 펄 화이트 보드, 반투명 글래스 패널, 민트·시안·바이올렛 굴절광
- 오브젝트: 선명한 2.5D 자산 토큰과 미니어처형 이해관계자 노드
- 상호작용 강조: 선택된 노드에는 시안 글로우, 자산 이동에는 클래스 색상의 빛나는 경로 사용
- 실제 구현에서는 기준 시안보다 패널 투명도를 낮추고 텍스트·아이콘 대비를 높인다.
- 모든 후속 생성 에셋은 이 이미지를 스타일 참조로 사용한다.

### 핵심 콘셉트

**Modern Financial Network Board**

은행 사무용 대시보드나 특정 마을을 재현하는 UI가 아니라, 다양한 경제 주체와 자산이 하나의 살아 있는 네트워크 안에서 움직이는 모습을 표현한다.

- 중앙 화면은 이해관계자 노드와 자산 흐름이 보이는 인터랙티브 보드다.
- 자산은 텍스트 목록이 아니라 형태가 다른 토큰으로 표현한다.
- 계약은 당사자 사이에 연결된 시간축 있는 링크로 표현한다.
- 현금 이동, 담보 잠금, 청구권 양도, 생산, 부도는 보드 위 애니메이션으로 보여준다.
- 세부 수치는 선택한 대상의 컨텍스트 패널에서만 노출한다.
- 펄 화이트 라이트 테마와 제한적인 다크 텍스트·패널을 조합해 깨끗하면서도 게임다운 대비를 만든다.

### 피해야 할 방향

- 농장과 상점에만 맞는 고정 마을 배경
- 회계·관리 SaaS처럼 보이는 표와 폼 중심 화면
- 모든 자산을 동일한 사각형 배지로 표시하는 방식
- 컬러만 바꾼 동일 아이콘
- 이미지 안에 이름이나 설명 문구를 직접 삽입하는 방식
- 화면 대부분을 차지하는 정적인 히어로 일러스트

## 확장 가능한 시각 언어

### 자산 클래스 형태 규칙

자산은 색뿐 아니라 외곽 형태로도 구별한다. 신규 자산은 아래 클래스 규칙을 재사용한다.

| 클래스 | 기본 형태 | 대표 색상 | 예시 |
|---|---|---|---|
| 통화 | 원형 코인 | 골드/민트 | 현금, 예금, 외화 |
| 원자재 | 육각 토큰 | 오렌지/앰버 | 곡물, 석유, 금속 |
| 부동산 | 정사각 타일 | 테라코타/그린 | 농지, 건물, 창고 |
| 지분 | 다이아몬드 | 바이올렛 | 주식, 조합 지분 |
| 채권 | 절취선 있는 티켓 | 블루 | 회사채, 국채, 약속어음 |
| 청구권 | 리본/연결 고리 | 시안 | 상환 청구권, 매출채권 |
| 보험 | 방패 | 핑크/인디고 | 작물 보험, 신용 보증 |
| 파생 계약 | 겹친 삼각형 | 마젠타 | 옵션, 선물, 조건부 지급 |
| 생산 자원 | 둥근 육면체 | 라임/브라운 | 종자, 공구, 에너지 |
| 평판·정보 | 빛나는 데이터 구체 | 화이트/스카이 | 신용도, 감사, 공개 정보 |

### 이해관계자 형태 규칙

이해관계자는 `아바타 + 역할 심볼 + 색상 링`으로 표현한다. 업종이 늘어나도 동일한 노드 구조를 유지한다.

| 유형 | 노드 심볼 | 예시 |
|---|---|---|
| 개인/가계 | 인물 실루엣 | 농부, 상인, 예금자 |
| 소상공인 | 점포 심볼 | 농장, 상점, 공방 |
| 기업 | 타워 심볼 | 생산기업, 물류기업 |
| 금융기관 | 아치 심볼 | 협동조합, 은행, 펀드 |
| 정부/공공기관 | 기둥 심볼 | 중앙정부, 지방정부, 규제기관 |
| 투자자 | 상승 그래프 심볼 | 개인 투자자, 기관 투자자 |
| 감사/평가기관 | 눈/스캔 심볼 | 감사인, 신용평가사 |
| 자동화 주체 | 링이 있는 코어 | 시장조성자, 규칙 기반 에이전트 |

## P0 — 첫 번째 모던 UI에 필요한 에셋

### 1. 네트워크 보드 배경

| 파일 | 용도 | 권장 사양 |
|---|---|---|
| `board/network-grid-light.webp` | 기본 금융 네트워크 보드 | 2560×1440, 불투명 |
| `board/network-grid-dark.webp` | 이벤트/집중 모드 보드 | 2560×1440, 불투명 |
| `board/ambient-gradient.webp` | 화면 깊이감과 상태색 변화 | 2560×1440, 투명 |
| `board/data-particles.webp` | 느린 패럴랙스 데이터 입자 | 2560×1440, 투명 |
| `board/risk-vignette.webp` | 시장 충격/부도 위험 오버레이 | 2560×1440, 투명 |
| `board/success-glow.webp` | 성장/상환 성공 오버레이 | 2560×1440, 투명 |

배경에는 특정 업종이나 지역을 고정적으로 그리지 않는다. 모든 이해관계자 노드가 자연스럽게 배치될 수 있는 추상적인 공간이어야 한다.

### 2. 이해관계자 노드 프레임

아바타를 교체해도 노드 크기와 인터랙션이 유지되도록 프레임을 분리한다.

| 파일 | 용도 | 권장 사양 |
|---|---|---|
| `stakeholders/node-person.webp` | 개인/가계 노드 프레임 | 384×384, 투명 |
| `stakeholders/node-business.webp` | 소상공인 노드 프레임 | 384×384, 투명 |
| `stakeholders/node-corporation.webp` | 기업 노드 프레임 | 384×384, 투명 |
| `stakeholders/node-financial.webp` | 금융기관 노드 프레임 | 384×384, 투명 |
| `stakeholders/node-public.webp` | 정부/공공기관 노드 프레임 | 384×384, 투명 |
| `stakeholders/node-investor.webp` | 투자자 노드 프레임 | 384×384, 투명 |
| `stakeholders/node-auditor.webp` | 감사/평가기관 노드 프레임 | 384×384, 투명 |
| `stakeholders/node-agent.webp` | 자동화 주체 노드 프레임 | 384×384, 투명 |
| `stakeholders/ring-player.webp` | 플레이어 소유 강조 링 | 448×448, 투명 |
| `stakeholders/ring-selected.webp` | 현재 선택 강조 링 | 448×448, 투명 |
| `stakeholders/ring-warning.webp` | 위험/부도 경고 링 | 448×448, 투명 |
| `stakeholders/ring-active.webp` | 현재 행동 중인 주체 링 | 448×448, 투명 |

### 3. 초기 이해관계자 아바타

각 아바타는 512×512 투명 WebP로 제작한다. 포토리얼보다 선명한 2.5D 또는 세미 플랫 스타일을 권장한다.

| 파일 접두사 | 주체 | 필요한 상태 |
|---|---|---|
| `avatars/mina-*` | 농업 사업자 미나 | neutral, request, confident, worried, defaulted |
| `avatars/jun-*` | 유통 사업자 준 | neutral, evaluating, accepted, rejected |
| `avatars/player-coop-*` | 플레이어 협동조합 | neutral, active, success, warning |
| `avatars/auditor-*` | 독립 감사인 | neutral, scanning, verified, caution |
| `avatars/fund-manager-*` | 기관 투자자 | neutral, interested, declined |
| `avatars/regulator-*` | 규제기관 | neutral, observing, intervention |

### 4. 자산 클래스 아이콘과 토큰

모든 아이콘은 SVG 원본과 128×128 WebP를 함께 제공한다. 이동 애니메이션용 토큰은 192×192 투명 WebP로 별도 제공한다.

#### 기반 자산 클래스 아이콘

| 파일 | 의미 |
|---|---|
| `assets/class-currency.svg` | 통화 |
| `assets/class-commodity.svg` | 원자재 |
| `assets/class-property.svg` | 부동산 |
| `assets/class-equity.svg` | 지분 |
| `assets/class-bond.svg` | 채권 |
| `assets/class-claim.svg` | 청구권 |
| `assets/class-insurance.svg` | 보험 |
| `assets/class-derivative.svg` | 파생 계약 |
| `assets/class-resource.svg` | 생산 자원 |
| `assets/class-information.svg` | 평판/정보 |

#### 초기 개별 자산 아이콘

| 파일 | 의미 |
|---|---|
| `assets/coin.svg` | 기본 통화 |
| `assets/deposit.svg` | 예금 |
| `assets/seed.svg` | 종자 |
| `assets/grain.svg` | 곡물 |
| `assets/farm-plot.svg` | 농지 |
| `assets/building.svg` | 건물 |
| `assets/equity-share.svg` | 지분 |
| `assets/fixed-term-bond.svg` | 고정 만기 채권 |
| `assets/repayment-claim.svg` | 상환 청구권 |
| `assets/collateral-lock.svg` | 담보 잠금 |
| `assets/audit-report.svg` | 감사 보고서 |
| `assets/reputation-score.svg` | 상환 평판 |

#### 토큰 템플릿

| 파일 | 용도 |
|---|---|
| `tokens/token-circle.webp` | 통화 토큰 베이스 |
| `tokens/token-hex.webp` | 원자재 토큰 베이스 |
| `tokens/token-tile.webp` | 부동산 토큰 베이스 |
| `tokens/token-diamond.webp` | 지분 토큰 베이스 |
| `tokens/token-ticket.webp` | 채권 토큰 베이스 |
| `tokens/token-ribbon.webp` | 청구권 토큰 베이스 |
| `tokens/token-shield.webp` | 보험 토큰 베이스 |
| `tokens/token-derivative.webp` | 파생 계약 토큰 베이스 |

토큰 베이스와 개별 아이콘을 분리해 신규 자산을 코드에서 조합할 수 있어야 한다.

### 5. 계약과 연결선

| 파일 | 용도 | 권장 사양 |
|---|---|---|
| `contracts/line-transfer.svg` | 즉시 자산 이전 연결선 | 반복 가능한 SVG 패턴 |
| `contracts/line-obligation.svg` | 미래 지급 의무 연결선 | 반복 가능한 SVG 패턴 |
| `contracts/line-claim.svg` | 청구권 소유 관계 | 반복 가능한 SVG 패턴 |
| `contracts/line-collateral.svg` | 담보 연결선 | 반복 가능한 SVG 패턴 |
| `contracts/line-information.svg` | 감사/정보 관계 | 반복 가능한 SVG 패턴 |
| `contracts/flow-arrow.svg` | 자산 이동 방향 화살표 | SVG |
| `contracts/due-marker.svg` | 만기 지점 마커 | SVG |
| `contracts/default-break.svg` | 끊어진 계약 링크 | SVG |
| `contracts/contract-core.webp` | 계약 노드 중심 오브젝트 | 320×320, 투명 |
| `contracts/contract-approved.webp` | 활성 계약 상태 | 320×320, 투명 |
| `contracts/contract-settled.webp` | 완료 계약 상태 | 320×320, 투명 |
| `contracts/contract-defaulted.webp` | 부도 계약 상태 | 320×320, 투명 |

### 6. 모던 액션 컴포저 에셋

상품 설계는 입력 폼이 아니라 화면 하단의 모듈 조립 보드로 표현한다.

| 파일 | 용도 | 권장 사양 |
|---|---|---|
| `composer/tray-surface.webp` | 하단 계약 조립 트레이 | 1920×420, 투명 |
| `composer/module-funding.webp` | 현재 지급 모듈 프레임 | 420×260, 투명 |
| `composer/module-time.webp` | 기간 모듈 프레임 | 420×260, 투명 |
| `composer/module-return.webp` | 미래 상환 모듈 프레임 | 420×260, 투명 |
| `composer/module-condition.webp` | 평판/조건 모듈 프레임 | 420×260, 투명 |
| `composer/module-collateral.webp` | 담보 모듈 프레임 | 420×260, 투명 |
| `composer/module-fee.webp` | 수수료 모듈 프레임 | 420×260, 투명 |
| `composer/module-insurance.webp` | 보험 모듈 프레임 | 420×260, 투명 |
| `composer/slot-empty.webp` | 비어 있는 모듈 슬롯 | 420×260, 투명 |
| `composer/stamp-publish.webp` | 상품 발행 액션 | 512×512, 투명 |
| `composer/risk-safe.webp` | 낮은 위험 표시 | 256×256, 투명 |
| `composer/risk-balanced.webp` | 중간 위험 표시 | 256×256, 투명 |
| `composer/risk-high.webp` | 높은 위험 표시 | 256×256, 투명 |

### 7. HUD와 상태 심볼

| 파일 | 의미 |
|---|---|
| `hud/net-worth.svg` | 순자산 |
| `hud/liquidity.svg` | 유동성 |
| `hud/reputation.svg` | 플레이어 평판 |
| `hud/portfolio-risk.svg` | 포트폴리오 위험 |
| `hud/calendar.svg` | 현재 시간/턴 |
| `hud/market.svg` | 시장 상태 |
| `hud/filter.svg` | 자산·주체 필터 |
| `hud/layers.svg` | 네트워크 레이어 |
| `hud/ledger.svg` | 상세 원장 |
| `hud/pause.svg` | 시간 정지 |
| `hud/play.svg` | 시간 진행 |
| `hud/fast-forward.svg` | 다중 틱 진행 |
| `hud/help.svg` | 도움말 |
| `hud/settings.svg` | 설정 |

### 8. 상태 배지

색상뿐 아니라 외곽선과 내부 심볼이 달라야 한다.

- `badges/new.svg`
- `badges/active.svg`
- `badges/due-soon.svg`
- `badges/settled.svg`
- `badges/defaulted.svg`
- `badges/locked.svg`
- `badges/liquidated.svg`
- `badges/audited.svg`
- `badges/unaudited.svg`
- `badges/high-demand.svg`
- `badges/low-demand.svg`
- `badges/safe.svg`
- `badges/balanced.svg`
- `badges/speculative.svg`

### 9. 핵심 이벤트 컷인

고정된 농장 일러스트보다, 좌우 주체 아바타와 중앙 자산 토큰을 교체할 수 있는 모듈형 이벤트 프레임을 사용한다.

| 파일 | 용도 | 권장 사양 |
|---|---|---|
| `events/frame-neutral.webp` | 일반 거래 이벤트 | 1600×900, 투명 |
| `events/frame-success.webp` | 상환/수익 성공 | 1600×900, 투명 |
| `events/frame-risk.webp` | 시장 충격/위험 | 1600×900, 투명 |
| `events/frame-default.webp` | 부도/담보 청산 | 1600×900, 투명 |
| `events/frame-regulation.webp` | 감사/규제 이벤트 | 1600×900, 투명 |
| `events/burst-published.webp` | 상품 발행 효과 | 900×500, 투명 |
| `events/burst-funded.webp` | 자금 조달 효과 | 900×500, 투명 |
| `events/burst-settled.webp` | 상환 완료 효과 | 900×500, 투명 |
| `events/burst-defaulted.webp` | 부도 효과 | 900×500, 투명 |
| `events/burst-liquidated.webp` | 담보 청산 효과 | 900×500, 투명 |
| `events/burst-claim-transfer.webp` | 청구권 이전 효과 | 900×500, 투명 |

## 필수 애니메이션

가능하면 투명 WebM과 PNG 스프라이트시트를 함께 제공한다. 24fps, 0.6~2초 길이를 권장한다.

| 파일 | 동작 | 대체 형식 |
|---|---|---|
| `animation/token-transfer.webm` | 자산 토큰이 링크를 따라 이동 | `token-transfer-sheet.png` |
| `animation/node-pulse.webm` | 행동 가능한 주체 노드 강조 | `node-pulse-sheet.png` |
| `animation/contract-connect.webm` | 두 주체 사이 계약 링크 생성 | `contract-connect-sheet.png` |
| `animation/contract-settle.webm` | 계약 완료와 링크 정리 | `contract-settle-sheet.png` |
| `animation/contract-break.webm` | 부도 시 연결선 파열 | `contract-break-sheet.png` |
| `animation/collateral-lock.webm` | 자산 토큰에 담보 잠금 | `collateral-lock-sheet.png` |
| `animation/collateral-transfer.webm` | 담보 소유권 이동 | `collateral-transfer-sheet.png` |
| `animation/claim-transfer.webm` | 청구권 리본이 새 주체로 이동 | `claim-transfer-sheet.png` |
| `animation/reputation-rise.webm` | 평판 상승 | `reputation-rise-sheet.png` |
| `animation/reputation-fall.webm` | 평판 하락 | `reputation-fall-sheet.png` |
| `animation/time-wave.webm` | 보드 전체에 시간 진행 파동 | `time-wave-sheet.png` |
| `animation/market-shock.webm` | 네트워크 위험 전파 | `market-shock-sheet.png` |

## P1 — 자산과 이해관계자 확장 에셋

### 추가 자산

- `assets/usd.svg`, `assets/eur.svg`, `assets/local-currency.svg`
- `assets/gold.svg`, `assets/oil.svg`, `assets/steel.svg`, `assets/electricity.svg`
- `assets/residential-property.svg`, `assets/commercial-property.svg`, `assets/warehouse.svg`
- `assets/common-stock.svg`, `assets/preferred-stock.svg`, `assets/fund-share.svg`
- `assets/government-bond.svg`, `assets/corporate-bond.svg`, `assets/municipal-bond.svg`
- `assets/invoice-claim.svg`, `assets/mortgage-claim.svg`, `assets/revenue-share.svg`
- `assets/deposit-insurance.svg`, `assets/crop-insurance.svg`, `assets/credit-guarantee.svg`
- `assets/call-option.svg`, `assets/put-option.svg`, `assets/futures-contract.svg`

### 추가 이해관계자

- 제조기업 대표 아바타 세트
- 에너지 기업 대표 아바타 세트
- 부동산 개발사 대표 아바타 세트
- 가계/예금자 아바타 세트 4종
- 연기금 및 헤지펀드 운용자 아바타 세트
- 중앙은행 및 지방정부 아바타 세트
- 보험사 및 신용보증기관 아바타 세트
- 신용평가사 및 외부 감사인 아바타 세트

### 네트워크 레이어 시각화

- `layers/cash-flow.webp`
- `layers/ownership.webp`
- `layers/obligations.webp`
- `layers/collateral.webp`
- `layers/information.webp`
- `layers/systemic-risk.webp`

각 레이어는 같은 노드 배치를 유지하면서 연결선의 종류만 강조할 수 있어야 한다.

## P2 — 시장 및 세계 확장 에셋

- 지역 경제, 국가 경제, 글로벌 시장용 보드 배경 3종
- 경기 확장, 과열, 침체, 위기 상태 오버레이
- 거래소, 중앙은행, 청산소, 보험시장용 중앙 시스템 노드
- 경쟁 은행 및 핀테크 이해관계자 세트
- 신규 금융 모듈: 풀링, 유동화, 보증, 보험, 옵션, 담보 재사용
- 포트폴리오 컬렉션 카드와 업적 배지
- 시나리오 시작/종료용 모던 에디토리얼 일러스트

## 사운드 에셋

### P0 UI 및 거래 효과음

권장 형식은 OGG이며 WAV 원본도 보관한다. 전통적인 금고 소리보다 짧고 선명한 디지털-물리 혼합 사운드를 사용한다.

| 파일 | 용도 |
|---|---|
| `audio/ui-select.ogg` | 노드/자산 선택 |
| `audio/ui-open.ogg` | 컨텍스트 패널 열기 |
| `audio/ui-close.ogg` | 패널 닫기 |
| `audio/module-place.ogg` | 계약 모듈 배치 |
| `audio/module-remove.ogg` | 계약 모듈 제거 |
| `audio/product-publish.ogg` | 상품 발행 |
| `audio/token-transfer.ogg` | 자산 이전 |
| `audio/contract-connect.ogg` | 계약 활성화 |
| `audio/repayment-success.ogg` | 상환 성공 |
| `audio/default.ogg` | 부도 |
| `audio/collateral-lock.ogg` | 담보 잠금 |
| `audio/collateral-transfer.ogg` | 담보 청산 |
| `audio/claim-transfer.ogg` | 청구권 이전 |
| `audio/reputation-up.ogg` | 평판 상승 |
| `audio/reputation-down.ogg` | 평판 하락 |
| `audio/time-advance.ogg` | 시간 진행 |
| `audio/market-shock.ogg` | 시장 충격 |
| `audio/error-soft.ogg` | 실행 불가능한 선택 |

### P1 BGM과 앰비언스

- `audio/bgm-network-calm.ogg`: 정상 시장 상태, 미니멀 전자음과 가벼운 타악기
- `audio/bgm-network-active.ogg`: 거래가 활발한 상태
- `audio/bgm-network-risk.ogg`: 연체와 시스템 위험 증가 상태
- `audio/ambience-data-flow.ogg`: 매우 낮은 볼륨의 네트워크 환경음
- `audio/stinger-growth.ogg`: 목표 달성/성장
- `audio/stinger-crisis.ogg`: 위기 발생

## 폰트와 타이포그래피 에셋

- `fonts/display-rounded.woff2`: 큰 수치, 이벤트 타이틀, 액션 버튼
- `fonts/body-ui.woff2`: 짧은 레이블과 툴팁
- `fonts/numeric-tabular.woff2`: 자산 수량과 변화량
- 각 폰트의 상업적 사용 및 재배포 라이선스 문서

모노스페이스 폰트는 원장 상세 화면에서만 제한적으로 사용한다. 기본 플레이 화면은 둥글고 선명한 산세리프를 사용한다.

## 기술 및 전달 기준

- 실제 이름, 숫자, 통화 단위, 설명 문구를 이미지에 포함하지 않는다.
- 노드 프레임, 역할 심볼, 아바타, 상태 링을 각각 분리한다.
- 토큰 베이스와 자산 아이콘을 분리해 새 자산을 조합 가능하게 한다.
- SVG는 `currentColor` 또는 CSS 변수로 색을 변경할 수 있게 제작한다.
- 모든 상태는 색상 외에 형태, 심볼, 애니메이션으로도 구분한다.
- 큰 이벤트 이미지는 첫 화면 이후 지연 로딩한다.
- P0 초기 다운로드 예산은 이미지와 오디오를 합쳐 6MB 이하를 목표로 한다.
- 동일 계열 에셋은 캔버스 크기, 광원, 기준점, 내부 여백을 통일한다.
- 투명 WebM을 지원하지 않는 환경을 위해 PNG 스프라이트시트를 함께 제공한다.
- 생성형 이미지 사용 시 캐릭터 참조 시트, 프롬프트, 시드, 후처리 원본을 함께 보관한다.
- 모든 사운드는 음량을 정규화하고 BGM, 환경음, 효과음을 분리한다.

## 최소 제작 순서

1. 자산 클래스 10종의 형태 규칙과 베이스 토큰
2. 이해관계자 노드 프레임 8종과 상태 링 4종
3. 초기 아바타 6종과 핵심 표정
4. 네트워크 보드 배경과 계약 연결선 5종
5. 계약 모듈 조립 트레이와 위험 표시
6. 자산 이전, 계약 연결, 상환, 부도, 담보 이전 애니메이션
7. 핵심 UI/거래 효과음
8. 추가 자산과 이해관계자 패키지
