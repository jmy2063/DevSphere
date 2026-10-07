package com.devsphere.ax.util;

import com.devsphere.ax.analyzer.JavaStaticAnalyzer;
import java.io.IOException;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;

/** Stores Git blob hashes, never source bodies, for the exact analyzed Java selection. */
public final class SourceFingerprints {
    private SourceFingerprints() {}
    public static Map<String,String> capture(Path root)throws IOException {
        Path normalized=root.toAbsolutePath().normalize();
        Map<String,String> result=new TreeMap<>();
        for(Path file:JavaStaticAnalyzer.sourceFiles(normalized))
            result.put(normalized.relativize(file).toString().replace('\\','/'),gitBlob(Files.readAllBytes(file)));
        return Collections.unmodifiableMap(result);
    }
    public static String gitBlob(byte[] bytes) {
        try {
            MessageDigest digest=MessageDigest.getInstance("SHA-1");
            digest.update(("blob "+bytes.length+"\0").getBytes(StandardCharsets.US_ASCII));
            return HexFormat.of().formatHex(digest.digest(bytes));
        }catch(NoSuchAlgorithmException e){throw new IllegalStateException("Git SHA-1 unavailable",e);}
    }
}
