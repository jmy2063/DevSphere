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

따라서 최종 품질 표현은 “모든 가능한 환경에서 오류 0%”가 아니라 **“정의된 MVP와 검증 범위에서 알려진 결함 0을 목표로 한 Zero-Known-Defect Candidate”**가 정확합니다.
