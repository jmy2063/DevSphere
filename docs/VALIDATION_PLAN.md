# Ground Truth 기반 평가 계획

현재 반복 실행 가능한 실제 소스 변경 계약은 [reviewed benchmark](../benchmarks/reviewed/README.md)의 3개 가정·21개 라벨입니다.
에이전트가 소스를 검토해 작성한 포함·제외 계약으로, 아래의 독립적인 사람 검토·30개 이상 평가 목표를 완료한 데이터셋은 아닙니다.

실제 upstream 커밋의 검토는 [Petclinic 페이지 범위 수정](../benchmarks/real-changes/README.md)에 추가했습니다. 한 커밋의 변경 메서드 2개·LOCAL의 명시적 7개 대상이며, 형제 API로 퍼지는 오탐 3개를 수정했습니다. 미판정 후보와 독립적인 사람 검수는 별도로 남아 있습니다.

## 평가 데이터
- Spring Boot 프로젝트 2~3개
- 프로젝트당 10개 이상 변경 시나리오
- 총 30개 이상 권장
- 단순 Method 수정 / API 변경 / DB 영향 / 다중 Service 전파 / 4~6-hop 광역 전파 시나리오를 구분

## Ground Truth
각 변경 시나리오별로 사람이 직접 실제 영향 범위와 경로를 기록합니다.
- Changed Method/Class
- Controller / API
- Service
- Repository
- Entity / Table
- Test
- 실제 영향 Path
- 영향 범위의 상대 위험도(낮음/중간/높음 또는 순위)

## 지표
- Static Structure F1 ≥ 0.90 목표
- Changed Method Localization Accuracy ≥ 0.90 목표
- Impact Recall ≥ 0.85 목표
- Impact Precision ≥ 0.80 목표
- Test Recommendation Top-3 Hit Rate ≥ 0.80 목표
- Path Validity / Path Recall 측정
- LOCAL / FEATURE / SYSTEM별 Recall 및 False Positive 변화 측정
- CRI와 사람의 상대 위험 순위 간 Spearman rank correlation 측정
- Scope별 분석시간 / explored node 수 측정
- 수작업 대비 분석시간 50% 단축 목표

## CRI 평가 원칙
CRI는 장애 발생 확률을 예측하는 모델이 아닙니다.
따라서 단순한 'Risk Accuracy' 하나로 평가하지 않고,
1) Ground Truth 영향 범위를 얼마나 잘 잡는지,
2) 넓은 변경일수록 CRI가 일관되게 높아지는지,
3) 사람의 상대 위험 순위와 얼마나 일치하는지,
4) False Positive가 과도하게 증가하지 않는지를 함께 평가합니다.

목표값은 제안 단계 KPI이며, 최종 보고서에는 실제 측정값과 오차 원인을 분리해 기록합니다.
