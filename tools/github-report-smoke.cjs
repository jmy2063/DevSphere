// Actual GitHub PR #2672 + its reviewed HEAD ZIP + real backend/browser; no interception.
// Prepare .benchmark-cache/petclinic-pr-2672.zip with git archive of HEAD below.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..');
const head='f9df3a1ee82d5b6a8b6867a1bac1df5523bf5259';
async function main(){
  const browser=await chromium.launch({channel:'chrome',headless:true});let project;
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(process.env.UI_URL||'http://127.0.0.1:5173');
    const uploaded=page.waitForResponse(r=>r.url().endsWith('/upload'));
    await page.locator('input[type=file]').setInputFiles(path.join(root,'.benchmark-cache/petclinic-pr-2672.zip'));
    project=(await (await uploaded).json()).projectId;
    await page.locator('.github-box>summary').click();
    await page.getByLabel('GitHub PR 주소').fill('https://github.com/spring-projects/spring-petclinic/pull/2672/files');
    await page.getByLabel('ZIP 커밋 SHA').fill(head);
    const received=page.waitForResponse(r=>r.url().endsWith('/github-pr-report'),{timeout:90000});
    await page.getByRole('button',{name:'PR 변경 Method 분석',exact:true}).click();
    const response=await received;assert.equal(response.status(),200);const report=await response.json();
    assert.equal(report.revisionStatus,'VERIFIED_JAVA_HEAD');assert.equal(report.headSha,head);
    assert.equal(report.sourceVerification.status,'VERIFIED');assert.equal(report.sourceVerification.matchedFiles,report.sourceVerification.repositoryFiles);
    assert.ok(report.summary.changedStarts>0);assert.ok(report.summary.tests.length>0);
    assert.equal(report.files.length,report.summary.changedFiles);
    assert.ok(report.files.every(f=>f.mappingStatus==='MAPPED_METHOD'));
    await page.getByRole('heading',{name:/PR 분석 요약/}).waitFor();
    await page.getByText('Java 소스 검증 완료 · HEAD',{exact:true}).waitFor();
    const output=path.join(root,'benchmark-output');fs.mkdirSync(output,{recursive:true});
    fs.writeFileSync(path.join(output,'github-pr-live-results.json'),JSON.stringify(report,null,2)+'\n');
    await page.screenshot({path:path.join(output,'github-pr-live-desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:path.join(output,'github-pr-live-mobile.png'),fullPage:true});
    const previousProject=project;
    const changedUpload=page.waitForResponse(r=>r.url().endsWith('/upload'));
    await page.locator('input[type=file]').setInputFiles(path.join(root,'.benchmark-cache/petclinic-pr-2672-changed.zip'));
    project=(await (await changedUpload).json()).projectId;
    await fetch((process.env.LIVE_API_URL||'http://127.0.0.1:8080')+'/api/analysis/'+previousProject,{method:'DELETE'});
    await page.getByLabel('ZIP 커밋 SHA').fill(head);
    const rejected=page.waitForResponse(r=>r.url().endsWith('/github-pr-report'),{timeout:90000});
    await page.getByRole('button',{name:'PR 변경 Method 분석',exact:true}).click();
    const rejectedResponse=await rejected;assert.equal(rejectedResponse.status(),200);const mismatch=await rejectedResponse.json();
    assert.equal(mismatch.revisionStatus,'JAVA_CONTENT_MISMATCH');assert.equal(mismatch.results.length,0);
    assert.equal(mismatch.sourceVerification.changedFiles,1);assert.equal(mismatch.sourceVerification.missingFiles,1);assert.equal(mismatch.sourceVerification.extraFiles,1);
    await page.getByText('Java 소스 불일치 · 분석 중단',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:path.join(output,'github-source-mismatch-mobile.png'),fullPage:true});
    fs.writeFileSync(path.join(output,'github-source-mismatch-results.json'),JSON.stringify(mismatch,null,2)+'\n');
    assert.deepEqual(errors,[]);
    console.log('PASS real PR/browser:',report.sourceVerification.matchedFiles,'Java blobs verified,',report.summary.changedStarts,'starts; changed/missing/extra Java blocked, mobile layout passed');
  }finally{
    await browser.close();if(project)await fetch((process.env.LIVE_API_URL||'http://127.0.0.1:8080')+'/api/analysis/'+project,{method:'DELETE'});
  }
}
main().catch(e=>{console.error(e);process.exitCode=1});
