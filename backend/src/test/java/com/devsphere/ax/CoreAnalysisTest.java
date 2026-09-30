package com.devsphere.ax;

import com.devsphere.ax.analyzer.JavaStaticAnalyzer;
import com.devsphere.ax.graph.GraphBuilder;
import com.devsphere.ax.impact.ImpactAnalyzer;
import com.devsphere.ax.model.NodeType;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

class CoreAnalysisTest {
    @TempDir Path temp;

    @Test
    void parsesSpringStructureAndFindsImpactWithoutProjectExplosion() throws Exception {
        write("src/main/java/demo/OrderController.java", """
                package demo;
                @org.springframework.web.bind.annotation.RestController
                @org.springframework.web.bind.annotation.RequestMapping("/orders")
                class OrderController {
                  private final OrderService orderService = null;
                  @org.springframework.web.bind.annotation.PostMapping
                  Object create(){ return orderService.createOrder(); }
                }
                """);
        write("src/main/java/demo/OrderService.java", """
                package demo;
                @org.springframework.stereotype.Service
                class OrderService {
                  private final OrderRepository repo = null;
                  Object createOrder(){ return repo.save(); }
                }
                """);
        write("src/main/java/demo/OrderRepository.java", """
                package demo;
                @org.springframework.stereotype.Repository
                interface OrderRepository { Object save(); }
                """);
        write("src/test/java/demo/OrderServiceTest.java", """
                package demo;
                class OrderServiceTest { @org.junit.jupiter.api.Test void createOrderWorks(){} }
                """);

        var classes = new JavaStaticAnalyzer().analyzeDirectory(temp);
        var graph = new GraphBuilder().build("test", classes);
        var service = graph.nodes().stream().filter(n -> n.type()== NodeType.SERVICE).findFirst().orElseThrow();
        var result = new ImpactAnalyzer().analyze(graph, service.id(), 2);

        assertTrue(result.apis().contains("POST /orders"));
        assertTrue(result.tests().contains("OrderServiceTest"));
        assertTrue(result.directImpact().stream().noneMatch(n -> n.type().equals("PROJECT")));
        assertFalse(result.riskReasons().isEmpty());
        assertFalse(result.paths().isEmpty());
    }

    private void write(String relative, String text) throws Exception {
        Path path = temp.resolve(relative);
        Files.createDirectories(path.getParent());
        Files.writeString(path, text);
    }
}
