package com.devsphere.ax;

import com.fasterxml.jackson.databind.*;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import java.io.*;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.zip.*;
import static org.junit.jupiter.api.Assertions.*;

/** Actual embedded server, multipart extraction and JSON serialization; no mocked Spring services. */
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT)
class AnalysisHttpIntegrationTest {
    @LocalServerPort int port;
    private final ObjectMapper mapper=new ObjectMapper();
    private final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private HttpResponse<String> request(String path,String method,String body)throws Exception{
        var builder=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+path)).timeout(Duration.ofSeconds(20));
        if(body!=null)builder.header("Content-Type","application/json");
        return http.send(builder.method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(body)).build(),HttpResponse.BodyHandlers.ofString());
    }
    private HttpResponse<String> upload(String path,String text)throws Exception{
        var zipBytes=new ByteArrayOutputStream();
        try(var zip=new ZipOutputStream(zipBytes)){
            zip.putNextEntry(new ZipEntry(path));zip.write(text.getBytes(StandardCharsets.UTF_8));zip.closeEntry();
        }
        String boundary="devsphereIntegrationBoundary";
        var body=new ByteArrayOutputStream();
        body.write(("--"+boundary+"\r\nContent-Disposition: form-data; name=\"file\"; filename=\"project.zip\"\r\nContent-Type: application/zip\r\n\r\n").getBytes(StandardCharsets.UTF_8));
        body.write(zipBytes.toByteArray());body.write(("\r\n--"+boundary+"--\r\n").getBytes(StandardCharsets.UTF_8));
        var request=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+"/api/analysis/upload"))
                .timeout(Duration.ofSeconds(20)).header("Content-Type","multipart/form-data; boundary="+boundary)
                .POST(HttpRequest.BodyPublishers.ofByteArray(body.toByteArray())).build();
        return http.send(request,HttpResponse.BodyHandlers.ofString());
    }
    @Test void uploadImpactCompareEvaluateAndDeleteThroughHttp()throws Exception{
        assertEquals(200,request("/api/health","GET",null).statusCode());
        var upload=upload("src/demo/Repo.java","package demo; import org.springframework.data.repository.CrudRepository; class Customer {} interface CustomerRepository extends CrudRepository<Customer,Long> { Customer findById(long id); }");
        assertEquals(200,upload.statusCode(),upload.body());
        JsonNode summary=mapper.readTree(upload.body());String project=summary.path("projectId").asText();
        String base="/api/analysis/"+project;
        String payload="{\"nodeId\":\"class:demo.CustomerRepository#findById\",\"scope\":\"LOCAL\"}";
        var impact=request(base+"/impact","POST",payload);assertEquals(200,impact.statusCode(),impact.body());
        JsonNode result=mapper.readTree(impact.body());
        assertEquals("class:demo.CustomerRepository#findById",result.path("changedNode").asText());
        assertTrue(result.path("riskScore").asInt()>=0);
        assertTrue(result.path("paths").isArray());
        var comparison=request(base+"/impact-comparison","POST",payload);assertEquals(200,comparison.statusCode());
        assertEquals(3,mapper.readTree(comparison.body()).size());
        var evaluation=request(base+"/evaluate","POST",payload.substring(0,payload.length()-1)+",\"expectedTargets\":[\"class:demo.Customer\"]}");
        assertEquals(200,evaluation.statusCode(),evaluation.body());
        assertEquals(1,mapper.readTree(evaluation.body()).path("truePositive").asInt());
        assertEquals(400,request(base+"/impact","POST","{\"nodeId\":\"unknown\"}").statusCode());
        assertEquals(200,request(base,"DELETE",null).statusCode());
        assertEquals(400,request(base+"/graph","GET",null).statusCode());
    }
    @Test void unsafeZipIsRejectedByActualUploadEndpoint()throws Exception{
        var response=upload("../Escape.java","class Escape {}");
        assertEquals(400,response.statusCode(),response.body());
        assertEquals("INVALID_PROJECT_ARCHIVE",mapper.readTree(response.body()).path("code").asText());
    }
}
