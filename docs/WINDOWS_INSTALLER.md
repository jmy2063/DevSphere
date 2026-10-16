# DevSphere AX 5.0 Windows Installer

## 제공 실행 파일

- `DevSphere_AX_Setup.exe` — Windows x64용 설치 프로그램
- 설치 후 `%LOCALAPPDATA%\DevSphereAX\5.0.0\DevSphere_AX.exe` — 실행/검증 런처

설치 프로그램은 **관리자 권한 없이 현재 사용자 영역(LocalAppData)** 에 설치합니다.

## 설치 프로그램이 하는 일

1. 내장 Payload의 SHA-256을 검증합니다.
2. 임시 staging 디렉터리에 안전하게 압축 해제합니다.
3. `RELEASE_MANIFEST_SHA256.txt`로 파일 무결성을 다시 검증합니다.
4. 검증 성공 후에만 실제 설치 폴더로 원자적 교체합니다.
5. Desktop / Start Menu shortcut 생성을 시도합니다.
6. 설치 환경 상태를 `INSTALL_INFO.txt`에 기록합니다.
7. 기존 5.0.0 설치가 있으면 백업 후 교체하고, 실패 시 원복합니다.

## 설치 후 실행 모드

`DevSphere_AX.exe` 메뉴:

1. Standalone Demo
2. Full Web Program
3. Core Regression Verification
4. Strict Quality Gate
5. Open Install Folder

JDK 17+가 있으면 Standalone Demo는 실제 Core Engine으로 보고서를 재생성합니다. JDK가 없어도 사전 검증된 HTML Demo를 열 수 있습니다.

Full Web Program은 JDK 17+, Node.js 20+, npm, Gradle 또는 IntelliJ Gradle 환경이 필요합니다.

## Windows SmartScreen

이 프로젝트용 EXE는 상용 코드 서명 인증서로 서명되지 않았습니다. Windows에서 '알 수 없는 게시자' 또는 SmartScreen 경고가 표시될 수 있습니다. 이것은 애플리케이션 로직 오류와는 별개의 코드 서명/평판 문제입니다.

배포 전에는 제공된 SHA-256 파일과 EXE 해시를 비교하십시오.

## 현재 소스로 다시 빌드

설치 프로그램 소스와 빌드 명령은 [windows-installer-src/README.md](../windows-installer-src/README.md)에 있습니다.
빌드 후 `release-output/DevSphere_AX_Setup.exe --verify-payload`와
`--self-test`를 실행하면 내장 파일의 해시, 격리 설치, 재설치, 설치된 런처 실행을 확인할 수 있습니다.
실제 사용자 설치 경로와 바로가기는 이 검증에서 변경하지 않습니다.

빌드 도구는 런처도 선택한 소스로 다시 만들고 위 두 검사를 자동 실행한 뒤 산출물을 기록합니다.
작업 폴더에 변경이 있으면 `--source head`(마지막 커밋만) 또는
`--source working-tree`(수정·새 파일·삭제 포함)를 명시해야 합니다.
현재 작업 내용을 확인할 때는 기존 배포본과 구분해 다음처럼 빌드합니다.

```powershell
python windows-installer-src/build.py --go C:\path\to\go.exe --report demo-output\DevSphere_AX_Report.html --source working-tree --output release-output\working-tree-preview
```

`BUILD_INFO.txt`와 Payload 내부 `BUILD_SOURCE_INFO.json`에서 선택한 소스와 해시를 확인할 수 있습니다.
작업 폴더 빌드는 검토용 후보이며, 최종 제출에는 커밋을 고정한 재빌드와 새 환경의 전체 실행 검증이 필요합니다.

소스 선택 개선과 로컬 검증 기록: [2026-10-16 설치본 검증](INSTALLER_VALIDATION_2026_10_16.md).
