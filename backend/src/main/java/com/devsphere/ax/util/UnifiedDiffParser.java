package com.devsphere.ax.util;

import java.util.LinkedHashSet;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Unified-diff line mapper for GitHub patches. */
public final class UnifiedDiffParser {
    private static final Pattern HUNK = Pattern.compile("@@ -(\\d+)(?:,(\\d+))? \\+(\\d+)(?:,(\\d+))? @@");
    private UnifiedDiffParser() {}

    /** Added/modified line positions in the NEW file. */
    public static Set<Integer> changedNewLines(String patch) {
        return changedLines(patch).newLines();
    }

    /** Deleted/modified line positions in the OLD file. */
    public static Set<Integer> changedOldLines(String patch) {
        return changedLines(patch).oldLines();
    }

    /**
     * Backward-compatible union used by older tools/tests. Prefer changedLines() for precise head/base mapping.
     */
    public static Set<Integer> changedCandidateLines(String patch) {
        ChangedLines parsed = changedLines(patch);
        LinkedHashSet<Integer> union = new LinkedHashSet<>(parsed.newLines());
        union.addAll(parsed.oldLines());
        return Set.copyOf(union);
    }

    /**
     * Separates new-file additions from old-file deletions. This avoids mapping an OLD line number to an unrelated
     * method in a HEAD checkout when both sides of a diff moved substantially.
     */
    public static ChangedLines changedLines(String patch) {
        if (patch == null || patch.isBlank()) return new ChangedLines(Set.of(), Set.of());
        LinkedHashSet<Integer> newLines = new LinkedHashSet<>();
        LinkedHashSet<Integer> oldLines = new LinkedHashSet<>();
        int oldLine = -1;
        int newLine = -1;
        for (String line : patch.split("\\R", -1)) {
            Matcher matcher = HUNK.matcher(line);
            if (matcher.find()) {
                oldLine = Integer.parseInt(matcher.group(1));
                newLine = Integer.parseInt(matcher.group(3));
                continue;
            }
            if (oldLine < 0 || newLine < 0) continue;
            if (line.startsWith("+") && !line.startsWith("+++")) {
                newLines.add(newLine++);
            } else if (line.startsWith("-") && !line.startsWith("---")) {
                oldLines.add(oldLine++);
            } else if (!line.startsWith("\\ No newline")) {
                oldLine++;
                newLine++;
            }
        }
        return new ChangedLines(Set.copyOf(newLines), Set.copyOf(oldLines));
    }

    public record ChangedLines(Set<Integer> newLines, Set<Integer> oldLines) {
        public ChangedLines {
            newLines = newLines == null ? Set.of() : Set.copyOf(newLines);
            oldLines = oldLines == null ? Set.of() : Set.copyOf(oldLines);
        }
    }
}
