// Actual backend + actual browser + pinned public ZIPs. No response interception.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..');
const API=process.env.LIVE_API_URL||'http://127.0.0.1:8080';
const UI=process.env.UI_URL||'http://127.0.0.1:5173';
const sources=JSON.parse(fs.readFileSync(path.join(ROOT,'benchmarks/public/sources.json'),'utf8')).sources;
const output=path.join(ROOT,'benchmark-output');fs.mkdirSync(output,{recursive:true});
async function json(url,init={}){
  const response=await fetch(url,{...init,signal:AbortSignal.timeout(90_000)});
  const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data;
}
const post=(url,body)=>json(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
async function upload(name){
  const form=new FormData();form.append('file',new Blob([fs.readFileSync(path.join(ROOT,'.benchmark-cache',name+'.zip'))]),name+'.zip');
  return json(API+'/api/analysis/upload',{method:'POST',body:form});
}
async function main(){
  const projects=[];let browser;
  const report={api:API,ui:UI,projects:[],github:null,browser:null};
  try{
    assert.equal((await json(API+'/api/health')).status,'UP');
    for(const source of sources){
      const summary=await upload(source.name);projects.push(summary.projectId);
      assert.ok(summary.analyzedClasses>0);
      assert.equal(summary.warnings.length,0);
      const start=summary.nodes.find(n=>n.type==='METHOD'&&({
        'spring-petclinic':'VetController.findPaginated(int)',
        'gs-rest-service':'GreetingController.greeting(String)',
        'gs-accessing-data-jpa':'CustomerRepository.findByLastName(String)'
      }[source.name]===n.name));
      assert.ok(start,'Reviewed changed method must be available');
      const base=API+'/api/analysis/'+summary.projectId;
      const result=await post(base+'/impact',{nodeId:start.id,scope:'FEATURE'});
      assert.ok(result.paths.length>0);assert.ok(result.tests.length>0);
      assert.equal(result.changedNode,start.id);
      assert.ok(result.paths.every(p=>p.steps[0].id===start.id));
      const comparison=await post(base+'/impact-comparison',{nodeId:start.id});
      assert.deepEqual(Object.keys(comparison),['LOCAL','FEATURE','SYSTEM']);
      const evaluation=await post(base+'/evaluate',{nodeId:start.id,scope:'FEATURE',expectedTargets:[result.directImpact[0].id]});
      assert.equal(evaluation.truePositive,1); // Endpoint smoke only, not independently labelled accuracy.
      report.projects.push({name:source.name,commit:source.commit,classes:summary.analyzedClasses,nodes:summary.nodeCount,edges:summary.edgeCount,changed:start.name,tests:result.tests,paths:result.paths.length,cri:result.riskScore});
      console.log('PASS live HTTP:',source.name,summary.analyzedClasses,'classes',result.paths.length,'paths');
      if(source.name==='spring-petclinic'){
        const commit=await post(base+'/github-commit-impact',{owner:'spring-projects',repo:'spring-petclinic',sha:source.commit,scope:'LOCAL'});
        assert.ok(commit.some(r=>r.changedNodeName==='VetController.showVetList(int, Model, RedirectAttributes)'));
        report.github={repository:source.repository,commit:source.commit,changedMethods:commit.map(r=>r.changedNodeName)};
        const change=await post(base+'/github-commit-report',{owner:'spring-projects',repo:'spring-petclinic',sha:source.commit,uploadedRevision:source.commit,scope:'LOCAL',verifySources:true});
        assert.equal(change.revisionStatus,'VERIFIED_JAVA_HEAD');assert.ok(change.summary.changedStarts>0);
        assert.equal(change.sourceVerification.status,'VERIFIED');
        assert.equal(change.headSha,source.commit);assert.ok(change.files.length>0);
        const mismatch=await post(base+'/github-commit-report',{owner:'spring-projects',repo:'spring-petclinic',sha:source.commit,uploadedRevision:'0'.repeat(40),scope:'LOCAL',verifySources:true});
        assert.equal(mismatch.revisionStatus,'DECLARED_MISMATCH');assert.equal(mismatch.results.length,0);
        report.github.changeReport=change;report.github.mismatchBlocked=true;
        console.log('PASS live GitHub commit mapping:',commit.length,'starts');
      }
    }
    browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(UI);
    const uploaded=page.waitForResponse(r=>r.url().endsWith('/api/analysis/upload')&&r.request().method()==='POST');
    await page.locator('input[type=file]').setInputFiles(path.join(ROOT,'.benchmark-cache/spring-petclinic.zip'));
    const summary=await (await uploaded).json();projects.push(summary.projectId);
    await page.locator('aside select').first().selectOption('class:org.springframework.samples.petclinic.vet.VetRepository#findAll');
    await page.getByRole('button',{name:'영향 분석',exact:true}).click();
    await page.getByRole('heading',{name:'이 변경에서 확인할 항목'}).waitFor();
    await page.getByLabel('영향 유형').selectOption('TEST');
    assert.ok(await page.locator('.review-details>summary').filter({hasText:'TEST ·'}).count()>0);
    await page.getByLabel('영향 유형').selectOption('ALL');
    await page.locator('.review-details>summary').filter({hasText:/단계.*%/}).first().click();
    await page.getByRole('button',{name:'그래프에서 이 경로 보기'}).first().click();
    assert.ok(await page.locator('.graph-card .node').count()>1);
    await page.getByRole('button',{name:'전체 그래프로 돌아가기'}).click();
    await page.locator('.result-workspace').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output,'live-petclinic-review.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:path.join(output,'live-petclinic-mobile.png'),fullPage:true});
    const overflow=await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1&&!e.closest('svg')).map(e=>({tag:e.tagName,class:e.className,right:Math.round(e.getBoundingClientRect().right),text:e.textContent.slice(0,80)})).slice(0,12));
    if(overflow.length)console.log('Overflow diagnostics:',JSON.stringify(overflow));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(errors,[]);
    report.browser={passed:true,mockedResponses:false,mobileWidth:390};
    console.log('PASS real browser: Petclinic upload, analysis, test filter, graph path, mobile layout');
    fs.writeFileSync(path.join(output,'live-server-results.json'),JSON.stringify(report,null,2)+'\n');
  }finally{
    if(browser)await browser.close();
    for(const project of projects)await fetch(API+'/api/analysis/'+encodeURIComponent(project),{method:'DELETE'});
  }
}
main().catch(e=>{console.error(e);process.exitCode=1});
