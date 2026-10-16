package com.devsphere.ax;

import com.devsphere.ax.graph.SoftwareGraph;
import com.devsphere.ax.impact.ImpactAnalyzer;
import com.devsphere.ax.model.*;
import org.junit.jupiter.api.Test;
import java.util.*;
import java.util.stream.Stream;
import static org.junit.jupiter.api.Assertions.*;

class TestEvidenceBoundaryTest {
    SoftwareGraph graph() {
        var graph=new SoftwareGraph();
        for(var entry:Map.of("a",NodeType.SERVICE,"b",NodeType.SERVICE,"suite",NodeType.TEST,"runA",NodeType.METHOD,"runB",NodeType.METHOD,"check",NodeType.METHOD).entrySet())
            graph.addNode(new GraphNode(entry.getKey(),entry.getKey(),entry.getValue(),entry.getKey()+".java",1,1,Map.of()));
        edge(graph,"a","runA","DECLARES",1);edge(graph,"b","runB","DECLARES",1);
        edge(graph,"suite","check","DECLARES",1);
        edge(graph,"suite","a","TESTS",.9);edge(graph,"suite","b","TESTS",.9);
        edge(graph,"check","runA","CALLS",.95);edge(graph,"check","runB","CALLS",.95);
        return graph;
    }
    void edge(SoftwareGraph g,String from,String to,String type,double confidence){g.addEdge(new GraphEdge(from,to,type,confidence));}
    Set<String> ids(ImpactResult result){return Stream.concat(result.directImpact().stream(),result.indirectImpact().stream()).map(ImpactResult.ImpactNode::id).collect(java.util.stream.Collectors.toSet());}
    @Test void sharedTestClassDoesNotConnectIndependentServices() {
        for(var scope:AnalysisScope.values()) {
            var result=new ImpactAnalyzer().analyze(graph(),"a",scope,null);
            assertTrue(ids(result).contains("suite"));assertFalse(ids(result).contains("b"));
            assertEquals(List.of("suite"),result.tests());
        }
    }
    @Test void directTestCallerRemainsVisibleWithoutCallingUnrelatedProductionCode() {
        for(var scope:AnalysisScope.values()) {
            var result=new ImpactAnalyzer().analyze(graph(),"runA",scope,null);
            assertTrue(ids(result).containsAll(Set.of("check","suite")));
            assertFalse(ids(result).contains("runB"));assertFalse(ids(result).contains("b"));
        }
    }
    @Test void independentProductionPathStillReachesSharedDependency() {
        var graph=graph();edge(graph,"a","b","USES",.6);
        var result=new ImpactAnalyzer().analyze(graph,"a",AnalysisScope.SYSTEM,null);
        assertTrue(ids(result).contains("b"));assertTrue(ids(result).contains("suite"));
        var path=result.paths().stream().filter(p->p.targetId().equals("b")).findFirst().orElseThrow();
        assertEquals(List.of("a","b"),path.steps().stream().map(ImpactResult.PathStep::id).toList());
    }
    @Test void testOnlyChangeDoesNotClaimProductionImpact() {
        for(String start:List.of("check","suite")) {
            var result=new ImpactAnalyzer().analyze(graph(),start,AnalysisScope.SYSTEM,null);
            assertTrue(ids(result).isEmpty());
        }
    }
}
