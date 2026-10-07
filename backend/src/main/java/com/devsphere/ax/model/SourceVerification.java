package com.devsphere.ax.model;

import java.util.List;

/** Equality of the complete analyzed Java file set only; never whole-repository verification. */
public record SourceVerification(String status,String revision,String zipPrefix,int localFiles,int repositoryFiles,
        int matchedFiles,int changedFiles,int missingFiles,int extraFiles,String message,List<Difference> differences) {
    public SourceVerification { differences=List.copyOf(differences); }
    public record Difference(String path,String status) {}
    public static SourceVerification unavailable(String revision,String message) {
        return new SourceVerification("UNAVAILABLE",revision,"",0,0,0,0,0,0,message,List.of());
    }
    public static SourceVerification notRequested() {
        return new SourceVerification("NOT_REQUESTED","","",0,0,0,0,0,0,"Java 파일 내용 검증을 요청하지 않았습니다.",List.of());
    }
}
