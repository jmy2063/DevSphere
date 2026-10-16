// Real backend JSON round trip, current-result capture, and server-free review.
const {chromium}=require('../frontend/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const {parseSavedReport}=require('./snapshot-test-support.cjs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'benchmark-output');
async function main(){
  fs.mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});let project;
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(process.env.UI_URL||'http://127.0.0.1:5173');
    const uploaded=page.waitForResponse(r=>r.url().endsWith('/upload'));
    await page.locator('input[type=file][accept=".zip"]').setInputFiles(path.join(root,'.benchmark-cache/spring-petclinic.zip'));
    project=(await(await uploaded).json()).projectId;
    await page.locator('#selected-node').selectOption('class:org.springframework.samples.petclinic.vet.VetRepository#findAll');
    await page.getByRole('button',{name:'영향 분석',exact:true}).click();
    await page.getByRole('heading',{name:'이 변경에서 확인할 항목'}).waitFor();
    await page.locator('.saved-reviews > summary').click();
    await page.locator('#export-comparison-key').fill('spring-projects/spring-petclinic');
    const files=[];
    for(const mode of ['impact','comparison']){
      if(mode==='comparison'){
        await page.getByRole('button',{name:'3단계 비교',exact:true}).click();
        await page.locator('.compare-delta').first().waitFor();
      }
      const pending=page.waitForEvent('download');await page.getByTitle('JSON 결과 저장').click();
      const file=path.join(output,`live-${mode}-snapshot.json`);await(await pending).saveAs(file);files.push(file);
      const parsed=parseSavedReport(fs.readFileSync(file,'utf8'));
      assert.equal(parsed.project.projectId,project);assert.equal(parsed.formatVersion,1);
      assert.equal(parsed.comparisonKey,'spring-projects/spring-petclinic');
      const requests=[];const track=r=>{if(r.url().includes('/api/'))requests.push(r.url());};page.on('request',track);
      await page.getByRole('button',{name:'현재 결과를 기준으로 보관',exact:true}).click();
      await page.getByRole('button',{name:'현재 결과를 비교로 보관',exact:true}).click();
      const delta=page.getByRole('region',{name:'저장 결과 증감 비교'});
      await delta.locator('.report-counts').waitFor();
      const counts=await delta.locator('.report-counts b').allTextContents();
      assert.deepEqual(counts.filter((_,i)=>i!==3),['0','0','0','0','0']);
      assert.equal(await page.locator('.saved-error').count(),0);
      assert.equal(await page.locator('.result-snapshot').count(),1);
      if(mode==='comparison')assert.equal(await delta.locator('select option').count(),3);
      page.off('request',track);assert.deepEqual(requests,[]);
      console.log('PASS real JSON export and current capture:',mode,parsed.project.nodeCount,'nodes');
    }
    const offline=await browser.newContext({viewport:{width:1440,height:1000}});
    try{
      const viewer=await offline.newPage(),requests=[];viewer.on('pageerror',e=>errors.push(e.message));
      await viewer.route('**/api/**',route=>route.fulfill({status:503,contentType:'application/json',body:'{}'}));
      await viewer.goto(process.env.UI_URL||'http://127.0.0.1:5173');await offline.setOffline(true);
      viewer.on('request',r=>{if(r.url().includes('/api/analysis'))requests.push(r.url());});
      await viewer.locator('.saved-reviews > summary').click();
      await viewer.getByLabel('기준 JSON 불러오기',{exact:true}).setInputFiles(files[0]);
      await viewer.getByLabel('비교 JSON 불러오기',{exact:true}).setInputFiles(files[1]);
      await viewer.locator('.saved-delta .report-counts').waitFor();
      assert.deepEqual((await viewer.locator('.saved-delta .report-counts b').allTextContents()).filter((_,i)=>i!==3),['0','0','0','0','0']);
      await viewer.getByRole('article',{name:'비교 스냅샷'}).getByRole('button',{name:'검토 내용 열기',exact:true}).click();
      await viewer.frameLocator('iframe[title="저장된 보고서 미리보기"]').getByRole('heading',{name:'분석 범위 비교',exact:true}).waitFor();
      assert.equal(await viewer.locator('#selected-node').isDisabled(),true);
      assert.equal(await viewer.locator('.result-snapshot').count(),0);assert.deepEqual(requests,[]);
      await viewer.screenshot({path:path.join(output,'saved-review-live.png')});
      console.log('PASS real saved JSON reopened offline, same FEATURE result, sandboxed comparison preview, no live session restored');
    }finally{await offline.close();}
    assert.deepEqual(errors,[]);
  }finally{
    await browser.close();
    if(project)await fetch((process.env.LIVE_API_URL||'http://127.0.0.1:8080')+'/api/analysis/'+encodeURIComponent(project),{method:'DELETE'});
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
