# DevSphere AX — Wide-Scope Change Risk Design

## 1. 교수님 지적에 대한 핵심 답변

DevSphere AX는 **“시스템 전체의 실제 장애 확률을 맞힌다”**고 주장하지 않습니다.
대신 소스코드에서 확인 가능한 관계를 근거로 **Change Risk Index(CRI, 0~100)** 를 계산합니다.

즉, 넓은 범위의 리스크를 막연하게 숫자로 추측하는 것이 아니라 다음 증거를 누적합니다.

- 변경된 정확한 Method/Class
- 호출/의존 경로(CALLS, USES, MANAGES, MAPS_TO, TESTS, EXPOSES, HANDLED_BY, INHERITS)
- 외부 API 노출 여부
- Service/Repository/Entity/Table로 이어지는 Blast Radius
- 패키지 경계를 넘는 전파
- 최대 전파 Depth와 실제 근거 Path 수
- 연결된 Regression Test의 존재/부재
- 각 경로의 Evidence Confidence

따라서 발표에서는 **“Risk Score = 장애 확률”** 이라고 말하지 않고,
**“Graph 근거 기반 상대 변경 위험지수”** 라고 정의합니다.

## 2. 3단계 분석 범위

### LOCAL
- 기본 2단계
- 변경점 주변의 직접/근거리 영향 확인
- 빠른 코드 리뷰용

### FEATURE
- 기본 4단계
- 하나의 기능 흐름 안에서 API → Service → Repository/Entity → Test까지 추적
- 일반 PR 리뷰/유지보수용

### SYSTEM
- 최대 6단계
- 패키지/서비스 경계를 넘는 광역 영향 분석
- Confidence pruning + Cycle protection + Node cap을 적용해 전체 그래프 폭발을 방지

## 3. Method 단위 변경점 식별

GitHub PR patch의 unified diff에서 **새 파일 기준 변경 라인**을 추출합니다.
그 라인이 어떤 Method의 startLine~endLine 범위에 포함되는지 비교하여 Method를 변경 시작점으로 선택합니다.

예:

`OrderService.createOrder()`
→ `PaymentService.pay()`
→ `PaymentRepository`
→ `PaymentEntity`
→ `payments` table

동시에 반대 방향으로

`OrderController.createOrder()`
→ `POST /orders`

까지 확인할 수 있습니다.

모든 Path Step에는 다음 근거가 포함됩니다.

- Node 이름/종류
- sourcePath
- 시작 line / 끝 line
- 관계 종류
- UPSTREAM / DOWNSTREAM 방향
- path confidence

## 4. 광역 탐색이 무한정 퍼지지 않는 이유

일반 BFS를 무제한으로 수행하지 않습니다.

1. 영향 분석에 의미 있는 relation만 whitelist
2. PROJECT/CONTAINS 같은 구조 관계는 영향 전파에서 제외
3. 이미 방문한 Node는 더 높은 confidence 경로일 때만 갱신
4. 관계별 confidence weight 적용
5. hop마다 confidence decay 적용
6. Scope별 minimum confidence 미만 경로 pruning
7. Scope별 최대 node 수 제한
8. Cycle-safe priority traversal

따라서 SYSTEM 범위는 넓지만 **근거가 약한 경로를 계속 확장하지 않습니다.**

## 5. Change Risk Index 구성

CRI는 5개 축의 합으로 0~100 정규화합니다.

- Blast Radius: 최대 25
- Critical Surface(API/DB 등): 최대 30
- Propagation(depth/path): 최대 20
- Coupling(service/package boundary): 최대 15
- Test Gap: 최대 10

Risk Level:

- 0~24: LOW
- 25~49: MEDIUM
- 50~74: HIGH
- 75~100: CRITICAL

각 점수는 `riskBreakdown`과 `riskReasons`로 그대로 노출합니다.
따라서 결과가 HIGH/CRITICAL인 이유를 사람이 검증할 수 있습니다.

## 6. 평가 방법

광역 리스크 기능은 다음처럼 평가합니다.

- Method localization accuracy: PR changed line → 실제 changed method 일치율
- Impact Precision / Recall / F1
- Top-k impacted component hit rate
- Path validity: Ground Truth 경로와 탐지 경로 비교
- Scope coverage: LOCAL/FEATURE/SYSTEM별 Recall 변화
- False Positive 증가율
- CRI rank correlation: 사람이 평가한 상대 위험 순위와 시스템 CRI 순위 비교
- 분석 시간 및 탐색 node 수

중요한 점은 CRI의 절대 숫자 자체를 정답으로 주장하는 것이 아니라,
**Ground Truth와 반복 실험을 통해 가중치와 임계값을 보정**한다는 것입니다.
