# 실제 소스 기반 변경 영향 계약

고정된 공식 Spring 소스 위에 3가지 변경 가정을 두고, 결과를 실행하기 전에 포함·제외 기대를 작성했습니다.
`cases.tsv`에 커밋·시작점·LOCAL 범위·변경 가정이 있고, `labels.tsv`에는 21개 대상과 소스 파일·근거 구절·판정 이유가 있습니다.
시작점과 대상은 FQCN 또는 `FQCN#표시 시그니처`, API/table의 정확한 ID로 지정합니다.
실행기는 실제 Git HEAD와 기대 커밋이 같은지, 근거 구절이 존재하는지 확인하고 모호한 대상을 거부합니다.

## 기대 결과를 먼저 정한 범위

| 사례 | 변경 가정 | 포함 | 제외 |
|---|---|---|---|
| REST greeting | 응답 포맷 변경 | HTTP API, 응답 타입, 응답 검증 테스트 | 호출 관계 없는 bootstrap main |
| JPA last name | 이름 검색 쿼리 변경 | 실제 lambda 소비자, 엔티티·table, query 테스트 클래스·메소드 | 테스트 입력/검증용 getter를 경유한 역전파, bootstrap main |
| Petclinic vet query | 수의사 페이지 쿼리 변경 | 수의사 소비자·API·엔티티·table·테스트 | 공유 테스트가 함께 참조할 뿐인 Owner/OwnerRepository |

table 이름은 현재 정적 분석의 기본 엔티티 매핑 모델에 대한 기대이며 실제 DB 스키마를 검사한 결과가 아닙니다.
이 세 사례는 실제 프로젝트 소스를 사용하지만, 세 건의 실제 PR 전체를 정답화한 데이터는 아닙니다.
라벨은 코드를 검토한 에이전트가 작성했고 외부 사람의 독립 검수는 아직 받지 않았습니다.
제출 체크리스트의 독립적인 사람 검토 완료를 대신하지 않습니다.

## 지표 해석

21개 명시적 대상 안에서만 TP/FP/FN/TN과 precision/recall을 계산합니다.
라벨이 없는 후보는 `unlabelled_predictions`로 따로 세며 정답이나 오탐으로 간주하지 않습니다.
따라서 검사 통과나 라벨 범위의 1.0을 전체 영향 정확도라고 표현하지 않습니다.
테스트 목록은 실행·커버리지 결과가 아닌 검토 후보이고 CRI는 장애 확률이 아닙니다.
근거 경로는 반환된 대표 경로의 시작·끝과 실제 그래프 인접 관계를 검사합니다.

## 수정 전후 기록

`baseline-*.tsv`는 수정 전, `after-*.tsv`는 테스트 경유 전파를 막은 직후의 스냅샷입니다.
동일한 `cases.tsv`와 `labels.tsv` 해시를 provenance에 기록했으며, 두 실행의 `ImpactAnalyzer.java` 해시는 다릅니다.
라벨을 분석 결과에 맞춰 자동으로 생성하거나 바꾸지 않았습니다.

| 사례 | 수정 전 라벨 오탐 | 수정 후 | 누락 | 테스트 후보 전후 | CRI 전후 |
|---|---:|---:|---:|---|---|
| REST | 0 | 0 | 0 | 1 → 1 | 31 → 31 |
| JPA | 1 | 0 | 0 | 1 → 1 | 41 → 41 |
| Petclinic | 2 | 0 | 0 | 6 → 6 | 73 → 69 |

라벨 밖의 Petclinic 후보도 15개에서 9개로 줄었습니다. 이 6개는 이번 라벨로 정오답을 판정하지 않았습니다.
CRI 변화는 그래프 후보가 바뀐 결과이며 독립적인 위험도 보정이 아닙니다.

## 재현

JDK 17, Python, Git이 있는 프로젝트 루트에서:

```powershell
.\verify-public-benchmark.ps1
```

또는 Linux/CI:

```bash
bash verify-public-benchmark.sh
```

공식 소스 준비·합성 30개·소스 구조 30개 검사 뒤 이 21개 계약도 실행합니다.
실패하면 명령이 실패하며 CI에도 같은 검사가 연결됩니다.
결과는 Git에서 제외된 `benchmark-output/reviewed-{summary,label-results,predictions,provenance}.tsv`에 남습니다.
원본 소스의 저장소·라이선스·고정 버전은 [공개 소스 목록](../public/sources.json)을 참고하세요.
