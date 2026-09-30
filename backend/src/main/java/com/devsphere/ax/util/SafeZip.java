package com.devsphere.ax.util;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.*;
import java.util.HashSet;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/** Zip extractor with zip-slip, duplicate-path and basic zip-bomb protections. */
public final class SafeZip {
    private SafeZip() {}

    public static final int MAX_ENTRIES = 5_000;
    public static final int MAX_PATH_DEPTH = 30;
    public static final int MAX_ENTRY_NAME_CHARS = 1_024;
    public static final long MAX_TOTAL_UNCOMPRESSED = 150L * 1024 * 1024;
    public static final long MAX_SINGLE_FILE = 25L * 1024 * 1024;

    public static void extract(InputStream in, Path dest) throws IOException {
        if (in == null) throw new IllegalArgumentException("ZIP input stream is required.");
        Files.createDirectories(dest);
        Path normalizedDest = dest.toAbsolutePath().normalize();
        int entries = 0;
        long total = 0;
        Set<Path> seen = new HashSet<>();

        try (ZipInputStream zis = new ZipInputStream(in)) {
            ZipEntry entry;
            byte[] buffer = new byte[8192];
            while ((entry = zis.getNextEntry()) != null) {
                if (++entries > MAX_ENTRIES) throw new IOException("ZIP contains too many entries (max " + MAX_ENTRIES + ")");
                String entryName = entry.getName().replace('\\', '/');
                if (entryName.isBlank() || entryName.length() > MAX_ENTRY_NAME_CHARS
                        || entryName.startsWith("/") || entryName.contains("\u0000")) {
                    throw new IOException("Invalid ZIP entry name.");
                }
                Path relative = Path.of(entryName).normalize();
                if (relative.getNameCount() > MAX_PATH_DEPTH) throw new IOException("ZIP entry path is nested too deeply: " + entryName);
                Path out = normalizedDest.resolve(relative).normalize();
                if (!out.startsWith(normalizedDest)) throw new IOException("Unsafe ZIP entry: " + entryName);
                if (!seen.add(out)) throw new IOException("Duplicate ZIP entry path: " + entryName);

                if (entry.isDirectory()) {
                    Files.createDirectories(out);
                } else {
                    Path parent = out.getParent();
                    if (parent == null || !parent.startsWith(normalizedDest)) throw new IOException("Invalid ZIP entry parent: " + entryName);
                    Files.createDirectories(parent);
                    long fileBytes = 0;
                    try (var output = Files.newOutputStream(out, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE)) {
                        int read;
                        while ((read = zis.read(buffer)) != -1) {
                            fileBytes += read;
                            total += read;
                            if (fileBytes > MAX_SINGLE_FILE) throw new IOException("ZIP entry too large: " + entryName);
                            if (total > MAX_TOTAL_UNCOMPRESSED) throw new IOException("ZIP expands beyond allowed size");
                            output.write(buffer, 0, read);
                        }
                    }
                }
                zis.closeEntry();
            }
        }
    }
}
