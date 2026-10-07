// Actual GitHub/API verification of BASE coordinates and a GitHub-style ZIP wrapper.
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..');const api=process.env.LIVE_API_URL||'http://127.0.0.1:8080';
async function json(url,init){const r=await fetch(url,{...init,signal:AbortSignal.timeout(90000)});const d=await r.json();assert.equal(r.status,200,JSON.stringify(d));return d;}
async function main(){
  const reports=[];
  for(const [name,revision,status] of [
    ['base','818c4136ea971c21674525f9053de0d9c7ad8cfe','VERIFIED_JAVA_BASE'],
    ['wrapped','','VERIFIED_JAVA_HEAD']
  ]) {
    let project;
    try{
      const form=new FormData();form.append('file',new Blob([fs.readFileSync(path.join(root,'.benchmark-cache/petclinic-pr-2672-'+name+'.zip'))]),name+'.zip');
      const uploaded=await json(api+'/api/analysis/upload',{method:'POST',body:form});project=uploaded.projectId;
      const report=await json(api+'/api/analysis/'+project+'/github-pr-report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({owner:'spring-projects',repo:'spring-petclinic',pullNumber:2672,scope:'LOCAL',uploadedRevision:revision,verifySources:true})});
      assert.equal(report.revisionStatus,status);assert.equal(report.sourceVerification.status,'VERIFIED');
      assert.ok(report.results.length>0);assert.equal(report.sourceVerification.matchedFiles,report.sourceVerification.repositoryFiles);
      if(name==='base')assert.equal(report.mappingSide,'BASE');
      else assert.equal(report.sourceVerification.zipPrefix,'spring-petclinic-head/');
      reports.push({fixture:name,report});console.log('PASS real verification:',name,report.sourceVerification.matchedFiles,'Java files,',report.results.length,'starts');
    }finally{if(project)await fetch(api+'/api/analysis/'+project,{method:'DELETE'});}
  }
  fs.writeFileSync(path.join(root,'benchmark-output/source-verification-results.json'),JSON.stringify(reports,null,2)+'\n');
}
main().catch(e=>{console.error(e);process.exitCode=1});
