package main

import (
    "bufio"
    "errors"
    "fmt"
    "os"
    "os/exec"
    "path/filepath"
    "runtime"
    "strings"
)

const version = "5.0.0"

func main() {
    root, err := executableDir()
    if err != nil {
        fail("설치 경로를 확인할 수 없습니다", err)
        return
    }

    if len(os.Args) > 1 {
        if err := handle(root, strings.ToLower(os.Args[1])); err != nil {
            fail("실행 중 오류가 발생했습니다", err)
            pause()
            os.Exit(1)
        }
        return
    }

    fmt.Printf("DevSphere AX %s\n", version)
    fmt.Println("Software Change Impact Analysis Platform")
    fmt.Println()
    fmt.Println("1. 검증된 Standalone Demo 실행")
    fmt.Println("2. 전체 Web 프로그램 실행")
    fmt.Println("3. 핵심 회귀검증 실행")
    fmt.Println("4. Strict Quality Gate 실행")
    fmt.Println("5. 설치 폴더 열기")
    fmt.Println("0. 종료")
    fmt.Print("선택: ")

    r := bufio.NewReader(os.Stdin)
    line, _ := r.ReadString('\n')
    choice := strings.TrimSpace(line)
    arg := map[string]string{
        "1": "--demo",
        "2": "--full",
        "3": "--verify",
        "4": "--quality",
        "5": "--folder",
        "0": "--exit",
    }[choice]
    if arg == "" {
        fail("올바르지 않은 메뉴 선택입니다", errors.New("1~5 또는 0을 입력해주세요"))
        pause()
        return
    }
    if err := handle(root, arg); err != nil {
        fail("실행 중 오류가 발생했습니다", err)
        pause()
        os.Exit(1)
    }
}

func executableDir() (string, error) {
    exe, err := os.Executable()
    if err != nil { return "", err }
    exe, err = filepath.EvalSymlinks(exe)
    if err != nil { return "", err }
    return filepath.Dir(exe), nil
}

func handle(root, arg string) error {
    switch arg {
    case "--demo":
        return runDemo(root)
    case "--full":
        return runBatch(root, "run-all.bat", true)
    case "--verify":
        return runBatch(root, "verify-core.bat", true)
    case "--quality":
        ps := filepath.Join(root, "verify-final-strict.ps1")
        if _, err := os.Stat(ps); err != nil { return fmt.Errorf("Strict Quality Gate 파일 없음: %w", err) }
        return start("powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps)
    case "--folder":
        if runtime.GOOS == "windows" { return start("explorer.exe", root) }
        return nil
    case "--exit":
        return nil
    default:
        return fmt.Errorf("지원하지 않는 옵션: %s", arg)
    }
}

func runDemo(root string) error {
    report := filepath.Join(root, "demo-output", "DevSphere_AX_Report.html")
    bat := filepath.Join(root, "report-demo.bat")

    // JDK가 있으면 실제 핵심 분석을 다시 실행하고, 없으면 검증된 사전 생성 보고서를 연다.
    if runtime.GOOS == "windows" {
        if _, errJava := exec.LookPath("java.exe"); errJava == nil {
            if _, errJavac := exec.LookPath("javac.exe"); errJavac == nil {
                if _, err := os.Stat(bat); err == nil {
                    cmd := exec.Command("cmd.exe", "/c", bat)
                    cmd.Dir = root
                    cmd.Stdout = os.Stdout
                    cmd.Stderr = os.Stderr
                    cmd.Stdin = os.Stdin
                    if err := cmd.Run(); err != nil {
                        fmt.Println("[WARN] 실시간 Demo 재생성 실패. 사전 검증 보고서를 엽니다.")
                    }
                }
            }
        }
    }

    if _, err := os.Stat(report); err != nil {
        return fmt.Errorf("Demo 보고서 없음: %w", err)
    }
    return openFile(report)
}

func runBatch(root, name string, keepOpen bool) error {
    path := filepath.Join(root, name)
    if _, err := os.Stat(path); err != nil { return fmt.Errorf("%s 파일 없음: %w", name, err) }
    if runtime.GOOS != "windows" { return fmt.Errorf("%s는 Windows용 실행 항목입니다", name) }
    sw := "/c"
    if keepOpen { sw = "/k" }
    cmd := exec.Command("cmd.exe", sw, path)
    cmd.Dir = root
    cmd.Stdout = os.Stdout
    cmd.Stderr = os.Stderr
    cmd.Stdin = os.Stdin
    return cmd.Start()
}

func openFile(path string) error {
    if runtime.GOOS == "windows" {
        // rundll32는 별도 shell quoting에 덜 민감하고 기본 브라우저를 사용한다.
        return start("rundll32.exe", "url.dll,FileProtocolHandler", path)
    }
    return nil
}

func start(name string, args ...string) error {
    cmd := exec.Command(name, args...)
    return cmd.Start()
}

func fail(msg string, err error) {
    fmt.Fprintf(os.Stderr, "[ERROR] %s: %v\n", msg, err)
}

func pause() {
    fmt.Print("Enter 키를 누르면 종료합니다...")
    _, _ = bufio.NewReader(os.Stdin).ReadString('\n')
}
