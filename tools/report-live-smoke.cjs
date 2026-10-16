// Real backend/browser export from a pinned public ZIP; no response interception.
const {chromium}=require('../frontend/node_modules/playwright');
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),output=path.join(root,'benchmark-output');
async function main(){
  fs.mkdirSync(output,{recursive:true});const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});let project;
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(process.env.UI_URL||'http://127.0.0.1:5173');
    const upload=page.waitForResponse(r=>r.url().endsWith('/upload'));
    await page.locator('input[type=file][accept=".zip"]').setInputFiles(path.join(root,'.benchmark-cache/spring-petclinic.zip'));
    const summary=await(await upload).json();project=summary.projectId;
    await page.locator('#selected-node').selectOption('class:org.springframework.samples.petclinic.vet.VetRepository#findAll');
    await page.getByRole('button',{name:'영향 분석',exact:true}).click();
    await page.getByRole('heading',{name:'이 변경에서 확인할 항목'}).waitFor();
    for(const mode of ['impact','comparison']){
      if(mode==='comparison'){
        await page.getByRole('button',{name:'3단계 비교'}).click();await page.locator('.compare-delta').first().waitFor();
      }
      const pending=page.waitForEvent('download');await page.getByRole('button',{name:'HTML 보고서',exact:true}).click();
      const download=await pending,target=path.join(output,'live-'+mode+'-report.html');await download.saveAs(target);
      const context=await browser.newContext({offline:true,viewport:{width:1440,height:1000}});
      try{
        const viewer=await context.newPage();const network=[];viewer.on('request',r=>{if(!r.url().startsWith('file:'))network.push(r.url());});
        await viewer.goto(pathToFileURL(target).href);await viewer.getByRole('heading',{name:'DevSphere AX 검토 보고서',exact:true}).waitFor();
        assert.ok((await viewer.locator('body').innerText()).includes(project));
        assert.equal(await viewer.locator('script,iframe,img').count(),0);
        if(mode==='comparison')await viewer.getByRole('heading',{name:'분석 범위 비교',exact:true}).waitFor();
        if(mode==='impact')await viewer.screenshot({path:path.join(output,'live-export-report-desktop.png')});
        await viewer.setViewportSize({width:390,height:844});
        assert.equal(await viewer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
        if(mode==='impact')await viewer.screenshot({path:path.join(output,'live-export-report-mobile.png')});
        assert.deepEqual(network,[]);
      }finally{await context.close();}
      console.log('PASS real HTML export:',mode,fs.statSync(target).size,'bytes, reopened offline');
    }
    assert.deepEqual(errors,[]);
  }finally{
    await browser.close();if(project)await fetch((process.env.LIVE_API_URL||'http://127.0.0.1:8080')+'/api/analysis/'+encodeURIComponent(project),{method:'DELETE'});
  }
}
main().catch(e=>{console.error(e);process.exitCode=1});
