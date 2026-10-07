package com.devsphere.ax.model;

import java.util.List;

/** Additive GitHub report with explicit Java source verification scope. */
public record GithubChangeReport(String kind,String owner,String repo,String reference,
        String baseSha,String headSha,String declaredRevision,String revisionStatus,String mappingSide,
        List<String> warnings,List<FileMapping> files,List<ImpactResult> results,Summary summary,SourceVerification sourceVerification) {
    public GithubChangeReport {
        warnings=List.copyOf(warnings);files=List.copyOf(files);results=List.copyOf(results);
    }
    public record FileMapping(String filename,String previousFilename,String changeStatus,
            String mappingStatus,String reason,List<String> startNodeIds) {
        public FileMapping { startNodeIds=List.copyOf(startNodeIds); }
    }
    public record Summary(int changedFiles,int javaFiles,int methodMappedFiles,int fallbackFiles,
            int unmappedJavaFiles,int changedStarts,int uniqueImpactNodes,int uniqueStructuralNodes,
            int maxStartRiskScore,List<TestCandidate> tests) {
        public Summary { tests=List.copyOf(tests); }
    }
    public record TestCandidate(String id,String name,String sourcePath,int line,int depth,
            double confidence,List<String> changedStarts) {
        public TestCandidate { changedStarts=List.copyOf(changedStarts); }
    }
}
