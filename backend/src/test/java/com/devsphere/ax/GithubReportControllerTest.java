package com.devsphere.ax;

import com.devsphere.ax.api.*;
import com.devsphere.ax.model.AnalysisScope;
import com.devsphere.ax.service.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class GithubReportControllerTest {
    final ObjectMapper json=new ObjectMapper();
    final GithubService github=mock(GithubService.class);
    final GithubChangeAnalysisService reports=mock(GithubChangeAnalysisService.class);
    final AnalysisController controller=new AnalysisController(mock(AnalysisService.class),mock(AiExplanationService.class),github,mock(EvaluationService.class),reports,mock(GithubSourceVerificationService.class));
    final AnalysisController.GithubReportRequest request=new AnalysisController.GithubReportRequest("o","r",42,"abcdef0","LOCAL",2,"",false);
    @Test void rejectsPrChangingWhileFilesAreRead()throws Exception{
        when(github.pullRequest("o","r",42,"token")).thenReturn(json.readTree("{\"base\":{\"sha\":\"a\"},\"head\":{\"sha\":\"b\"}}"),json.readTree("{\"base\":{\"sha\":\"a\"},\"head\":{\"sha\":\"c\"}}"));
        when(github.pullRequestFiles("o","r",42,"token")).thenReturn(json.createArrayNode());
        assertThrows(ExternalServiceException.class,()->controller.githubPrReport("p",request,"token"));
        verifyNoInteractions(reports);
    }
    @Test void stablePrPassesMetadataAndFilesToReport()throws Exception{
        var meta=json.readTree("{\"base\":{\"sha\":\"a\"},\"head\":{\"sha\":\"b\"}}");
        var files=json.createArrayNode();
        when(github.pullRequest("o","r",42,null)).thenReturn(meta);
        when(github.pullRequestFiles("o","r",42,null)).thenReturn(files);
        controller.githubPrReport("p",request,null);
        verify(reports).analyze("p","PR","o","r","42","a","b","",files,AnalysisScope.LOCAL,2);
    }
    @Test void commitFilesUseCanonicalShaAndFirstParent()throws Exception{
        var files=json.createArrayNode();String sha="b".repeat(40);
        when(github.commit("o","r","abcdef0",null)).thenReturn(json.readTree("{\"sha\":\""+sha+"\",\"parents\":[{\"sha\":\"a\"},{\"sha\":\"c\"}]}"));
        when(github.commitFiles("o","r",sha,null)).thenReturn(files);
        controller.githubCommitReport("p",request,null);
        verify(reports).analyze("p","COMMIT","o","r","abcdef0","a",sha,"",files,AnalysisScope.LOCAL,2);
    }
}
