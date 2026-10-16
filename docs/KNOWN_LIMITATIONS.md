# DevSphere AX 4.0 — Known Boundaries

이 문서는 숨은 결함 목록이 아니라 **분석 모델이 의도적으로 보장하는 범위의 경계**를 명확히 하기 위한 문서입니다.

1. **Java/Spring Boot 정적 분석 중심**
   - Reflection, runtime-generated proxy, dynamic class loading은 정적 AST만으로 완전 복원할 수 없습니다.
2. **런타임 분산 경로 미통합**
   - Kafka/RabbitMQ event 흐름, 실제 distributed tracing은 후속 확장입니다.
3. **CRI는 장애 확률이 아님**
   - Graph evidence 기반 상대 변경 위험지수이며 Ground Truth로 보정합니다.
4. **대규모 monorepo**
   - 현재 파일/node cap으로 안전하게 제한합니다. Incremental analysis/cache는 후속 확장입니다.
5. **GitHub patch availability**
   - GitHub가 patch를 생략하는 대형 diff는 Method 대신 file/class fallback으로 분석할 수 있습니다.
6. **정적 타입 해석의 보수성**
   - 동일 simple class name이 여러 package에 존재해 명확히 해석할 수 없는 경우 잘못 연결하기보다 관계 생성을 생략하는 방향을 택합니다.
7. **외부 서비스**
   - GitHub/Neo4j/AI/registry/network의 가용성 자체는 프로그램이 보장할 수 없습니다. Core engine은 이들 없이도 JDK-only demo로 검증 가능합니다.
8. **Java 소스 내용 검증의 범위**
   - GitHub 커밋과 분석 대상 Java의 경로·원본 바이트만 비교합니다. 설정·리소스·의존성·런타임 일치와 특정 커밋의 유일한 식별을 보장하지 않습니다. 줄바꿈 차이도 불일치입니다.
   - SHA 미입력 시 HEAD를 우선 비교하고, HEAD가 다를 때 BASE를 비교합니다. 양쪽 Java가 같으면 HEAD를 선택합니다. 부분 소스 ZIP, 불완전한 트리, 서브모듈·심볼릭 링크 등은 전체 검증 완료로 표시하지 않습니다.
9. **테스트는 영향 전파의 종착점**
   - TEST 클래스와 그 소속 메소드는 검토 후보로 보존하지만, 다른 업무로 영향을 전파하는 중간 연결로 사용하지 않습니다. 실제 운영 의존성 경로는 계속 탐색합니다. 테스트 분류는 정적 어노테이션·명명 규칙에 의존합니다.
10. **메서드와 형제 API의 구분**
    - 변경 메서드의 소유 클래스 anchor에서, handler가 확인된 형제 API로의 `EXPOSES` 우회를 생략합니다. 실제 handler·호출 경로는 계속 탐색하며 클래스 전체 변경과 handler 미확인 API는 보수적으로 남깁니다. 다른 클래스·공유 데이터 의존성을 경유한 후보까지 모두 정오답 판정한 것은 아닙니다.

따라서 최종 품질 표현은 “모든 가능한 환경에서 오류 0%”가 아니라 **“정의된 MVP와 검증 범위에서 알려진 결함 0을 목표로 한 Zero-Known-Defect Candidate”**가 정확합니다.
