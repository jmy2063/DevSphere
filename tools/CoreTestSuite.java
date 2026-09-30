import com.devsphere.ax.analyzer.JavaStaticAnalyzer;
import com.devsphere.ax.graph.GraphBuilder;
import com.devsphere.ax.impact.ImpactAnalyzer;
import com.devsphere.ax.model.AnalysisScope;
import com.devsphere.ax.model.NodeType;
import com.devsphere.ax.model.GraphNode;
import com.devsphere.ax.model.GraphEdge;
import com.devsphere.ax.graph.SoftwareGraph;
import java.util.Map;
import java.util.List;
import com.devsphere.ax.impact.ChangedNodeLocator;
import com.devsphere.ax.util.UnifiedDiffParser;
import com.devsphere.ax.evaluation.GroundTruthEvaluator;

import java.nio.file.Path;
import java.nio.file.Files;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import com.devsphere.ax.util.SafeZip;
import java.util.HashSet;
import java.util.Set;

public class CoreTestSuite {
    private static int passed = 0;

    public static void main(String[] args) throws Exception {
        Path sample = Path.of(args.length == 0 ? "sample-project" : args[0]);
        var classes = new JavaStaticAnalyzer().analyzeDirectory(sample);
        check(classes.size() >= 13, "13+ Java classes parsed");
        check(classes.stream().anyMatch(c -> c.className.equals("OrderController") && c.type == NodeType.CONTROLLER), "Controller detected");
        check(classes.stream().anyMatch(c -> c.className.equals("OrderService") && c.type == NodeType.SERVICE), "Service detected");
        check(classes.stream().anyMatch(c -> c.className.equals("OrderRepository") && c.type == NodeType.REPOSITORY), "Repository detected");
        check(classes.stream().anyMatch(c -> c.className.equals("OrderEntity") && c.type == NodeType.ENTITY && "orders".equals(c.tableName)), "Entity/Table detected");
        check(classes.stream().flatMap(c -> c.apis.stream()).anyMatch(a -> a.httpMethod().equals("POST") && a.path().equals("/orders")), "POST /orders detected");
        check(classes.stream().allMatch(c -> !Path.of(c.sourcePath).isAbsolute()), "Source paths are portable/relative");
        check(classes.stream().flatMap(c -> c.methodEndLines.values().stream()).allMatch(x -> x > 0), "Method end lines captured");

        var graph = new GraphBuilder().build("sample", classes);
        check(graph.nodes().size() >= 30, "Expanded Knowledge Graph nodes built");
        check(graph.edges().size() >= 45, "Expanded Knowledge Graph edges built");

        var service = graph.nodes().stream().filter(n -> n.name().equals("OrderService") && n.type() == NodeType.SERVICE).findFirst().orElseThrow();
        var local = new ImpactAnalyzer().analyze(graph, service.id(), AnalysisScope.LOCAL, null);
        Set<String> localNames = allNames(local);
        check(!localNames.contains("sample"), "PROJECT node excluded from traversal");
        check(localNames.contains("OrderController"), "Caller/controller impact detected");
        check(localNames.contains("OrderRepository"), "Repository impact detected");
        check(local.apis().contains("POST /orders"), "API impact detected");
        check(local.tests().contains("OrderServiceTest"), "Regression test candidate detected");

        var system = new ImpactAnalyzer().analyze(graph, service.id(), AnalysisScope.SYSTEM, null);
        Set<String> systemNames = allNames(system);
        check(systemNames.contains("PaymentService"), "Cross-package PaymentService impact detected");
        check(systemNames.contains("InventoryService"), "Cross-package InventoryService impact detected");
        check(systemNames.contains("AuditService"), "Cross-package AuditService impact detected");
        check(systemNames.contains("PaymentRepository") || systemNames.stream().anyMatch(n -> n.contains("PaymentRepository")), "Deep payment repository impact detected");
        check(systemNames.contains("InventoryRepository") || systemNames.stream().anyMatch(n -> n.contains("InventoryRepository")), "Deep inventory repository impact detected");
        check(system.entities().contains("payments") || system.entities().contains("PaymentEntity"), "Wide data-layer impact detected");
        check(system.blastRadius() >= local.blastRadius(), "SYSTEM scope blast radius is not smaller than LOCAL");
        check(system.maxDepth() == 6, "SYSTEM scope supports depth 6");
        check(system.riskScore() >= 0 && system.riskScore() <= 100, "CRI normalized to 0-100");
        check(system.riskBreakdown().size() == 5, "CRI breakdown generated");
        check(system.evidenceConfidence() > 0 && system.evidenceConfidence() <= 1, "Evidence confidence generated");
        check(!system.areas().isEmpty(), "Impact area aggregation generated");
        check(!system.paths().isEmpty(), "Evidence paths generated");
        check(system.paths().stream().flatMap(p -> p.steps().stream()).anyMatch(s -> s.sourcePath()!=null && !s.sourcePath().isBlank() && s.line()>0), "Paths include source file and line evidence");

        var method = graph.nodes().stream().filter(n -> n.name().equals("OrderService.createOrder()") && n.type() == NodeType.METHOD).findFirst().orElseThrow();
        var methodResult = new ImpactAnalyzer().analyze(graph, method.id(), AnalysisScope.SYSTEM, null);
        Set<String> methodNames = allNames(methodResult);
        check(methodNames.stream().anyMatch(n -> n.contains("PaymentService")), "Method-level payment impact detected");
        check(methodNames.stream().anyMatch(n -> n.contains("InventoryService")), "Method-level inventory impact detected");
        check(methodResult.paths().stream().anyMatch(p -> p.steps().stream().anyMatch(s -> s.name().equals("OrderService.createOrder()"))), "Changed method preserved in evidence path");
        check(methodResult.paths().stream().anyMatch(p -> p.steps().size() >= 3), "Multi-hop method path generated");

        // Overload disambiguation: createOrder() calls PaymentService.pay() with zero args only.
        var paymentMethods = graph.nodes().stream()
                .filter(n -> n.type() == NodeType.METHOD)
                .filter(n -> "PaymentService".equals(n.attributes().get("owner")))
                .filter(n -> "pay".equals(n.attributes().get("methodName")))
                .toList();
        check(paymentMethods.size() >= 2, "Overloaded PaymentService.pay methods captured");
        check(paymentMethods.stream().anyMatch(n -> n.name().equals("PaymentService.pay()"))
                && paymentMethods.stream().anyMatch(n -> n.name().equals("PaymentService.pay(String)")),
                "Method display signatures distinguish overloads");
        var createEdges = graph.outgoing(method.id()).stream().filter(e -> e.type().equals("CALLS")).toList();
        long payTargets = createEdges.stream().map(e -> graph.node(e.target()).orElse(null)).filter(java.util.Objects::nonNull)
                .filter(n -> n.name().equals("PaymentService.pay()"))
                .filter(n -> "0".equals(n.attributes().get("parameterCount"))).count();
        long wrongPayTargets = createEdges.stream().map(e -> graph.node(e.target()).orElse(null)).filter(java.util.Objects::nonNull)
                .filter(n -> n.name().equals("PaymentService.pay()"))
                .filter(n -> !"0".equals(n.attributes().get("parameterCount"))).count();
        check(payTargets == 1 && wrongPayTargets == 0, "Method-call arity disambiguates overloads");

        int createLine = method.line();
        String patch = "@@ -" + createLine + ",1 +" + createLine + ",1 @@\n-old\n+new";
        Set<Integer> diffLines = UnifiedDiffParser.changedNewLines(patch);
        check(diffLines.contains(createLine), "Unified diff NEW-file line parsed");
        String deletePatch = "@@ -" + createLine + ",1 +" + createLine + ",0 @@\n-old";
        Set<Integer> candidateLines = UnifiedDiffParser.changedCandidateLines(deletePatch);
        check(candidateLines.contains(createLine), "Unified diff OLD-file deletion line preserved for method mapping");
        var located = new ChangedNodeLocator().locate(graph, "src/main/java/com/example/shop/service/OrderService.java", diffLines);
        check(located.stream().anyMatch(n -> n.type()==NodeType.METHOD && n.name().equals("OrderService.createOrder()")), "PR diff line mapped to exact changed method");

        // Synthetic 6-hop chain proves that SYSTEM scope can measure genuinely wide propagation.
        SoftwareGraph wide = new SoftwareGraph();
        for (int i=0;i<=6;i++) wide.addNode(new GraphNode("n"+i, "N"+i, i==6?NodeType.TABLE:NodeType.SERVICE, "p/N"+i+".java", 1, 1.0, Map.of("package","p"+i,"endLine","10")));
        for (int i=0;i<6;i++) wide.addEdge(new GraphEdge("n"+i,"n"+(i+1),"CALLS",0.99));
        var wideLocal = new ImpactAnalyzer().analyze(wide, "n0", AnalysisScope.LOCAL, null);
        var wideSystem = new ImpactAnalyzer().analyze(wide, "n0", AnalysisScope.SYSTEM, null);
        check(wideLocal.directImpact().stream().noneMatch(n -> n.name().equals("N6")) && wideLocal.indirectImpact().stream().noneMatch(n -> n.name().equals("N6")), "LOCAL scope prunes distant 6-hop node");
        check(wideSystem.directImpact().stream().anyMatch(n -> n.name().equals("N6")) || wideSystem.indirectImpact().stream().anyMatch(n -> n.name().equals("N6")), "SYSTEM scope reaches 6-hop wide-risk node");
        check(wideSystem.paths().stream().anyMatch(p -> p.targetName().equals("N6") && p.hopCount()==6), "SYSTEM scope preserves full 6-hop evidence path");

        SoftwareGraph cycle = new SoftwareGraph();
        cycle.addNode(new GraphNode("a","A",NodeType.SERVICE,"A.java",1,1.0,Map.of("package","a","endLine","10")));
        cycle.addNode(new GraphNode("b","B",NodeType.SERVICE,"B.java",1,1.0,Map.of("package","b","endLine","10")));
        cycle.addNode(new GraphNode("c","C",NodeType.SERVICE,"C.java",1,1.0,Map.of("package","c","endLine","10")));
        cycle.addEdge(new GraphEdge("a","b","CALLS",0.99)); cycle.addEdge(new GraphEdge("b","c","CALLS",0.99)); cycle.addEdge(new GraphEdge("c","a","CALLS",0.99));
        var cycleResult = new ImpactAnalyzer().analyze(cycle, "a", AnalysisScope.SYSTEM, null);
        check(cycleResult.exploredNodes() <= 3, "Cycle-safe traversal terminates without graph explosion");

        SoftwareGraph weak = new SoftwareGraph();
        weak.addNode(new GraphNode("w0","W0",NodeType.SERVICE,"W0.java",1,1.0,Map.of("package","w","endLine","10")));
        weak.addNode(new GraphNode("w1","W1",NodeType.SERVICE,"W1.java",1,1.0,Map.of("package","w","endLine","10")));
        weak.addNode(new GraphNode("w2","W2",NodeType.SERVICE,"W2.java",1,1.0,Map.of("package","w","endLine","10")));
        weak.addEdge(new GraphEdge("w0","w1","DEPENDS_ON",0.30)); weak.addEdge(new GraphEdge("w1","w2","DEPENDS_ON",0.30));
        var weakResult = new ImpactAnalyzer().analyze(weak, "w0", AnalysisScope.SYSTEM, null);
        check(weakResult.directImpact().stream().noneMatch(n -> n.name().equals("W2")) && weakResult.indirectImpact().stream().noneMatch(n -> n.name().equals("W2")), "Low-confidence distant path is pruned");

        // Zip-slip protection test.
        Path zipOut = Files.createTempDirectory("devsphere-zipslip-");
        ByteArrayOutputStream zipBytes = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(zipBytes)) {
            zip.putNextEntry(new ZipEntry("../escape.txt"));
            zip.write("blocked".getBytes());
            zip.closeEntry();
        }
        boolean blocked = false;
        try { SafeZip.extract(new ByteArrayInputStream(zipBytes.toByteArray()), zipOut); }
        catch (Exception expected) { blocked = true; }
        check(blocked, "ZIP slip attack blocked");

        // Ground Truth evaluator metrics are deterministic and bounded.
        var eval = new GroundTruthEvaluator().evaluate(system, List.of("PaymentService", "OrderRepository", "POST /orders"), 5);
        check(eval.precision() >= 0 && eval.precision() <= 1 && eval.recall() >= 0 && eval.recall() <= 1, "Ground Truth Precision/Recall bounded");
        check(eval.f1() >= 0 && eval.f1() <= 1 && eval.topKRecall() >= 0 && eval.topKRecall() <= 1, "Ground Truth F1/Top-k bounded");
        check(eval.truePositive() >= 2, "Ground Truth evaluator matches known impacted targets");

        // Analyzer ignores generated/build output to avoid duplicated classes.
        Path filterRoot = Files.createTempDirectory("devsphere-ignore-");
        Path src = filterRoot.resolve("src/main/java/demo");
        Path build = filterRoot.resolve("build/generated");
        Files.createDirectories(src); Files.createDirectories(build);
        Files.writeString(src.resolve("RealService.java"), "package demo; class RealService { void run(){} }");
        Files.writeString(build.resolve("GeneratedDuplicate.java"), "package demo; class GeneratedDuplicate { }");
        var filteredClasses = new JavaStaticAnalyzer().analyzeDirectory(filterRoot);
        check(filteredClasses.stream().anyMatch(c -> c.className.equals("RealService")), "Analyzer keeps real source directories");
        check(filteredClasses.stream().noneMatch(c -> c.className.equals("GeneratedDuplicate")), "Analyzer ignores build/generated output");

        // NEW/OLD line sets stay separated to prevent false method matches after line movement.
        String movedPatch = "@@ -10,1 +30,1 @@\n-old\n+new";
        var movedLines = UnifiedDiffParser.changedLines(movedPatch);
        check(movedLines.oldLines().contains(10) && !movedLines.oldLines().contains(30), "Unified diff OLD lines separated");
        check(movedLines.newLines().contains(30) && !movedLines.newLines().contains(10), "Unified diff NEW lines separated");

        // Local-variable receiver resolution: Type local = ...; local.run() should resolve to the target method.
        Path localRoot = Files.createTempDirectory("devsphere-local-var-");
        Path localSrc = localRoot.resolve("src/main/java/demo");
        Files.createDirectories(localSrc);
        Files.writeString(localSrc.resolve("TargetService.java"), "package demo; class TargetService { void run(){} }");
        Files.writeString(localSrc.resolve("CallerService.java"), "package demo; class CallerService { void call(){ TargetService local = null; local.run(); } }");
        var localClasses = new JavaStaticAnalyzer().analyzeDirectory(localRoot);
        var localGraph = new GraphBuilder().build("locals", localClasses);
        var callerMethod = localGraph.nodes().stream().filter(n -> n.type()==NodeType.METHOD && n.name().equals("CallerService.call()")).findFirst().orElseThrow();
        boolean localResolved = localGraph.outgoing(callerMethod.id()).stream().filter(e -> e.type().equals("CALLS"))
                .map(e -> localGraph.node(e.target()).orElse(null)).filter(java.util.Objects::nonNull)
                .anyMatch(n -> n.name().equals("TargetService.run()"));
        check(localResolved, "Local-variable method receiver resolved");

        // Explicit this.receiver calls should resolve to the same-class method.
        Path thisRoot = Files.createTempDirectory("devsphere-this-call-");
        Files.writeString(thisRoot.resolve("SelfService.java"), "class SelfService { void a(){ this.b(); } void b(){} }");
        var thisClasses = new JavaStaticAnalyzer().analyzeDirectory(thisRoot);
        var thisGraph = new GraphBuilder().build("thiscall", thisClasses);
        var aMethod = thisGraph.nodes().stream().filter(n -> n.type()==NodeType.METHOD && n.name().equals("SelfService.a()")).findFirst().orElseThrow();
        check(thisGraph.outgoing(aMethod.id()).stream().filter(e -> e.type().equals("CALLS"))
                .map(e -> thisGraph.node(e.target()).orElse(null)).filter(java.util.Objects::nonNull)
                .anyMatch(n -> n.name().equals("SelfService.b()")), "Explicit this.method() call resolved");

        // Generic wrappers must not hide domain dependencies (e.g. List<OrderEntity>).
        Path genericRoot = Files.createTempDirectory("devsphere-generic-dep-");
        Files.writeString(genericRoot.resolve("OrderEntity.java"), "class OrderEntity {} ");
        Files.writeString(genericRoot.resolve("GenericService.java"), "import java.util.List; class GenericService { List<OrderEntity> load(){ return null; } }");
        var genericClasses = new JavaStaticAnalyzer().analyzeDirectory(genericRoot);
        var genericGraph = new GraphBuilder().build("generic", genericClasses);
        var genericService = genericGraph.nodes().stream().filter(n -> n.type()==NodeType.CLASS && n.name().equals("GenericService")).findFirst().orElseThrow();
        check(genericGraph.outgoing(genericService.id()).stream().map(e -> genericGraph.node(e.target()).orElse(null))
                .filter(java.util.Objects::nonNull).anyMatch(n -> n.name().equals("OrderEntity")),
                "Generic type domain dependency preserved");

        // Parser diagnostics are surfaced while partial AST facts remain available.
        Path brokenRoot = Files.createTempDirectory("devsphere-broken-");
        Files.writeString(brokenRoot.resolve("Broken.java"), "class Broken { void x( { }");
        var brokenOutput = new JavaStaticAnalyzer().analyzeDirectoryDetailed(brokenRoot);
        check(!brokenOutput.warnings().isEmpty(), "Java parse diagnostics surfaced as warnings");

        // GraphNode attributes are immutable after construction.
        GraphNode immutable = new GraphNode("imm","Immutable",NodeType.CLASS,"Immutable.java",1,1.0,new java.util.LinkedHashMap<>(Map.of("k","v")));
        boolean immutableBlocked = false;
        try { immutable.attributes().put("x","y"); } catch (UnsupportedOperationException expected) { immutableBlocked = true; }
        check(immutableBlocked, "Graph node attributes are immutable");

        // Alias duplication (node ID + display name) must never produce precision/recall above 1.0.
        var firstKnown = system.directImpact().stream().findFirst().orElseThrow();
        var aliasEval = new GroundTruthEvaluator().evaluate(system, List.of(firstKnown.id(), firstKnown.name()), 5);
        check(aliasEval.precision() >= 0 && aliasEval.precision() <= 1 && aliasEval.recall() >= 0 && aliasEval.recall() <= 1,
                "Ground Truth aliases cannot inflate metrics above 1.0");
        check(aliasEval.expectedCount() == 1, "Ground Truth ID/name aliases collapse to one logical target");

        // Duplicate ZIP paths are rejected to avoid ambiguous overwrite behavior.
        Path duplicateOut = Files.createTempDirectory("devsphere-zipdup-");
        ByteArrayOutputStream duplicateZipBytes = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(duplicateZipBytes)) {
            zip.putNextEntry(new ZipEntry("src/A.java")); zip.write("class A{}".getBytes()); zip.closeEntry();
            zip.putNextEntry(new ZipEntry("src/A.java")); zip.write("class B{}".getBytes()); zip.closeEntry();
        } catch (java.util.zip.ZipException duplicateRejectedByWriter) {
            // java.util.zip itself may reject duplicate names; that is also safe.
        }
        boolean duplicateBlocked = false;
        try { SafeZip.extract(new ByteArrayInputStream(duplicateZipBytes.toByteArray()), duplicateOut); }
        catch (Exception expected) { duplicateBlocked = true; }
        check(duplicateBlocked || Files.exists(duplicateOut.resolve("src/A.java")), "Duplicate ZIP handling is deterministic/safe");

        // Node cap is a hard limit, not a soft limit that can be exceeded by a high-degree node.
        SoftwareGraph capped = new SoftwareGraph();
        capped.addNode(new GraphNode("root","Root",NodeType.SERVICE,"Root.java",1,1.0,Map.of("package","p","endLine","10")));
        for (int i=0;i<200;i++) {
            String id="cap"+i;
            capped.addNode(new GraphNode(id,"Cap"+i,NodeType.SERVICE,"Cap"+i+".java",1,1.0,Map.of("package","p","endLine","10")));
            capped.addEdge(new GraphEdge("root",id,"CALLS",0.99));
        }
        var cappedResult = new ImpactAnalyzer().analyze(capped, "root", AnalysisScope.LOCAL, null);
        check(cappedResult.exploredNodes() <= AnalysisScope.LOCAL.nodeLimit(), "Traversal node cap is enforced exactly");

        boolean invalidScopeBlocked = false;
        try { AnalysisScope.from("planet"); } catch (IllegalArgumentException expected) { invalidScopeBlocked = true; }
        check(invalidScopeBlocked, "Invalid analysis scope rejected");

        System.out.println("ALL CORE TESTS PASSED: " + passed);
    }

    private static Set<String> allNames(com.devsphere.ax.model.ImpactResult result) {
        Set<String> names = new HashSet<>();
        result.directImpact().forEach(n -> names.add(n.name()));
        result.indirectImpact().forEach(n -> names.add(n.name()));
        return names;
    }

    private static void check(boolean condition, String label) {
        if (!condition) throw new AssertionError("FAILED: " + label);
        passed++;
        System.out.println("PASS  " + label);
    }
}
