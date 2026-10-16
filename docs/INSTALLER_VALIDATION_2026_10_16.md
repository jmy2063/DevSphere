# 최신 작업 내용의 Windows 설치본 검증

검증일: 2026-10-16. 이전 설치 도구는 Payload를 `git archive HEAD`로 만들면서 설치 프로그램의 Go 코드는 작업 폴더에서 읽었습니다. 커밋하지 않은 개선이 Payload에서 빠지고, 설치 프로그램 소스와 Payload 소스가 달라질 수 있었습니다.

## 변경 사항

- 수정·새 파일이 있는 작업 폴더에서 소스를 지정하지 않으면 빌드를 중단합니다. `--source head`는 마지막 커밋만, `--source working-tree`는 현재 파일 내용을 선택합니다.
- 작업 폴더 모드는 Git이 추적하는 파일과 무시되지 않은 새 파일을 포함합니다. 수정·삭제를 반영하며 Git 인덱스·브랜치·커밋을 변경하지 않습니다. 무시되지 않은 로컬 파일도 포함되므로 공유 전에 목록을 확인해야 합니다.
- 선택한 파일 바이트를 먼저 보관하고, 런처와 설치 프로그램을 모두 그 사본에서 빌드합니다. 작업 폴더와 HEAD 코드를 섞지 않습니다. `--launcher`를 명시하면 외부 런처임을 따로 기록합니다.
- Payload 안의 `BUILD_SOURCE_INFO.json`에 소스 모드·기준 커밋·수정 여부·소스 트리 해시·Go 버전·런처와 데모 해시를 기록합니다. `BUILD_INFO.txt`에는 소스 트리·Payload·설치 EXE 해시와 검사 결과를 남깁니다.
- Go 검사, EXE 빌드, `--verify-payload`, `--self-test`가 끝나야 결과 폴더에 파일을 반영합니다. 검사 실패 시 이전 산출물을 보존합니다.
- 경로 이탈·링크·Windows에서 사용할 수 없는 이름·대소문자 중복·파일 수와 용량 제한을 검사합니다. 작업 폴더의 서브모듈은 지원하지 않습니다.
- CI에 Windows 설치본 빌드·격리 재설치 검사와 artifact 보관 작업을 추가했습니다.

## 로컬 검증

Python 회귀 검사는 8개 중 7개 통과, 1개 건너뜀입니다. 기본/명시 HEAD, 수정된 작업 폴더의 명시 선택, 새 파일·삭제·Unicode 경로·무시된 파일, 인덱스 보존, 해시 재현, 선택한 Go 소스 사용, 잘못된 경로·용량·중복, Go 검사 및 최종 자체 검사 실패 시 이전 산출물 보존을 확인했습니다.

실제 OS 심볼릭 링크 생성 검사는 이 PC의 권한 제한으로 건너뛰었습니다. 링크 감지 분기 자체는 별도 검사로 통과했습니다. Windows 새 계정/별도 PC의 실제 설치와 같은 검증으로 해석하지 않습니다.

현재 Core Engine으로 Standalone HTML을 다시 생성했습니다. 샘플 SYSTEM 결과는 CRI 90, blast radius 17, 대표 경로 28개입니다. 이 값은 샘플의 회귀 결과이며 실서비스 정확도를 뜻하지 않습니다.

최신 작업 내용을 선택해 런처·설치 EXE를 빌드하고 Go 검사, `PAYLOAD_SHA256_OK`, `INSTALL_SELF_TEST_OK`를 확인했습니다. 자체 검사는 임시 경로에서 두 번 설치하고 전체 manifest 및 설치된 런처의 `--exit` 실행을 확인합니다. 기존 사용자 설치 경로와 바로가기는 변경하지 않습니다.

검토용 산출물:

- `release-output/working-tree-preview/DevSphere_AX_Setup.exe`
- `release-output/working-tree-preview/DevSphere_AX_5_0_Payload.zip`
- `release-output/working-tree-preview/BUILD_INFO.txt`
- `release-output/working-tree-preview/DevSphere_AX_Setup_SHA256.txt`

재현 명령:

```powershell
python windows-installer-src/test_build.py -v
python windows-installer-src/build.py --go .benchmark-cache/tools/go-toolchain/go/bin/go.exe --report demo-output/DevSphere_AX_Report.html --source working-tree --output release-output/working-tree-preview
```

빌드용 Go는 [공식 배포 목록](https://go.dev/dl/)의 Windows ZIP을 받아 SHA-256을 대조한 뒤 로컬 캐시에 풀었습니다. 런처·설치 프로그램의 빌드에는 같은 Go를 사용했습니다.

작업 폴더 사본은 커밋으로 고정한 최종 릴리스가 아닙니다. 원격 CI 실행, 새 PC의 전체 Web 실행·의존성 설치, 실제 사용자 경로 설치·바로가기, 발표 리허설, main 반영 및 배포는 이번 검증에 포함하지 않았습니다.
