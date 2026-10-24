package com.devsphere.ax;

import com.devsphere.ax.graph.SoftwareGraph;
import com.devsphere.ax.impact.ImpactAnalyzer;
import com.devsphere.ax.model.*;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class ControllerApiBoundaryTest {
    SoftwareGraph graph(boolean sharedHelper) {
        var g=new SoftwareGraph();
        var types=Map.of("controller",NodeType.CONTROLLER,"html",NodeType.METHOD,"json",NodeType.METHOD,
                "helper",NodeType.METHOD,"html-api",NodeType.API,"json-api",NodeType.API,
                "unmapped-api",NodeType.API,"test",NodeType.TEST);
        types.forEach((id,type)->g.addNode(new GraphNode(id,id,type,id+".java",1,1,Map.of())));
        for(String method:List.of("html","json","helper"))edge(g,"controller",method,"DECLARES");
        for(String api:List.of("html-api","json-api","unmapped-api"))edge(g,"controller",api,"EXPOSES");
        edge(g,"html-api","html","HANDLED_BY");edge(g,"json-api","json","HANDLED_BY");
        edge(g,"html","helper","CALLS");
        if(sharedHelper)edge(g,"json","helper","CALLS");
        edge(g,"test","controller","TESTS");
        return g;
    }
    void edge(SoftwareGraph g,String a,String b,String type){g.addEdge(new GraphEdge(a,b,type,.99));}
    @Test void methodChangeDoesNotExpandToAnUnrelatedSiblingApi() {
        for(var scope:AnalysisScope.values()){
            var result=new ImpactAnalyzer().analyze(graph(false),"html",scope,null);
            assertTrue(result.apis().contains("html-api"));
            assertFalse(result.apis().contains("json-api"));
            assertTrue(result.tests().contains("test"));
        }
    }
    @Test void helperChangeUsesActualHandlerCallers() {
        for(var scope:AnalysisScope.values()){
            var one=new ImpactAnalyzer().analyze(graph(false),"helper",scope,null);
            assertTrue(one.apis().contains("html-api"));assertFalse(one.apis().contains("json-api"));
            var shared=new ImpactAnalyzer().analyze(graph(true),"helper",scope,null);
            assertTrue(shared.apis().containsAll(List.of("html-api","json-api")));
        }
    }
    @Test void classChangeRetainsAllOfItsApis() {
        var result=new ImpactAnalyzer().analyze(graph(false),"controller",AnalysisScope.LOCAL,null);
        assertTrue(result.apis().containsAll(List.of("html-api","json-api","unmapped-api")));
    }
    @Test void missingHandlerMappingRetainsConservativeApiFallback() {
        var result=new ImpactAnalyzer().analyze(graph(false),"html",AnalysisScope.LOCAL,null);
        assertTrue(result.apis().contains("unmapped-api"));
    }
}
