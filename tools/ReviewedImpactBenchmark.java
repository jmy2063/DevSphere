import com.devsphere.ax.analyzer.JavaStaticAnalyzer;
import com.devsphere.ax.graph.*;
import com.devsphere.ax.impact.ImpactAnalyzer;
import com.devsphere.ax.model.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.stream.Stream;

/** Agent-authored source contracts: labelled-universe checks, not a complete or human-reviewed oracle. */
public class ReviewedImpactBenchmark {
    public static void main(String[] args)throws Exception {
        Path root=Path.of(args.length>0?args[0]:".").toAbsolutePath().normalize();
        boolean baseline=Arrays.asList(args).contains("--record-baseline");
        Path output=root.resolve("benchmark-output");Files.createDirectories(output);
        List<String[]> cases=rows(root.resolve("benchmarks/reviewed/cases.tsv"),6);
        List<String[]> labels=rows(root.resolve("benchmarks/reviewed/labels.tsv"),6);
        Set<String> caseIds=new HashSet<>();
        for(var c:cases)if(!caseIds.add(c[0]))throw new IllegalArgumentException("Duplicate case "+c[0]);
        if(cases.isEmpty()||labels.isEmpty())throw new IllegalArgumentException("No reviewed cases or labels");
        for(var label:labels)if(!caseIds.contains(label[0]))throw new IllegalArgumentException("Unknown label case "+label[0]);
        List<String> results=new ArrayList<>(List.of("case\texpectation\ttarget\tpredicted\tpass\tdepth\tconfidence\tevidence-file\tevidence-line"));
        List<String> summary=new ArrayList<>(List.of("case\tlabelled_tp\tlabelled_fp\tlabelled_fn\tlabelled_tn\tlabelled_precision\tlabelled_recall\tunlabelled_predictions\ttest_candidates\tcri\tinvalid_paths"));
        List<String> predictions=new ArrayList<>(List.of("case\tid\ttype\tname\tdepth\tconfidence\tpath"));
        List<String> provenance=new ArrayList<>();
        int failures=0,total=0;
        for(String[] c:cases) {
            Path repo=root.resolve(".benchmark-cache/"+c[1]);
            Process process=new ProcessBuilder("git","-C",repo.toString(),"rev-parse","HEAD").redirectErrorStream(true).start();
            String actualCommit=new String(process.getInputStream().readAllBytes(),StandardCharsets.UTF_8).trim();
            if(process.waitFor()!=0||!actualCommit.equals(c[2]))throw new IllegalStateException("Pinned source revision changed: "+c[1]);
            Path source=c[1].equals("spring-petclinic")?repo:repo.resolve("complete");
            var parsed=new JavaStaticAnalyzer().analyzeDirectoryDetailed(source);
            if(!parsed.warnings().isEmpty())throw new AssertionError(parsed.warnings());
            var graph=new GraphBuilder().build(c[1],parsed.classes());
            GraphNode changed=find(graph,c[3]);
            var result=new ImpactAnalyzer().analyze(graph,changed.id(),AnalysisScope.from(c[4]),null);
            Map<String,ImpactResult.ImpactNode> predicted=new LinkedHashMap<>();
            Stream.concat(result.directImpact().stream(),result.indirectImpact().stream()).forEach(n->predicted.put(n.id(),n));
            int tp=0,fp=0,fn=0,tn=0;Set<String> labelled=new HashSet<>();
            for(String[] label:labels)if(label[0].equals(c[0])) {
                GraphNode target=find(graph,label[2]);
                if(!labelled.add(target.id()))throw new IllegalArgumentException("Duplicate label: "+label[2]);
                Path evidence=source.resolve(label[3]).normalize();
                if(!evidence.startsWith(source))throw new IllegalArgumentException("Evidence path escapes source");
                List<String> lines=Files.readAllLines(evidence,StandardCharsets.UTF_8);int line=0;
                for(int i=0;i<lines.size();i++)if(lines.get(i).contains(label[4])){line=i+1;break;}
                if(line==0)throw new IllegalArgumentException("Evidence excerpt not found: "+label[3]+" / "+label[4]);
                boolean include=switch(label[1]){case "INCLUDE"->true;case "EXCLUDE"->false;default->throw new IllegalArgumentException(label[1]);};
                var node=predicted.get(target.id());boolean present=node!=null,pass=present==include;
                if(include){if(present)tp++;else fn++;}else{if(present)fp++;else tn++;}
                total++;if(!pass)failures++;
                results.add(String.join("\t",c[0],label[1],label[2],Boolean.toString(present),Boolean.toString(pass),node==null?"":Integer.toString(node.depth()),node==null?"":Double.toString(node.confidence()),label[3],Integer.toString(line)));
            }
            Map<String,String> paths=new HashMap<>();int invalid=0;
            for(var path:result.paths()) {
                var steps=path.steps();
                boolean valid=!steps.isEmpty()&&steps.get(0).id().equals(changed.id())&&steps.get(steps.size()-1).id().equals(path.targetId());
                for(int i=1;i<steps.size();i++) {
                    String from=steps.get(i-1).id(),to=steps.get(i).id();
                    valid&=graph.edges().stream().anyMatch(e->e.source().equals(from)&&e.target().equals(to)||e.source().equals(to)&&e.target().equals(from));
                }
                if(!valid)invalid++;
                paths.put(path.targetId(),String.join(" -> ",steps.stream().map(ImpactResult.PathStep::id).toList()));
            }
            failures+=invalid;
            if(tp+fn==0||fp+tn==0)throw new IllegalArgumentException("Each case requires positive and negative labels: "+c[0]);
            for(var node:predicted.values())predictions.add(String.join("\t",c[0],node.id(),node.type(),node.name(),Integer.toString(node.depth()),Double.toString(node.confidence()),paths.getOrDefault(node.id(),"not-in-representative-paths")));
            int unlabelled=(int)predicted.keySet().stream().filter(id->!labelled.contains(id)).count();
            double precision=tp+fp==0?1:(double)tp/(tp+fp),recall=tp+fn==0?1:(double)tp/(tp+fn);
            summary.add(String.join("\t",c[0],""+tp,""+fp,""+fn,""+tn,""+precision,""+recall,""+unlabelled,""+result.tests().size(),""+result.riskScore(),""+invalid));
            provenance.add(c[0]+"\t"+c[1]+"\t"+actualCommit);
            System.out.println(c[0]+": labelled TP="+tp+" FP="+fp+" FN="+fn+" TN="+tn+"; unlabelled="+unlabelled+"; tests="+result.tests().size()+"; CRI="+result.riskScore());
        }
        for(String file:List.of("backend/src/main/java/com/devsphere/ax/impact/ImpactAnalyzer.java","benchmarks/reviewed/cases.tsv","benchmarks/reviewed/labels.tsv"))
            provenance.add("sha256\t"+file+"\t"+HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(root.resolve(file)))));
        Files.write(output.resolve("reviewed-label-results.tsv"),results,StandardCharsets.UTF_8);
        Files.write(output.resolve("reviewed-summary.tsv"),summary,StandardCharsets.UTF_8);
        Files.write(output.resolve("reviewed-predictions.tsv"),predictions,StandardCharsets.UTF_8);
        Files.write(output.resolve("reviewed-provenance.tsv"),provenance,StandardCharsets.UTF_8);
        System.out.println("Reviewed source contracts: "+cases.size()+" cases / "+total+" labels / "+failures+" failures. Metrics apply only to labelled targets; independent human review is pending.");
        if(failures>0&&!baseline)throw new AssertionError("Reviewed source contract regression: "+failures);
    }
    private static List<String[]> rows(Path path,int columns)throws Exception {
        List<String[]> result=new ArrayList<>();
        for(String line:Files.readAllLines(path,StandardCharsets.UTF_8))if(!line.isBlank()&&!line.startsWith("#")) {
            String[] row=line.split("\t",-1);if(row.length!=columns)throw new IllegalArgumentException("Invalid row in "+path);result.add(row);
        }
        return result;
    }
    private static GraphNode find(SoftwareGraph graph,String label) {
        var matches=graph.nodes().stream().filter(n->label.equals(n.id())||label.equals(n.attributes().get("fqcn"))||label.equals(n.attributes().getOrDefault("ownerFqcn","")+"#"+n.name())).toList();
        if(matches.size()!=1)throw new IllegalArgumentException("Expected one exact target: "+label+", found "+matches.size());return matches.get(0);
    }
}
