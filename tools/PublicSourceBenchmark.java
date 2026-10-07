import com.devsphere.ax.analyzer.JavaStaticAnalyzer;
import com.devsphere.ax.graph.*;
import com.devsphere.ax.impact.ImpactAnalyzer;
import com.devsphere.ax.model.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;

/** Source-reviewed assertions on version-pinned official Spring examples, not a complete impact oracle. */
public class PublicSourceBenchmark {
    public static void main(String[] args) throws Exception {
        Path root=Path.of(args.length>0?args[0]:".").toAbsolutePath();
        Map<String,SoftwareGraph> graphs=new HashMap<>();
        List<String> report=new ArrayList<>(List.of("project\tcase\tkind\texpected\tactual\tpass"));
        int count=0,failures=0;
        for(String line:Files.readAllLines(root.resolve("benchmarks/public/assertions.tsv"),StandardCharsets.UTF_8)){
            if(line.isBlank()||line.startsWith("#"))continue;
            String[] c=line.split("\t",-1);
            if(c.length!=6)throw new IllegalArgumentException("Invalid row: "+line);
            String project=c[0];
            if(!graphs.containsKey(project)){
                Path source=root.resolve(".benchmark-cache/"+project+(project.equals("spring-petclinic")?"":"/complete"));
                var parsed=new JavaStaticAnalyzer().analyzeDirectoryDetailed(source);
                if(!parsed.warnings().isEmpty())throw new AssertionError(parsed.warnings());
                graphs.put(project,new GraphBuilder().build(project,parsed.classes()));
            }
            SoftwareGraph graph=graphs.get(project);
            GraphNode from=find(graph,c[3]);
            String actual;
            switch(c[2]){
                case "TYPE" -> actual=from.type().name();
                case "EDGE" -> {
                    GraphNode target=find(graph,c[4]);
                    actual=Boolean.toString(graph.outgoing(from.id()).stream().anyMatch(e->e.target().equals(target.id())&&e.type().equals(c[5])));
                }
                case "IMPACT" -> {
                    GraphNode target=find(graph,c[4]);
                    var impact=new ImpactAnalyzer().analyze(graph,from.id(),AnalysisScope.from(c[5]),null);
                    actual=Boolean.toString(java.util.stream.Stream.concat(impact.directImpact().stream(),impact.indirectImpact().stream()).anyMatch(n->n.id().equals(target.id())));
                }
                default -> throw new IllegalArgumentException("Unknown check: "+c[2]);
            }
            String expected=c[2].equals("TYPE")?c[4]:"true";
            boolean pass=expected.equals(actual);count++;if(!pass)failures++;
            report.add(String.join("\t",project,c[1],c[2],expected,actual,Boolean.toString(pass)));
            System.out.println((pass?"PASS ":"FAIL ")+project+" / "+c[1]+" ("+actual+")");
        }
        Path out=root.resolve("benchmark-output");Files.createDirectories(out);
        Files.write(out.resolve("public-source-results.tsv"),report,StandardCharsets.UTF_8);
        System.out.println("Source-reviewed checks: "+(count-failures)+"/"+count+" across "+graphs.size()+" pinned projects");
        if(failures>0&&!Arrays.asList(args).contains("--record-baseline"))throw new AssertionError(failures+" public-source assertions failed");
    }
    private static GraphNode find(SoftwareGraph graph,String label){
        // FQCN for classes; FQCN#display-signature for methods; exact API/table ID otherwise.
        return graph.nodes().stream().filter(n->label.equals(n.id())||label.equals(n.attributes().get("fqcn"))
                ||label.equals(n.attributes().getOrDefault("ownerFqcn","")+"#"+n.name()))
                .findFirst().orElseThrow(()->new IllegalArgumentException("Unknown benchmark target "+label));
    }
}
