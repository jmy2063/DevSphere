package com.devsphere.ax;

import com.devsphere.ax.util.SafeZip;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.file.Path;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.junit.jupiter.api.Assertions.assertThrows;

class SafeZipTest {
    @TempDir Path temp;

    @Test
    void blocksZipSlip() throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(bytes)) {
            zip.putNextEntry(new ZipEntry("../outside.txt"));
            zip.write("bad".getBytes());
            zip.closeEntry();
        }
        assertThrows(Exception.class, () -> SafeZip.extract(new ByteArrayInputStream(bytes.toByteArray()), temp));
    }
}
