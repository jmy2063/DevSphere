package com.devsphere.ax;

import com.devsphere.ax.graph.*;
import com.devsphere.ax.service.*;
import com.devsphere.ax.util.SourceFingerprints;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class SourceVerificationTest {
    final ObjectMapper json=new ObjectMapper();
    final String sha="a".repeat(40),other="b".repeat(40);
    @TempDir Path temp;
    ObjectNode tree(Map<String,String> files) {
        var tree=json.createObjectNode();tree.put("truncated",false);tree.put("sha",other);
        var entries=tree.putArray("tree");
        files.forEach((path,hash)->entries.addObject().put("path",path).put("sha",hash).put("type","blob").put("mode","100644"));
        return tree;
    }
    @Test void gitBlobUsesExactBytesAndStandardHeader() {
        assertEquals("e69de29bb2d1d6434b8b29ae775ad8c2e48c5391",SourceFingerprints.gitBlob(new byte[0]));
        assertEquals("ce013625030ba8dba906f756967f9e9ca394464a",SourceFingerprints.gitBlob("hello\n".getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        assertNotEquals(SourceFingerprints.gitBlob("hello\n".getBytes()),SourceFingerprints.gitBlob("hello\r\n".getBytes()));
    }
    @Test void snapshotIncludesJavaWithoutGraphNodesAndExcludesGeneratedFiles()throws Exception {
        Files.writeString(temp.resolve("package-info.java"),"/** 한글 */ package example;");
        Files.writeString(temp.resolve("Service.java"),"class Service {}\n");
        Files.createDirectories(temp.resolve("build"));Files.writeString(temp.resolve("build/Generated.java"),"class Generated {}");
        Files.writeString(temp.resolve("README.md"),"text");
        var manifest=SourceFingerprints.capture(temp);
        assertEquals(Set.of("Service.java","package-info.java"),manifest.keySet());
        assertThrows(UnsupportedOperationException.class,()->manifest.put("extra",sha));
    }
    @Test void verifiesWholeJavaSetWithOneCommonZipWrapper() {
        var result=GithubSourceVerificationService.compare(Map.of("repo-abc/src/A.java",sha,"repo-abc/test/B.java",other),sha,tree(Map.of("src/A.java",sha,"test/B.java",other)));
        assertEquals("VERIFIED",result.status());assertEquals("repo-abc/",result.zipPrefix());assertEquals(2,result.matchedFiles());
        assertEquals("MISMATCH",GithubSourceVerificationService.compare(Map.of("src/A.java",sha),sha,tree(Map.of("src/A.java",sha,"test/B.java",other))).status());
    }
    @Test void distinguishesChangedMissingAndExtraAndDoesNotNormalizeNewlines() {
        var result=GithubSourceVerificationService.compare(Map.of("src/A.java",other,"src/Extra.java",sha),sha,tree(Map.of("src/A.java",sha,"src/Missing.java",other)));
        assertEquals("MISMATCH",result.status());assertEquals(1,result.changedFiles());assertEquals(1,result.missingFiles());assertEquals(1,result.extraFiles());
        assertEquals(Set.of("CONTENT_CHANGED","MISSING_IN_ZIP","EXTRA_IN_ZIP"),result.differences().stream().map(d->d.status()).collect(java.util.stream.Collectors.toSet()));
    }
    @Test void rejectsIncompleteUnsupportedAndAmbiguousComparisons() {
        var truncated=tree(Map.of("A.java",sha));truncated.put("truncated",true);
        assertEquals("UNAVAILABLE",GithubSourceVerificationService.compare(Map.of("A.java",sha),sha,truncated).status());
        var missingFlag=tree(Map.of("A.java",sha));missingFlag.remove("truncated");
        assertEquals("UNAVAILABLE",GithubSourceVerificationService.compare(Map.of("A.java",sha),sha,missingFlag).status());
        var symlink=tree(Map.of("A.java",sha));((ObjectNode)symlink.path("tree").get(0)).put("mode","120000");
        assertEquals("UNAVAILABLE",GithubSourceVerificationService.compare(Map.of("A.java",sha),sha,symlink).status());
        var submodule=tree(Map.of("A.java",sha));((ArrayNode)submodule.path("tree")).addObject().put("path","lib").put("type","commit").put("mode","160000");
        assertEquals("UNAVAILABLE",GithubSourceVerificationService.compare(Map.of("A.java",sha),sha,submodule).status());
        assertEquals("UNAVAILABLE",GithubSourceVerificationService.compare(Map.of("wrap/A.java",sha),sha,tree(Map.of("wrap/A.java",sha,"A.java",sha))).status());
    }
    @Test void capsDifferenceDetailsButRetainsFullCounts() {
        Map<String,String> files=new TreeMap<>();for(int i=0;i<120;i++)files.put("A"+i+".java",sha);
        var result=GithubSourceVerificationService.compare(Map.of("A0.java",other),sha,tree(files));
        assertEquals(1,result.changedFiles());assertEquals(119,result.missingFiles());assertEquals(100,result.differences().size());
    }
    @Test void registryEvictsAndDeletesHashesWithGraph() {
        var registry=new GraphRegistry();Map<String,String> input=new HashMap<>(Map.of("A.java",sha));
        registry.put("first",new SoftwareGraph(),input);input.clear();assertEquals(sha,registry.sourceFingerprints("first").orElseThrow().get("A.java"));
        for(int i=0;i<20;i++)registry.put("p"+i,new SoftwareGraph(),Map.of("A.java",sha));
        assertTrue(registry.get("first").isEmpty());assertTrue(registry.sourceFingerprints("first").isEmpty());
        registry.remove("p19");assertTrue(registry.sourceFingerprints("p19").isEmpty());
    }
    @Test void retrievesCanonicalCommitTreeAndForwardsTokenOnlyToGithub()throws Exception {
        var analysis=mock(AnalysisService.class);var github=mock(GithubService.class);
        when(analysis.sourceFingerprints("p")).thenReturn(Map.of("A.java",sha));
        when(github.commit("o","r",sha,"token")).thenReturn(json.readTree("{\"sha\":\""+sha+"\",\"commit\":{\"tree\":{\"sha\":\""+other+"\"}}}"));
        when(github.tree("o","r",other,"token")).thenReturn(tree(Map.of("A.java",sha)));
        var result=new GithubSourceVerificationService(analysis,github).verify("p","o","r",sha,"token");
        assertEquals("VERIFIED",result.status());verify(github).tree("o","r",other,"token");
    }
}
