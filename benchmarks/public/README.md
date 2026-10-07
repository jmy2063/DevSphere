# 고정된 공개 Spring 소스 검증

이 평가의 입력은 공식 Spring 저장소 3개의 실제 소스입니다.
`sources.json`에 저장소 주소, 40자리 커밋 SHA, 분석 루트가 고정되어 있습니다.

- [Spring Petclinic](https://github.com/spring-projects/spring-petclinic/tree/500158f732419217507c7656904b8e6aa1bcc0d6)
- [REST Service Guide](https://github.com/spring-guides/gs-rest-service/tree/3f4cef01152596c19bc4d37939409358812b1421/complete)
- [Accessing Data JPA Guide](https://github.com/spring-guides/gs-accessing-data-jpa/tree/ef48947528dba9021776282e12299e5298e66bca/complete)

## 정답과 범위

`assertions.tsv`의 30개 항목은 소스를 직접 검토해 작성한 클래스 분류, 정확한 관계, 필수 영향 대상의 존재 여부입니다.
변경 메소드에서 영향 범위 전체를 사람이 독립적으로 라벨링한 데이터셋은 아닙니다.
외부 사람의 정답 검수도 받지 않았습니다. 따라서 이 결과를 Precision/Recall/F1 또는 실제 서비스 정확도라고 표현하지 않습니다.

같은 클래스를 여러 검증 항목에서 사용하며, 세 프로젝트 중 두 개는 작은 학습용 예제입니다.
실제 장애, 런타임 DI, 테스트 커버리지, 미리 알려지지 않은 프로젝트에 대한 일반화 성능은 측정하지 않습니다.

입력 형식은 다음과 같습니다.

```text
project<TAB>case<TAB>TYPE|EDGE|IMPACT<TAB>source<TAB>target-or-type<TAB>relation-or-scope
```

클래스는 FQCN, 메소드는 `FQCN#표시 시그니처`, API와 테이블은 정확한 Node ID를 사용합니다.
`TYPE`는 분류, `EDGE`는 정확한 그래프 관계, `IMPACT`는 지정한 범위에 필수 대상이 포함되는지만 검사합니다.
`IMPACT`에서 그 밖의 모든 후보를 오탐으로 간주하지 않습니다.

## 실행

JDK 17과 Python, Git을 사용할 수 있는 프로젝트 루트에서:

```powershell
.\verify-public-benchmark.ps1
```

```bash
bash ./verify-public-benchmark.sh
```

스크립트는 소스를 `.benchmark-cache/`에 받습니다. 커밋과 원격 주소를 고정하며 캐시에 사용자 변경이 있으면 중단합니다.
Guide 저장소는 `initial`을 제외한 `complete`만 분석/업로드합니다.
이는 initial/complete의 동일한 FQCN이 섞이는 것을 방지합니다.
전체 제3자 소스와 다운로드 도구는 Git에 포함하지 않습니다.

결과는 `benchmark-output/public-source-results.tsv`에 생성됩니다.
2026-10-07 수정 전 결과는 `baseline-results.tsv`에 보존했습니다: 20/30 통과.
Spring Data 저장소 인식과 상속 메소드 호출 보완 후 같은 30개 항목이 모두 통과했습니다.

라이브 HTTP/브라우저 검증은 백엔드와 프런트엔드를 켠 상태에서 `node tools/live-server-smoke.cjs`로 실행합니다.
Playwright와 로컬 Chrome이 필요합니다. GitHub 커밋 조회는 실제 공개 API를 호출하므로 네트워크와 익명 요청 한도의 영향을 받습니다.
이 스크립트의 `/evaluate` 호출은 API 동작 확인이며, 분석 결과에서 대상을 골랐으므로 정확도 측정에 사용하지 않습니다.
