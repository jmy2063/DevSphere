package com.devsphere.ax;

import com.devsphere.ax.graph.*;
import com.devsphere.ax.model.*;
import com.devsphere.ax.service.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class GithubChangeReportTest {
    private final ObjectMapper json=new ObjectMapper();
    private static final String BASE="a".repeat(40),HEAD="b".repeat(40);
    private SoftwareGraph graph(){
        var graph=new SoftwareGraph();
        graph.addNode(new GraphNode("owner","Service",NodeType.SERVICE,"src/Service.java",1,1,Map.of("endLine","70")));
        graph.addNode(new GraphNode("old","Service.old()",NodeType.METHOD,"src/Service.java",10,1,Map.of("endLine","12")));
        graph.addNode(new GraphNode("new","Service.new()",NodeType.METHOD,"src/Service.java",40,1,Map.of("endLine","42")));
        return graph;
    }
    private GithubChangeReport run(SoftwareGraph graph,String revision,String files)throws Exception{
        return run(graph,revision,files,SourceVerification.notRequested());
    }
    private GithubChangeReport run(SoftwareGraph graph,String revision,String files,SourceVerification verification)throws Exception{
        var analysis=mock(AnalysisService.class);var ai=mock(AiExplanationService.class);
        when(analysis.graph("project")).thenReturn(graph);
        when(analysis.impact(eq("project"),anyString(),any(),isNull())).thenAnswer(call->result(call.getArgument(1),List.of()));
        when(ai.explain(any())).thenReturn("explanation");
        return new GithubChangeAnalysisService(analysis,ai).analyze("project","PR","o","r","1",BASE,HEAD,revision,json.readTree(files),AnalysisScope.LOCAL,null,verification);
    }
    private ImpactResult result(String start,List<ImpactResult.ImpactNode> nodes){
        return new ImpactResult(start,start,"LOCAL",nodes,List.of(),List.of(),List.of(),List.of(),List.of(),50,"HIGH",List.of(),Map.of(),.9,1,2,3,List.of(),"");
    }
    @Test void keepsOldAndNewCoordinatesSeparate()throws Exception{
        String files="[{\"filename\":\"src/Service.java\",\"patch\":\"@@ -10,1 +40,1 @@\\n-old\\n+new\"}]";
        assertEquals(List.of("new"),run(graph(),HEAD,files).files().get(0).startNodeIds());
        assertEquals(List.of("old"),run(graph(),BASE,files).files().get(0).startNodeIds());
        var assumed=run(graph(),"",files);
        assertEquals("UNVERIFIED",assumed.revisionStatus());
        assertEquals(List.of("new"),assumed.files().get(0).startNodeIds());
    }
    @Test void mismatchDoesNotProduceImpactsAndEmptyPatchIsExplicitFallback()throws Exception{
        var mismatch=run(graph(),"c".repeat(40),"[{\"filename\":\"src/Service.java\"}]");
        assertTrue(mismatch.results().isEmpty());assertEquals(1,mismatch.summary().unmappedJavaFiles());
        var fallback=run(graph(),HEAD,"[{\"filename\":\"src/Service.java\"},{\"filename\":\"README.md\"},{\"filename\":\"src/Missing.java\"}]");
        assertEquals(List.of("CLASS_FALLBACK","SKIPPED_NON_JAVA","UNMAPPED"),fallback.files().stream().map(GithubChangeReport.FileMapping::mappingStatus).toList());
        assertEquals(1,fallback.summary().fallbackFiles());assertEquals(1,fallback.summary().unmappedJavaFiles());
    }
    @Test void renameOnBaseUsesPreviousPathAndDeletionNeverMapsOldLineToHead()throws Exception{
        var rename=run(graph(),BASE,"[{\"filename\":\"src/Renamed.java\",\"previous_filename\":\"src/Service.java\",\"patch\":\"@@ -10,1 +40,1 @@\\n-old\\n+new\"}]");
        assertEquals(List.of("old"),rename.files().get(0).startNodeIds());
        var deletion=run(graph(),HEAD,"[{\"filename\":\"src/Service.java\",\"patch\":\"@@ -10,1 +40,0 @@\\n-old\"}]");
        assertEquals("CLASS_FALLBACK",deletion.files().get(0).mappingStatus());
        assertEquals(List.of("owner"),deletion.files().get(0).startNodeIds());
    }
    @Test void rejectsAmbiguousSuffixPathsAndInvalidRevision()throws Exception{
        var graph=graph();
        graph.addNode(new GraphNode("duplicate","Other",NodeType.CLASS,"copy/src/Service.java",1,1,Map.of()));
        assertEquals(2,new com.devsphere.ax.impact.ChangedNodeLocator().fileNodes(graph,"src/Service.java").stream().map(GraphNode::sourcePath).distinct().count());
        assertEquals("AMBIGUOUS_PATH",run(graph,HEAD,"[{\"filename\":\"src/Service.java\"}]").files().get(0).mappingStatus());
        assertThrows(IllegalArgumentException.class,()->run(graph(),"short","[]"));
    }
    @Test void deduplicatesByNodeIdExcludesStartsAndRanksTestEvidence(){
        var near=new ImpactResult.ImpactNode("test","SameName","TEST",1,"TESTS","UPSTREAM",.8,"Test.java",1,2);
        var far=new ImpactResult.ImpactNode("test","SameName","TEST",3,"TESTS","UPSTREAM",.9,"Test.java",1,2);
        var other=new ImpactResult.ImpactNode("other","SameName","TEST",2,"TESTS","UPSTREAM",.9,"Other.java",1,2);
        var changed=new ImpactResult.ImpactNode("B","B","METHOD",1,"CALLS","UPSTREAM",.9,"B.java",1,2);
        var summary=GithubChangeAnalysisService.summarize(List.of(),List.of(result("A",List.of(near,changed)),result("B",List.of(far,other))));
        assertEquals(2,summary.uniqueImpactNodes());assertEquals(2,summary.tests().size());
        assertEquals("test",summary.tests().get(0).id());assertEquals(1,summary.tests().get(0).depth());
        assertEquals(List.of("A","B"),summary.tests().get(0).changedStarts());
        assertEquals(50,summary.maxStartRiskScore());
    }
    @Test void contentVerificationControlsAnalysisAndKeepsBaseCoordinates()throws Exception {
        String files="[{\"filename\":\"src/Service.java\",\"patch\":\"@@ -10,1 +40,1 @@\\n-old\\n+new\"}]";
        var mismatch=new SourceVerification("MISMATCH",HEAD,"",1,1,0,1,0,0,"changed",List.of());
        var blocked=run(graph(),HEAD,files,mismatch);
        assertTrue(blocked.results().isEmpty());assertEquals("JAVA_CONTENT_MISMATCH",blocked.revisionStatus());
        var unavailable=run(graph(),HEAD,files,SourceVerification.unavailable(HEAD,"truncated"));
        assertTrue(unavailable.results().isEmpty());assertEquals("JAVA_VERIFICATION_UNAVAILABLE",unavailable.revisionStatus());
        var verified=new SourceVerification("VERIFIED",BASE,"",1,1,1,0,0,0,"match",List.of());
        var base=run(graph(),BASE,files,verified);
        assertEquals("VERIFIED_JAVA_BASE",base.revisionStatus());assertEquals(List.of("old"),base.files().get(0).startNodeIds());
    }
}
