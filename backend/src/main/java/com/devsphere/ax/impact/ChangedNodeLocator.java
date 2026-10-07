package com.devsphere.ax.impact;

import com.devsphere.ax.graph.SoftwareGraph;
import com.devsphere.ax.model.GraphNode;
import com.devsphere.ax.model.NodeType;

import java.util.*;

/** Maps a changed source file/line set to the most precise graph start nodes. */
public class ChangedNodeLocator {
    public List<GraphNode> locate(SoftwareGraph graph, String filename, Set<Integer> changedLines) {
        List<GraphNode> fileNodes = fileNodes(graph,filename);

        if (changedLines != null && !changedLines.isEmpty()) {
            List<GraphNode> methods = fileNodes.stream()
                    .filter(n -> n.type() == NodeType.METHOD)
                    .filter(n -> overlaps(n, changedLines))
                    .sorted(Comparator.comparingInt(GraphNode::line))
                    .toList();
            if (!methods.isEmpty()) return methods;
        }

        return fileNodes.stream().filter(n -> switch (n.type()) {
            case CONTROLLER, SERVICE, REPOSITORY, ENTITY, CLASS, TEST -> true;
            default -> false;
        }).sorted(Comparator.comparingInt(GraphNode::line)).limit(1).toList();
    }

    public List<GraphNode> fileNodes(SoftwareGraph graph,String filename){
        if(filename==null||filename.isBlank())return List.of();
        String normalized=filename.replace('\\','/');
        return graph.nodes().stream().filter(n->n.sourcePath()!=null&&!n.sourcePath().isBlank())
                .filter(n->n.sourcePath().replace('\\','/').equals(normalized)||n.sourcePath().replace('\\','/').endsWith("/"+normalized)).toList();
    }

    public List<GraphNode> locateMethods(SoftwareGraph graph,String filename,Set<Integer> lines){
        if(lines==null||lines.isEmpty())return List.of();
        return fileNodes(graph,filename).stream().filter(n->n.type()==NodeType.METHOD&&overlaps(n,lines))
                .sorted(Comparator.comparingInt(GraphNode::line)).toList();
    }

    private boolean overlaps(GraphNode node, Set<Integer> changedLines) {
        int end = node.line();
        try { end = Integer.parseInt(node.attributes().getOrDefault("endLine", Integer.toString(node.line()))); }
        catch (NumberFormatException ignored) {}
        for (int line : changedLines) if (line >= node.line() && line <= end) return true;
        return false;
    }
}
