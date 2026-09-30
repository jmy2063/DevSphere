import com.devsphere.ax.analyzer.JavaStaticAnalyzer;
import com.devsphere.ax.graph.GraphBuilder;
import com.devsphere.ax.impact.ImpactAnalyzer;
import com.devsphere.ax.model.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;

/**
 * Dependency-free fallback demo. Requires only a JDK.
 * It runs the real core analyzer and exports an HTML report that can be opened in any browser.
 */
public class StandaloneReport {
    public static void main(String[] args) throws Exception {
        Path project = args.length > 0 ? Path.of(args[0]) : Path.of("sample-project");
        Path output = args.length > 1 ? Path.of(args[1]) : Path.of("demo-output/DevSphere_AX_Report.html");
        if (!Files.isDirectory(project)) throw new IllegalArgumentException("Project directory not found: " + project);

        var classes = new JavaStaticAnalyzer().analyzeDirectory(project);
        var graph = new GraphBuilder().build("standalone", classes);
        var changed = selectChangedNode(graph);
        var result = new ImpactAnalyzer().analyze(graph, changed.id(), AnalysisScope.SYSTEM, null);

        Path parent = output.toAbsolutePath().normalize().getParent();
        if (parent != null) Files.createDirectories(parent);
        Files.writeString(output, html(classes.size(), graph.nodes().size(), graph.edges().size(), result), StandardCharsets.UTF_8);
        System.out.println("REPORT GENERATED: " + output.toAbsolutePath().normalize());
        System.out.printf(Locale.ROOT, "changed=%s scope=%s CRI=%d level=%s blastRadius=%d evidence=%.0f%% paths=%d%n",
                result.changedNodeName(), result.scope(), result.riskScore(), result.riskLevel(), result.blastRadius(),
                result.evidenceConfidence()*100, result.paths().size());
    }

    private static GraphNode selectChangedNode(com.devsphere.ax.graph.SoftwareGraph graph) {
        return graph.nodes().stream()
                .filter(n -> n.type() == NodeType.METHOD && n.name().equals("OrderService.createOrder()"))
                .findFirst()
                .orElseGet(() -> graph.nodes().stream().filter(n -> n.type() == NodeType.SERVICE).findFirst()
                        .orElseGet(() -> graph.nodes().stream().filter(n -> n.type() != NodeType.PROJECT && n.type() != NodeType.PACKAGE)
                                .findFirst().orElseThrow()));
    }

    private static String html(int classes, int nodes, int edges, ImpactResult r) {
        StringBuilder paths = new StringBuilder();
        for (var p : r.paths().stream().limit(18).toList()) {
            String chain = p.steps().stream().map(s -> esc(s.name()) + location(s)).reduce((a,b)->a+" <span class='arrow'>→</span> "+b).orElse("");
            paths.append("<div class='path'><div><b>").append(esc(p.targetName())).append("</b> <span class='pill'>")
                    .append(esc(p.targetType())).append("</span></div><div class='chain'>").append(chain)
                    .append("</div><div class='muted'>Path confidence: ").append(Math.round(p.pathConfidence()*100)).append("%</div></div>");
        }
        StringBuilder reasons = new StringBuilder();
        for (String s : r.riskReasons()) reasons.append("<li>").append(esc(s)).append("</li>");
        StringBuilder breakdown = new StringBuilder();
        r.riskBreakdown().entrySet().stream().sorted(Map.Entry.comparingByKey()).forEach(e -> breakdown.append("<tr><td>")
                .append(esc(e.getKey())).append("</td><td><b>").append(e.getValue()).append("</b></td></tr>"));
        StringBuilder areas = new StringBuilder();
        for (var a : r.areas()) areas.append("<div class='metric'><span>").append(esc(a.category())).append("</span><strong>")
                .append(a.count()).append("</strong><small>max depth ").append(a.maxDepth()).append("</small></div>");

        String css = ":root{--navy:#0b1f3a;--blue:#1d5fd0;--teal:#11a7a2;--bg:#f5f8fc;--line:#dce7f3;--text:#162235;--muted:#627086}"
                + "*{box-sizing:border-box}body{margin:0;font-family:Inter,Pretendard,'Noto Sans KR',Arial,sans-serif;background:var(--bg);color:var(--text)}"
                + ".wrap{max-width:1180px;margin:0 auto;padding:40px 24px 72px}.hero{background:linear-gradient(135deg,#07182e,#123d70);color:#fff;border-radius:24px;padding:34px;box-shadow:0 18px 50px #0b1f3a22}"
                + ".eyebrow{font-size:12px;letter-spacing:.16em;color:#72e2dc;font-weight:800}.hero h1{font-size:36px;margin:8px 0}.hero p{opacity:.86;margin:0}"
                + ".grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:18px}.metric{background:#fff;border:1px solid var(--line);border-radius:16px;padding:18px;display:flex;flex-direction:column;gap:5px}"
                + ".metric span{font-size:12px;color:var(--muted);font-weight:700}.metric strong{font-size:27px;color:var(--navy)}.metric small{color:var(--muted)}"
                + ".two{display:grid;grid-template-columns:1.15fr .85fr;gap:18px;margin-top:18px}.card{background:#fff;border:1px solid var(--line);border-radius:20px;padding:22px}.card h2{margin:0 0 14px;color:var(--navy);font-size:18px}"
                + ".risk{display:flex;align-items:end;gap:14px}.score{font-size:58px;line-height:1;font-weight:900;color:var(--blue)}.level{font-size:20px;font-weight:800;color:var(--teal)}.muted{color:var(--muted);font-size:12px}"
                + ".pill{display:inline-block;border-radius:999px;background:#e8f1ff;color:#1d5fd0;font-weight:700;font-size:11px;padding:3px 8px}.areas{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}"
                + "table{width:100%;border-collapse:collapse}td{padding:9px;border-bottom:1px solid #edf2f7}.path{border:1px solid var(--line);border-radius:14px;padding:14px;margin:10px 0}.chain{margin:9px 0;font-size:13px;line-height:1.8}"
                + ".arrow{color:var(--teal);font-weight:900}ul{padding-left:20px;line-height:1.7}.footer{margin-top:22px;color:var(--muted);font-size:12px;text-align:center}@media(max-width:800px){.grid,.areas,.two{grid-template-columns:1fr}.hero h1{font-size:30px}}";

        StringBuilder sb = new StringBuilder(16000);
        sb.append("<!doctype html><html lang='ko'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>")
          .append("<title>DevSphere AX Standalone Report</title><style>").append(css).append("</style></head><body><div class='wrap'>")
          .append("<div class='hero'><div class='eyebrow'>DEVSPHERE AX · STANDALONE VERIFIED CORE</div><h1>Software Change Impact Report</h1><p>Graph가 영향 사실과 경로를 찾고, AI는 그 근거를 설명합니다.</p></div>")
          .append("<div class='grid'><div class='metric'><span>Classes</span><strong>").append(classes).append("</strong></div>")
          .append("<div class='metric'><span>Graph Nodes</span><strong>").append(nodes).append("</strong></div>")
          .append("<div class='metric'><span>Graph Edges</span><strong>").append(edges).append("</strong></div>")
          .append("<div class='metric'><span>Scope</span><strong>").append(esc(r.scope())).append("</strong></div></div>")
          .append("<div class='two'><div class='card'><h2>Change Risk Index</h2><div class='risk'><div class='score'>").append(r.riskScore()).append("</div>")
          .append("<div><div class='level'>").append(esc(r.riskLevel())).append("</div><div class='muted'>상대 변경 위험지수 · 장애 확률이 아님</div></div></div>")
          .append("<p><b>Changed:</b> ").append(esc(r.changedNodeName())).append("</p>")
          .append("<p><b>Blast Radius:</b> ").append(r.blastRadius()).append(" · <b>Evidence:</b> ").append(Math.round(r.evidenceConfidence()*100)).append("% · <b>Paths:</b> ").append(r.paths().size()).append("</p>")
          .append("<ul>").append(reasons).append("</ul></div><div class='card'><h2>Risk Breakdown</h2><table>").append(breakdown).append("</table></div></div>")
          .append("<div class='card' style='margin-top:18px'><h2>Impact Areas</h2><div class='areas'>").append(areas).append("</div></div>")
          .append("<div class='card' style='margin-top:18px'><h2>Evidence Paths</h2>").append(paths).append("</div>")
          .append("<div class='card' style='margin-top:18px'><h2>Grounded Explanation</h2><p>").append(esc(r.explanation())).append("</p></div>")
          .append("<div class='footer'>Generated ").append(esc(Instant.now().toString())).append(" · DevSphere AX 4.0 QA</div></div></body></html>");
        return sb.toString();
    }

    private static String location(ImpactResult.PathStep s) {
        if (s.sourcePath() == null || s.sourcePath().isBlank()) return "";
        return " <span class='muted'>[" + esc(s.sourcePath()) + ":" + s.line() + "-" + s.endLine() + "]</span>";
    }

    private static String esc(String s) {
        if (s == null) return "";
        return s.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace("\"","&quot;").replace("'","&#39;");
    }
}
