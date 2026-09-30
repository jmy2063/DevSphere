package com.devsphere.ax.model;

import java.util.*;

/** Parsed Java/Spring class facts used by the graph builder. */
public class ClassInfo {
    public String packageName = "";
    public String className = "";
    public String sourcePath = "";
    public int line = 1;
    public int endLine = 1;
    public NodeType type = NodeType.CLASS;
    public String tableName = "";
    public String extendsOrImplements = "";

    /** Simple/FQ type dependencies discovered from fields, constructor and method parameters. */
    public final Set<String> dependencies = new LinkedHashSet<>();
    /** Explicit superclass/interface names for inheritance risk propagation. */
    public final Set<String> superTypes = new LinkedHashSet<>();
    /** Field variable name -> declared type. Useful for resolving receiver.method() calls. */
    public final Map<String, String> fieldTypes = new LinkedHashMap<>();

    /** Unique method key -> start line. A key can be methodName or methodName@line for overloads. */
    public final Map<String, Integer> methodLines = new LinkedHashMap<>();
    /** Unique method key -> end line. */
    public final Map<String, Integer> methodEndLines = new LinkedHashMap<>();
    /** Unique method key -> source-level method name. */
    public final Map<String, String> methodNames = new LinkedHashMap<>();
    /** Unique method key -> number of parameters. */
    public final Map<String, Integer> methodParameterCounts = new LinkedHashMap<>();
    /** Unique method key -> source-level parameter types (simple readable names). */
    public final Map<String, List<String>> methodParameterTypes = new LinkedHashMap<>();
    /** Unique method key -> raw invocation selectors (e.g. orderRepository.save). */
    public final Map<String, Set<String>> methodCalls = new LinkedHashMap<>();
    /** Unique method key -> invocation selector -> observed argument counts. Used to disambiguate overloads. */
    public final Map<String, Map<String, Set<Integer>>> methodCallArgumentCounts = new LinkedHashMap<>();
    /** Unique method key -> variable/parameter name -> declared simple type. Improves receiver.method() resolution. */
    public final Map<String, Map<String, String>> methodVariableTypes = new LinkedHashMap<>();

    public final List<ApiMapping> apis = new ArrayList<>();
    public final List<String> annotations = new ArrayList<>();

    public String fqcn() {
        return packageName == null || packageName.isBlank() ? className : packageName + "." + className;
    }

    public List<String> methodKeysByName(String sourceName) {
        return methodNames.entrySet().stream()
                .filter(e -> Objects.equals(e.getValue(), sourceName))
                .map(Map.Entry::getKey)
                .toList();
    }
}
