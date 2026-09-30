package com.devsphere.ax.service;

import com.devsphere.ax.evaluation.GroundTruthEvaluator;
import com.devsphere.ax.model.EvaluationResult;
import com.devsphere.ax.model.ImpactResult;
import org.springframework.stereotype.Service;

import java.util.Collection;

@Service
public class EvaluationService {
    private final GroundTruthEvaluator evaluator = new GroundTruthEvaluator();

    public EvaluationResult evaluate(ImpactResult result, Collection<String> expectedTargets, Integer topK) {
        return evaluator.evaluate(result, expectedTargets, topK);
    }
}
