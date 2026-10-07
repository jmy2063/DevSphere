package com.devsphere.ax.service;

import com.devsphere.ax.graph.SoftwareGraph;
import com.devsphere.ax.impact.ChangedNodeLocator;
import com.devsphere.ax.model.*;
import com.devsphere.ax.util.UnifiedDiffParser;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Service;
import java.util.*;

@Service
public class GithubChangeAnalysisService {
    private final AnalysisService analysis;
    private final AiExplanationService ai;
    private final ChangedNodeLocator locator=new ChangedNodeLocator();
    public GithubChangeAnalysisService(AnalysisService analysis,AiExplanationService ai){this.analysis=analysis;this.ai=ai;}

    public GithubChangeReport analyze(String project,String kind,String owner,String repo,String reference,
            String baseSha,String headSha,String declaredRevision,Iterable<JsonNode> files,AnalysisScope scope,Integer depth){
        return analyze(project,kind,owner,repo,reference,baseSha,headSha,declaredRevision,files,scope,depth,SourceVerification.notRequested());
    }

    public GithubChangeReport analyze(String project,String kind,String owner,String repo,String reference,
            String baseSha,String headSha,String declaredRevision,Iterable<JsonNode> files,AnalysisScope scope,Integer depth,SourceVerification verification){
        String revision=declaredRevision==null?"":declaredRevision.trim().toLowerCase(Locale.ROOT);
        if(!revision.isEmpty()&&!revision.matches("[a-f0-9]{40}"))throw new IllegalArgumentException("ZIP 커밋은 전체 40자리 SHA를 입력해주세요.");
        String status=revision.isEmpty()?"UNVERIFIED":revision.equalsIgnoreCase(headSha)?"DECLARED_HEAD_MATCH":
                revision.equalsIgnoreCase(baseSha)?"DECLARED_BASE_MATCH":"DECLARED_MISMATCH";
        boolean base=status.equals("DECLARED_BASE_MATCH");
        boolean mismatch=status.equals("DECLARED_MISMATCH");
        boolean requested=!verification.status().equals("NOT_REQUESTED");
        boolean verified=verification.status().equals("VERIFIED")&&!mismatch&&verification.revision().equalsIgnoreCase(base?baseSha:headSha);
        if(verified)status=base?"VERIFIED_JAVA_BASE":"VERIFIED_JAVA_HEAD";
        if(requested&&!verified&&!mismatch)status=verification.status().equals("MISMATCH")?"JAVA_CONTENT_MISMATCH":"JAVA_VERIFICATION_UNAVAILABLE";
        boolean blocked=mismatch||requested&&!verified;
        String side=base?"BASE":"HEAD";
        List<String> warnings=new ArrayList<>();
        if(verified)warnings.add("Java 소스 경로·바이트 내용만 검증했습니다. 설정·리소스·의존성·실행 환경은 검증 범위에 포함하지 않습니다.");
        else warnings.add("입력한 ZIP 커밋은 사용자 선언입니다. Java 내용 검증을 완료하지 못했거나 요청하지 않았습니다.");
        if(requested&&!verified)warnings.add(verification.message());
        if(status.equals("UNVERIFIED"))warnings.add("ZIP 버전 미확인: HEAD의 NEW 줄 좌표를 가정합니다. 삭제된 줄은 파일/클래스 후보로만 표시합니다.");
        if(mismatch)warnings.add("입력한 ZIP 커밋이 base/head와 다릅니다. 잘못된 줄 매핑을 피하기 위해 영향 분석을 실행하지 않았습니다.");
        SoftwareGraph graph=analysis.graph(project);
        List<GithubChangeReport.FileMapping> mappings=new ArrayList<>();
        LinkedHashMap<String,ImpactResult> results=new LinkedHashMap<>();
        for(JsonNode file:files){
            String filename=file.path("filename").asText("").replace('\\','/');
            String previous=file.path("previous_filename").asText("").replace('\\','/');
            String change=file.path("status").asText("");
            String mappingStatus,reason;
            List<GraphNode> starts=List.of();
            if(!filename.toLowerCase(Locale.ROOT).endsWith(".java")){
                mappingStatus="SKIPPED_NON_JAVA";reason="Java 정적 분석 대상이 아닙니다.";
            }else if(blocked){
                mappingStatus="UNMAPPED";reason=mismatch?"ZIP 커밋 불일치":"Java 내용 검증 실패: "+verification.message();
            }else{
                String sourcePath=base&&!previous.isBlank()?previous:filename;
                var fileNodes=locator.fileNodes(graph,sourcePath);
                long paths=fileNodes.stream().map(GraphNode::sourcePath).distinct().count();
                if(paths>1){mappingStatus="AMBIGUOUS_PATH";reason="같은 상대 경로에 여러 소스가 있습니다.";}
                else if(fileNodes.isEmpty()){
                    mappingStatus="UNMAPPED";reason="ZIP에서 해당 파일을 찾지 못했습니다. 삭제/추가 여부와 base/head 버전을 확인하세요.";
                }else{
                    var changed=UnifiedDiffParser.changedLines(file.path("patch").asText(""));
                    Set<Integer> lines=base?changed.oldLines():changed.newLines();
                    starts=locator.locateMethods(graph,sourcePath,lines);
                    if(!starts.isEmpty()){
                        mappingStatus="MAPPED_METHOD";reason=side+" 줄 좌표로 메소드 범위를 매핑했습니다.";
                    }else{
                        starts=fileNodes.stream().filter(n->Set.of(NodeType.CONTROLLER,NodeType.SERVICE,NodeType.REPOSITORY,NodeType.ENTITY,NodeType.CLASS,NodeType.TEST).contains(n.type()))
                                .sorted(Comparator.comparingInt(GraphNode::line)).toList();
                        mappingStatus=starts.isEmpty()?"UNMAPPED":"CLASS_FALLBACK";
                        reason=file.path("patch").asText("").isBlank()?"GitHub patch가 없어 파일/클래스 범위로 분석합니다.":
                                lines.isEmpty()?side+"에 변경 줄이 없어 파일/클래스 후보로 분석합니다.":"변경 줄이 메소드 밖에 있어 파일/클래스 범위로 분석합니다.";
                    }
                }
            }
            mappings.add(new GithubChangeReport.FileMapping(filename,previous,change,mappingStatus,reason,starts.stream().map(GraphNode::id).toList()));
            for(GraphNode start:starts)if(!results.containsKey(start.id())){
                ImpactResult result=analysis.impact(project,start.id(),scope,depth);
                results.put(start.id(),result.withExplanation(ai.explain(result)));
            }
        }
        List<ImpactResult> ordered=results.values().stream().sorted(Comparator.comparingInt(ImpactResult::riskScore).reversed().thenComparing(ImpactResult::changedNodeName)).toList();
        return new GithubChangeReport(kind,owner,repo,reference,baseSha,headSha,revision,status,side,warnings,mappings,ordered,summarize(mappings,ordered),verification);
    }

    public static GithubChangeReport.Summary summarize(List<GithubChangeReport.FileMapping> files,List<ImpactResult> results){
        Set<String> starts=new HashSet<>();results.forEach(r->starts.add(r.changedNode()));
        Map<String,ImpactResult.ImpactNode> unique=new LinkedHashMap<>();
        Map<String,Set<String>> testStarts=new LinkedHashMap<>();
        for(ImpactResult result:results){
            for(ImpactResult.ImpactNode n:java.util.stream.Stream.concat(result.directImpact().stream(),result.indirectImpact().stream()).toList()){
                if(starts.contains(n.id()))continue;
                ImpactResult.ImpactNode old=unique.get(n.id());
                if(old==null||n.depth()<old.depth()||n.depth()==old.depth()&&n.confidence()>old.confidence())unique.put(n.id(),n);
                if(n.type().equals("TEST"))testStarts.computeIfAbsent(n.id(),k->new LinkedHashSet<>()).add(result.changedNodeName());
            }
        }
        List<GithubChangeReport.TestCandidate> tests=testStarts.entrySet().stream().map(e->{
            var n=unique.get(e.getKey());return new GithubChangeReport.TestCandidate(n.id(),n.name(),n.sourcePath(),n.line(),n.depth(),n.confidence(),e.getValue().stream().sorted().toList());
        }).sorted(Comparator.comparingInt(GithubChangeReport.TestCandidate::depth)
                .thenComparing(Comparator.comparingDouble(GithubChangeReport.TestCandidate::confidence).reversed())
                .thenComparing(GithubChangeReport.TestCandidate::id)).toList();
        int javaFiles=(int)files.stream().filter(f->!f.mappingStatus().equals("SKIPPED_NON_JAVA")).count();
        int methods=(int)files.stream().filter(f->f.mappingStatus().equals("MAPPED_METHOD")).count();
        int fallback=(int)files.stream().filter(f->f.mappingStatus().equals("CLASS_FALLBACK")).count();
        return new GithubChangeReport.Summary(files.size(),javaFiles,methods,fallback,javaFiles-methods-fallback,starts.size(),unique.size(),
                (int)unique.values().stream().filter(n->!Set.of("METHOD","PROJECT","PACKAGE").contains(n.type())).count(),
                results.stream().mapToInt(ImpactResult::riskScore).max().orElse(0),tests);
    }
}
