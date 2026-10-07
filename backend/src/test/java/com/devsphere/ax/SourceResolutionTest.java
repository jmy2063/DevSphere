package com.devsphere.ax;

import com.devsphere.ax.analyzer.JavaStaticAnalyzer;
import com.devsphere.ax.graph.GraphBuilder;
import com.devsphere.ax.graph.SoftwareGraph;
import com.devsphere.ax.model.NodeType;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class SourceResolutionTest {
    @TempDir Path root;
    private void source(String path,String text)throws Exception{
        Path file=root.resolve(path);Files.createDirectories(file.getParent());Files.writeString(file,text);
    }
    private SoftwareGraph graph()throws Exception{return new GraphBuilder().build("regression",new JavaStaticAnalyzer().analyzeDirectory(root));}
    private Set<String> calls(SoftwareGraph graph,String method){
        String id=graph.nodes().stream().filter(n->n.id().equals(method)||n.name().equals(method)).findFirst().orElseThrow().id();
        Set<String> result=new HashSet<>();graph.outgoing(id).stream().filter(e->e.type().equals("CALLS")).forEach(e->result.add(e.target()));return result;
    }
    @Test void recognizesImportedSpringDataButNotAnUnrelatedRepositoryName()throws Exception{
        source("demo/Customer.java","package demo; class Customer {}");
        source("demo/CustomerRepository.java","package demo; import org.springframework.data.repository.CrudRepository; interface CustomerRepository extends CrudRepository<Customer,Long> {}");
        source("other/Fake.java","package other; interface CrudRepository<T> {} interface Fake extends CrudRepository<String> {}");
        var graph=graph();
        assertEquals(NodeType.REPOSITORY,graph.node("class:demo.CustomerRepository").orElseThrow().type());
        assertEquals(NodeType.CLASS,graph.node("class:other.Fake").orElseThrow().type());
        assertTrue(graph.outgoing("class:demo.CustomerRepository").stream().anyMatch(e->e.type().equals("MANAGES")&&e.target().equals("class:demo.Customer")));
    }
    @Test void resolvesImportsSamePackageAndQualifiedTypesWithoutCrossPackageGuessing()throws Exception{
        source("a/Shared.java","package a; class Shared { void work() {} }");
        source("b/Shared.java","package b; class Shared { void work() {} }");
        source("b/Client.java","package b; import a.Shared; class Client { Shared chosen; b.Shared local; missing.Shared absent; void run(){ chosen.work(); local.work(); absent.work(); } }");
        source("b/Neighbor.java","package b; class Neighbor { Shared value; void run(){value.work();} }");
        source("c/Client.java","package c; import a.*; class Client { Shared value; void run(){value.work();} }");
        var graph=graph();
        assertEquals(Set.of("class:a.Shared#work","class:b.Shared#work"),calls(graph,"class:b.Client#run"));
        assertEquals(Set.of("class:b.Shared#work"),calls(graph,"Neighbor.run()"));
        String wildcardId="class:c.Client#run";
        assertTrue(graph.outgoing(wildcardId).stream().anyMatch(e->e.target().equals("class:a.Shared#work")));
    }
    @Test void followsInheritedMethodsKeepsOverloadsAndUsesOverrideDeclarations()throws Exception{
        source("Base.java","class Base { String name(){return null;} void send(String x){} void send(int x){} }");
        source("Child.java","class Child extends Base { String name(){return null;} void send(String x){} void inside(){ name(); } }");
        source("Client.java","class Client { Child child; void run(){child.name();child.send(1);} }");
        var graph=graph();
        Set<String> targets=calls(graph,"Client.run()");
        assertTrue(targets.contains("class:Child#name"));
        assertFalse(targets.contains("class:Base#name"));
        assertTrue(targets.contains("class:Child#send"));
        assertEquals(1,targets.stream().filter(s->s.startsWith("class:Base#send")).count());
        assertEquals(Set.of("class:Child#name"),calls(graph,"Child.inside()"));
    }
    @Test void inheritanceCycleTerminatesWithoutInventingMethods()throws Exception{
        source("A.java","class A extends B { void run(){missing();} }");
        source("B.java","class B extends A {}");
        assertTrue(calls(graph(),"A.run()").isEmpty());
    }
    @Test void readsUtf8SourcesIndependentlyOfWindowsDefaultEncoding()throws Exception{
        source("Unicode.java","class Unicode { String text = \"— snow ☃ 한글\"; }");
        var output=new JavaStaticAnalyzer().analyzeDirectoryDetailed(root);
        assertTrue(output.warnings().isEmpty(),output.warnings().toString());
        assertEquals("Unicode",output.classes().get(0).className);
    }
}
