package com.devsphere.ax.service;

import com.devsphere.ax.analyzer.JavaStaticAnalyzer;
import com.devsphere.ax.model.SourceVerification;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Service;
import java.util.*;

@Service
public class GithubSourceVerificationService {
    private final AnalysisService analysis;
    private final GithubService github;
    public GithubSourceVerificationService(AnalysisService analysis,GithubService github){this.analysis=analysis;this.github=github;}

    public SourceVerification verify(String project,String owner,String repo,String revision,String token) {
        if(revision==null||!revision.matches("[a-fA-F0-9]{40}"))
            throw new IllegalArgumentException("내용 검증에는 전체 40자리 커밋 SHA가 필요합니다.");
        var local=analysis.sourceFingerprints(project);
        if(local.isEmpty())return SourceVerification.unavailable(revision,"업로드 파일 해시가 없어 내용 검증을 할 수 없습니다. ZIP을 다시 업로드하세요.");
        var commit=github.commit(owner,repo,revision,token);
        String treeSha=commit.path("commit").path("tree").path("sha").asText("");
        if(!revision.equalsIgnoreCase(commit.path("sha").asText())||!treeSha.matches("[a-fA-F0-9]{40}"))
            return SourceVerification.unavailable(revision,"GitHub 커밋/트리 응답을 확인할 수 없습니다.");
        var tree=github.tree(owner,repo,treeSha,token);
        if(!treeSha.equalsIgnoreCase(tree.path("sha").asText()))
            return SourceVerification.unavailable(revision,"GitHub 트리 SHA가 요청과 다릅니다.");
        return compare(local,revision,tree);
    }

    public static SourceVerification compare(Map<String,String> local,String revision,JsonNode tree) {
        if(!"false".equals(tree.path("truncated").asText())||!tree.path("tree").isArray())
            return SourceVerification.unavailable(revision,"GitHub 파일 목록이 불완전합니다. 전체 Java 파일 검증을 완료하지 못했습니다.");
        Map<String,String> remote=new TreeMap<>();
        for(JsonNode entry:tree.path("tree")) {
            String path=entry.path("path").asText("");
            String mode=entry.path("mode").asText("");
            if(entry.path("type").asText().equals("commit")&&JavaStaticAnalyzer.isIncludedSourcePath(path+"/Source.java"))
                return SourceVerification.unavailable(revision,"서브모듈 내부 Java 파일은 검증할 수 없습니다.");
            if(!JavaStaticAnalyzer.isIncludedSourcePath(path))continue;
            String sha=entry.path("sha").asText("").toLowerCase(Locale.ROOT);
            if(!entry.path("type").asText().equals("blob")||!Set.of("100644","100755").contains(mode)||!sha.matches("[a-f0-9]{40}")
                    ||remote.putIfAbsent(path,sha)!=null)
                return SourceVerification.unavailable(revision,"지원하지 않는 Java 파일 항목(심볼릭 링크 등)이 있습니다.");
            if(remote.size()>5000)return SourceVerification.unavailable(revision,"저장소의 Java 파일이 검증 한도 5,000개를 초과했습니다.");
        }
        if(local.isEmpty()||remote.isEmpty())return SourceVerification.unavailable(revision,"비교할 Java 파일이 없습니다.");
        // Only strip a shared ZIP prefix, never choose a repository subtree by suffix.
        String first=local.keySet().stream().sorted().findFirst().orElseThrow();
        List<String> prefixes=new ArrayList<>(List.of(""));
        for(int i=first.indexOf('/');i>=0;i=first.indexOf('/',i+1)) {
            String prefix=first.substring(0,i+1);
            if(local.keySet().stream().allMatch(p->p.startsWith(prefix)))prefixes.add(prefix);
        }
        int best=-1,ties=0;String prefix="";
        for(String candidate:prefixes) {
            int matches=(int)local.keySet().stream().filter(p->remote.containsKey(p.substring(candidate.length()))).count();
            if(matches>best){best=matches;prefix=candidate;ties=1;}
            else if(matches==best)ties++;
        }
        if(best>0&&ties>1)return SourceVerification.unavailable(revision,"ZIP 최상위 폴더를 유일하게 결정할 수 없습니다.");
        if(best==0)prefix="";
        Map<String,String> normalized=new TreeMap<>();
        for(var e:local.entrySet())normalized.put(e.getKey().substring(prefix.length()),e.getValue());
        int matched=0,changed=0,missing=0,extra=0;
        List<SourceVerification.Difference> differences=new ArrayList<>();
        for(var e:remote.entrySet()) {
            String actual=normalized.get(e.getKey());String difference="";
            if(actual==null){missing++;difference="MISSING_IN_ZIP";}
            else if(!e.getValue().equals(actual)){changed++;difference="CONTENT_CHANGED";}
            else matched++;
            if(!difference.isEmpty()&&differences.size()<100)differences.add(new SourceVerification.Difference(e.getKey(),difference));
        }
        for(String path:normalized.keySet())if(!remote.containsKey(path)) {
            extra++;if(differences.size()<100)differences.add(new SourceVerification.Difference(path,"EXTRA_IN_ZIP"));
        }
        boolean verified=changed+missing+extra==0;
        return new SourceVerification(verified?"VERIFIED":"MISMATCH",revision,prefix,local.size(),remote.size(),matched,changed,missing,extra,
                verified?"분석 대상 Java 파일 전체의 경로·바이트 내용이 커밋과 일치합니다.":"Java 소스 내용 또는 파일 목록이 다릅니다. 해당 버전으로 영향 분석을 실행하지 않았습니다.",differences);
    }
}
