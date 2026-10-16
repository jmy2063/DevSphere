const {chromium}=require('../frontend/node_modules/playwright');
const {buildHtmlReport,fixture}=require('./report-test-support.cjs');
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {pathToFileURL}=require('node:url');
async function main(){
  const output=path.resolve(__dirname,'../benchmark-output');fs.mkdirSync(output,{recursive:true});
  const f=fixture();const hostile=structuredClone(f.data);
  hostile.project.projectId='<script>window.reportAttack=true</script>';
  hostile.result.explanation='<img src="https://example.invalid/report-leak" onerror="window.reportAttack=true">';
  hostile.result.changedNodeName='VeryLongMethodName'.repeat(15);
  const scenarios=[['impact',f.data],['comparison',{...f.data,result:null,comparison:f.comparison}],['pr',{...f.data,result:null,github:f.github}],['evaluation',{...f.data,result:null,evaluation:f.evaluation}],['escaped',hostile]];
  const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});
  try{
    for(const [name,data] of scenarios){
      const target=path.join(output,'standalone-'+name+'-report.html');fs.writeFileSync(target,buildHtmlReport(data));
      const context=await browser.newContext({offline:true,viewport:{width:1440,height:1000}});
      try{
        const page=await context.newPage();const requests=[],errors=[];
        page.on('request',r=>{if(!r.url().startsWith('file:'))requests.push(r.url());});page.on('pageerror',e=>errors.push(e.message));
        await page.goto(pathToFileURL(target).href);
        await page.getByRole('heading',{name:'DevSphere AX 검토 보고서',exact:true}).waitFor();
        assert.equal(await page.locator('script,img,iframe,object,embed,link').count(),0);
        assert.equal(await page.evaluate(()=>window.reportAttack===true),false);
        if(name==='impact'){
          assert.equal(await page.locator('.explanation').isVisible(),false);
          await page.emulateMedia({media:'print'});
          assert.equal(await page.locator('.explanation').isVisible(),true,'Print must include collapsed explanations');
          await page.screenshot({path:path.join(output,'standalone-report-print.png'),fullPage:true});
          await page.emulateMedia({media:'screen'});
          await page.screenshot({path:path.join(output,'standalone-report-desktop.png'),fullPage:true});
        }
        if(name==='pr')assert.ok(await page.locator('a[href^="https://github.com/example/review/blob/"]').count()>0);
        await page.setViewportSize({width:390,height:844});
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Report must fit mobile width: '+name);
        if(name==='impact')await page.screenshot({path:path.join(output,'standalone-report-mobile.png'),fullPage:true});
        assert.deepEqual(requests,[],'Report must not request network resources: '+name);assert.deepEqual(errors,[]);
      }finally{await context.close();}
    }
    console.log('PASS: standalone HTML opens offline in all report modes; mobile, print, no active content or network requests');
  }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
