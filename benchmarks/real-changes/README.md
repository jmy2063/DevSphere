# 실제 커밋: Petclinic 페이지 범위 리다이렉트

검토일: 2026-10-17. 가정한 수정이 아닌 [실제 upstream 커밋](https://github.com/spring-projects/spring-petclinic/commit/500158f732419217507c7656904b8e6aa1bcc0d6)의 두 변경 메서드를 검토합니다.

- BASE: `0d064b04958da7715a9138459bafbde3bd10949d`
- HEAD: `500158f732419217507c7656904b8e6aa1bcc0d6`
- 원본: spring-projects/spring-petclinic, Apache-2.0. `pagination.patch`는 해당 프로젝트의 컨트롤러 2개와 테스트 2개에 대한 실제 Git diff이며 저작권·라이선스는 원본 프로젝트에 따릅니다.
- 범위: LOCAL. 하나의 커밋에서 변경된 메서드 2개이며 독립된 실제 PR 두 건을 뜻하지 않습니다.
- 라벨 작성: 에이전트의 소스·diff 검토. 외부 사람의 독립 검수는 아직 받지 않았습니다.

## 결과 실행 전에 정한 기대

1. `VetController.showVetList`: 잘못된 페이지를 `/vets.html?page=1`로 돌려보냅니다. HTML API와 `VetControllerTests`는 포함하고, 별도 메서드가 처리하는 JSON `/vets`는 제외합니다.
2. `OwnerController.processFindForm`: 잘못된 페이지에서 `/owners?page=1`로 돌아가며 lastName을 유지합니다. 검색 API와 `OwnerControllerTests`는 포함하고, 별도 정적 폼 `/owners/new`, `/owners/find`는 제외합니다.

`cases.tsv`·`labels.tsv`의 정확한 Node 식별 조건과 근거 파일·구절을 사용합니다. 테스트는 클래스 단위 후보를 평가합니다. 원본 커밋에 추가된 테스트 메서드 이름은 근거로 기록하지만, 이 검사가 해당 테스트를 실행하거나 테스트 메서드 추천의 완전성을 평가하는 것은 아닙니다.

## 발견한 문제와 수정

변경 메서드의 소유 클래스를 0단계 anchor로 만든 뒤 `EXPOSES`를 따라 모든 형제 API로 퍼졌습니다. HTML handler의 변경을 별도 JSON/폼 API의 영향으로도 잘못 표시했습니다.

METHOD 분석의 시작 anchor에서, 소유 클래스의 메서드와 `HANDLED_BY`로 연결된 API에 대해서는 `EXPOSES` 우회를 생략합니다. 실제 handler와 `CALLS` 경로로 도달한 API는 남습니다. 클래스 전체 변경의 API 전파와 handler가 매핑되지 않은 API의 보수적 fallback은 유지합니다. 다른 클래스 경유의 모든 오탐을 없애는 전역 정책 변경은 아닙니다.

| 사례 | 라벨 TP | 오탐 전→후 | 누락 전→후 | 테스트 클래스 후보 | 미판정 후보 전→후 | CRI 전→후 |
|---|---:|---|---|---|---|---|
| 수의사 HTML | 2 | 1→0 | 0→0 | 6→6 | 15→14 | 70→70 |
| 소유자 검색 | 2 | 2→0 | 0→0 | 7→7 | 49→41 | 74→73 |

지표는 명시적으로 라벨을 붙인 7개 대상에만 적용합니다. 미판정 후보는 정답/오탐으로 계산하지 않습니다. 남은 후보 전체와 대표 경로는 `benchmark-output/real-change-predictions.tsv`에서 검토할 수 있습니다. CRI는 그래프 근거 기반 상대 위험지수입니다.

수정 전후 snapshot은 `baseline-*.tsv`, `after-*.tsv`입니다. 양쪽의 cases/labels 해시는 같고 `ImpactAnalyzer.java` 해시는 다릅니다. 대표 경로의 시작·끝과 실제 그래프 인접 관계 검사도 통과했습니다. 경로의 의미적 정확도 전체를 증명하는 검사는 아닙니다.

## 재현 및 회귀

```powershell
.\verify-public-benchmark.ps1
```

또는 `bash verify-public-benchmark.sh`를 실행합니다. 공개 소스 준비 단계에서 BASE를 필요할 때 가져오며, HEAD의 실제 부모인지·커밋의 전체 변경 파일 4개가 맞는지·원본 diff 바이트와 SHA-256이 저장한 patch와 같은지 확인합니다. 캐시의 로컬 변경은 덮어쓰지 않습니다.

기존 합성 30개·소스 구조 30개·가정 기반 21개 계약에 이 2개 사례/7개 라벨을 추가했고 CI에서 실패 시 중단합니다. `ControllerApiBoundaryTest`는 모든 분석 범위의 메서드/공유 helper, 클래스 전체 변경, 미매핑 API fallback을 별도로 검사합니다.

독립적인 사람의 검토, 다른 실제 커밋, 미판정 후보 전체의 정답화, 런타임 테스트 실행 및 CRI 순위 보정은 남아 있습니다. 이 결과로 MVP의 독립 Ground Truth 완료 항목을 체크하지 않습니다.
