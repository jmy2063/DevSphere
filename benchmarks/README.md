# 반복 가능한 영향 분석 평가

이 데이터셋은 **실제 서비스의 정확도 측정이 아닌 합성 구조 회귀 평가**입니다.
Java AST → GraphBuilder → ImpactAnalyzer → GroundTruthEvaluator 전체 핵심 경로를 외부 서비스 없이 실행합니다.

## 평가 입력

- `fixtures/chain`: A → B → C → D → E → F → G
- `fixtures/diamond`: A → B/C → D → E
- `fixtures/cycle`: A → B → C → A, C → D → E → F
- 각 fixture에 독립적인 `Unrelated` 클래스가 있습니다. 잘못 포함되면 FP로 집계됩니다.
- `@Service`와 필드 타입으로 관계를 표현합니다. Spring 의존성이 설치되지 않아도 AST 파싱이 가능합니다.
- `scenarios.tsv`: fixture별 10개, 총 30개 변경 시작점/범위 조합입니다.

정답은 위 소스 구조에서 사람이 검토할 수 있는 양방향 도달 범위로 작성했습니다.
프로그램 출력으로 정답을 생성하지 않습니다. 변경 시작점과 PROJECT 노드는 정답에서 제외합니다.
LOCAL은 2단계, FEATURE는 4단계, SYSTEM은 6단계입니다.
관계는 현재 confidence pruning 기준에서 해당 깊이까지 유지되는 Service 의존성으로 제한했습니다.

## 실행

JDK 17 이상을 PATH에 등록한 뒤 프로젝트 루트에서:

```powershell
.\verify-benchmark.ps1
```

Linux/macOS:

```bash
bash ./verify-benchmark.sh
```

결과는 `benchmark-output/impact-results.tsv`와 `benchmark-output/summary.txt`에 생성됩니다.
행별 Precision/Recall/F1, FP/FN, 놓친 대상, 불필요한 대상을 기록합니다.
표준 출력의 평균은 시나리오별 지표의 단순 평균(macro)입니다.
합성 fixture는 FP/FN 0을 요구하며, 어긋나면 실행이 실패합니다.

`EvaluationRegression`도 함께 실행합니다. 같은 표시 이름을 가진 두 노드의 모호한 입력을 거부하고,
정확한 Node ID로 두 노드를 평가할 수 있는지 검증합니다.

## 결과의 경계

30개 행은 30개의 독립적인 실제 PR이 아닙니다. 세 가지 작은 구조의 시작점/범위 조합입니다.
메소드 호출 해석, Spring 런타임 DI, PR 변경 위치, 테스트 커버리지, 실제 장애, CRI 순위 정확도를 측정하지 않습니다.
이 데이터셋의 F1 1.0을 실제 프로젝트 정확도 100%로 표현하면 안 됩니다.

실제 서비스 평가는 `docs/VALIDATION_PLAN.md`에 따라 별도로 수집합니다.
예상 영향은 분석 출력 확인 전에 작성하고, 프로젝트/커밋 버전과 검토자를 기록합니다.
분석 모델 밖의 동적 관계와 데이터셋에 정답이 누락된 경우를 구분해서 검토해야 합니다.
