# DevSphere 후속 개선 — 2026-10-07

## 결과

공식 Spring 예제 3개의 소스를 고정하고 선택한 30개 구조/필수 영향 검증 항목을 실행했습니다.
수정 전에는 20개, 수정 후에는 30개가 통과했습니다.
이는 완전한 영향 범위 정답을 사용한 정확도 개선 수치가 아닙니다.

| 프로젝트 | 고정 커밋 | 실제 업로드 분석 클래스 | 노드 | 관계 |
| --- | --- | ---: | ---: | ---: |
| Spring Petclinic | `500158f732419217507c7656904b8e6aa1bcc0d6` | 45 | 241 | 583 |
| REST Service Guide (complete) | `3f4cef01152596c19bc4d37939409358812b1421` | 4 | 10 | 12 |
| Accessing Data JPA Guide (complete) | `ef48947528dba9021776282e12299e5298e66bca` | 4 | 15 | 25 |

출처와 정답의 정의는 `benchmarks/public/README.md`, 버전은 `benchmarks/public/sources.json`에 기록했습니다.

## 수정 내용

- `@Repository`가 없는 Spring Data 인터페이스도 실제로 import한 Repository/CrudRepository/JpaRepository 계열을 확인해 저장소로 분류합니다. 같은 이름의 사용자 정의 인터페이스를 저장소로 오인하지 않도록 했습니다.
- 이에 따라 Petclinic의 Vet/Owner/PetType 저장소와 JPA Guide의 Customer 저장소에 Entity `MANAGES` 관계를 생성합니다.
- 상속 메소드 호출을 선언한 부모 메소드까지 연결합니다. PetTypeFormatter에서 호출하는 `PetType.getName()`을 실제 선언인 `NamedEntity.getName()`과 연결합니다.
- 명시적 import, 동일 패키지, wildcard import의 타입 문맥을 사용합니다. 존재하지 않는 FQCN을 다른 패키지의 같은 이름 클래스로 바꾸지 않습니다.
- 재정의한 메소드와 부모의 다른 오버로드를 구분하고, 잘못된 상속 순환에서도 탐색을 종료합니다. 인자 타입까지 완전하게 해석하는 Java 컴파일러 수준의 바인딩은 아닙니다.
- Java 소스 읽기 문자셋을 UTF-8로 고정했습니다. Windows 기본 인코딩(x-windows-949)으로 JAR을 실행할 때 Petclinic WebConfiguration에서 발생하던 파싱 경고를 실제 업로드로 재현하고 수정했습니다.
- 실제 프로젝트 이름으로 모바일 검증 시 발견한 가로 넘침을 수정했습니다.
- SHA256 검증을 포함한 Gradle 8.10.2 Wrapper를 추가했습니다. 환경 진단과 릴리스 검증도 Wrapper를 인식합니다. 환경 진단 함수의 예약 변수 `$Args` 사용 때문에 버전 인자가 전달되지 않던 문제와 실행 스크립트의 오류 코드 전달도 고쳤습니다.

## 검증

- 기존 JDK Core regression: **62/62 PASS**.
- 합성 fixture: **3개 / 30개 시나리오 PASS**.
- 고정된 공개 소스: **3개 / 30개 선택 항목 PASS**, 수정 전 **20/30**.
- 실제 의존성 Gradle `test bootJar`: **BUILD SUCCESSFUL**, JUnit **14개**, 실패/오류/skip **0**. 새 타입 해석 회귀 5개와 실제 HTTP 통합 테스트 2개를 포함합니다.
- 실제 서버 HTTP: 3개 공개 ZIP 업로드, 메소드 분석, LOCAL/FEATURE/SYSTEM 비교, 평가, 생성한 프로젝트 삭제 PASS.
- 실제 GitHub API: Petclinic 커밋 `500158f...`의 변경 시작점 **4개** 매핑 PASS. VetController/OwnerController와 각각의 테스트 변경 메소드를 확인했습니다.
- 실제 Chrome 브라우저: Petclinic 업로드 → 분석 → 테스트 유형 필터 → 경로별 그래프 탐색 → 390px 모바일 가로 넘침 검사 PASS. 응답을 가로채거나 대체하지 않았습니다.
- 기존 고정 응답 브라우저 회귀 PASS. 프런트엔드 strict typecheck/production build, backend stub semantic compile PASS.
- JDK 17 / Node 24 / npm 11과 포함된 Wrapper를 사용하는 환경 진단 PASS.

외부 AI와 Neo4j 영속화는 끈 상태에서 분석 경로를 검증했습니다.
실제 서버의 `/evaluate` 호출은 엔드포인트 동작 확인이며 독립 정답을 사용한 정확도 측정이 아닙니다.
GitHub Commit 경로를 검증했으며, 별도의 PR API 연결과 base/head 버전 검증까지 완료했다고 주장하지 않습니다.

## 산출물과 재실행

실제 빌드 산출물:

```text
backend/build/libs/devsphere-ax-backend-5.0.0-zkd.jar
size: 29,590,210 bytes
SHA256: 7a12c388f4865312a378cb8ddb54601f767f09a1742d4c551a2ef4fa6103e062
```

JDK 17을 설치하고 `JAVA_HOME`과 PATH에 지정한 뒤:

```powershell
.\verify-public-benchmark.ps1
cd backend
.\gradlew.bat test bootJar --no-daemon
.\gradlew.bat bootRun --no-daemon
```

별도 터미널에서 프런트엔드를 실행합니다.

```powershell
cd frontend
npm ci
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Playwright를 사용할 수 있는 별도 터미널의 프로젝트 루트에서:

```powershell
node tools/live-server-smoke.cjs
```

HTTP/브라우저 결과는 `benchmark-output/live-server-results.json`, 화면은 `live-petclinic-review.png`와 `live-petclinic-mobile.png`에 기록됩니다.
현재 JAR과 frontend/dist는 빌드했으며, 기존 Windows 설치 파일/EXE는 다시 패키징하지 않았습니다.
전체 Strict Gate의 npm audit 단계와 설치 프로그램 검증까지 통과한 정식 릴리스로 표현하지 않습니다.

## 다음 검증 범위

독립적인 검토자가 실제 변경의 영향 범위 전체와 상대 위험 순위를 라벨링해야 Precision/Recall과 CRI 순위 보정을 평가할 수 있습니다.
현재 Petclinic FEATURE 분석에는 공통 모델/테스트 경로를 통해 다른 기능의 테스트도 후보로 포함됩니다.
그 후보를 전부 필요한 테스트로 간주하지 말고, 직접 연결과 먼 경로를 구분해 오탐 여부를 검토해야 합니다.
CRI 가중치는 이 단계에서 변경하지 않았습니다.
