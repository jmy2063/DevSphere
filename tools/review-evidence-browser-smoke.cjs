const {chromium}=require('../frontend/node_modules/playwright');
const {savedFixture,savedAnalyses,parseSavedReport}=require('./snapshot-test-support.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
async function main(){
  const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),requests=[],errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/api/**',route=>{if(!route.request().url().endsWith('/health'))requests.push(route.request().url());return route.fulfill({status:503,body:'{}'});});
    await page.goto(process.env.UI_URL||'http://127.0.0.1:5173');await context.setOffline(true);
    await page.locator('.saved-reviews > summary').click();
    const before=page.getByRole('article',{name:'기준 스냅샷'});
    async function load(data,name){
      await page.getByLabel('기준 JSON 불러오기',{exact:true}).setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
      await before.getByText(name,{exact:true}).waitFor();
      await before.getByRole('button',{name:'검토 기록 편집',exact:true}).click();
    }
    const data=savedFixture('comparison');
    data.comparison.SYSTEM.paths=structuredClone(data.comparison.SYSTEM.paths);
    data.comparison.SYSTEM.paths[0].steps[0].sourcePath='system-only/Changed.java';
    data.project.nodes.push({id:'class:missing',type:'CLASS',name:'Missing',sourcePath:'src/Missing.java',line:1,confidence:1,attributes:{}});data.project.nodeCount++;
    await load(data,'evidence-scopes.json');
    const editor=page.getByRole('region',{name:'검토 기록 편집'}),evidence=page.getByRole('region',{name:'선택 대상의 분석 근거'});
    await editor.getByLabel('검토 대상',{exact:true}).selectOption('test:check');
    await evidence.getByText('관련 변경 시작점 1개',{exact:true}).waitFor();
    await evidence.locator('summary').click();
    await evidence.getByText('archive/src/Service.java:3–7',{exact:true}).waitFor();
    await evidence.getByText('archive/test/ServiceTest.java:8–12',{exact:true}).waitFor();
    assert.equal(await evidence.getByText('system-only/Changed.java:3–7',{exact:true}).count(),0);
    assert.equal(await evidence.locator('ol li').count(),2);
    await editor.getByLabel('검토 판단',{exact:true}).selectOption('CONFIRMED');
    await editor.getByLabel('검토 판단 이유',{exact:true}).fill('Verified saved path');
    await editor.getByRole('button',{name:'기록 저장',exact:true}).click();
    // Queue ignores a restrictive search, skips recorded nodes, and clears that search.
    await editor.getByLabel('검토 대상 검색',{exact:true}).fill('ServiceTest');
    await editor.getByRole('button',{name:'다음 미기록 후보',exact:true}).click();
    assert.equal(await editor.getByLabel('검토 대상',{exact:true}).inputValue(),'method:other');
    assert.equal(await editor.getByLabel('검토 대상 검색',{exact:true}).inputValue(),'');
    await evidence.locator('summary').click();
    await evidence.getByText(/후보에는 포함되지만 이 JSON에 대상까지의 경로가 저장되어 있지 않습니다/).waitFor();
    assert.equal(await evidence.locator('ol li').count(),0);
    await editor.getByRole('button',{name:'기록 저장',exact:true}).click();
    assert.equal(await editor.getByRole('button',{name:'다음 미기록 후보',exact:true}).isDisabled(),true);
    const local=savedAnalyses(data).find(a=>a.scope==='LOCAL'),system=savedAnalyses(data).find(a=>a.scope==='SYSTEM');
    await editor.getByLabel('검토할 분석',{exact:true}).selectOption(local.key);
    assert.equal(await editor.getByRole('button',{name:'다음 미기록 후보',exact:true}).isDisabled(),false);
    await editor.getByRole('button',{name:'기록 저장',exact:true}).click();
    assert.equal(await editor.getByRole('button',{name:'다음 미기록 후보',exact:true}).isDisabled(),true);
    await editor.getByLabel('검토할 분석',{exact:true}).selectOption(system.key);
    await editor.getByLabel('검토 대상',{exact:true}).selectOption('method:other');
    await editor.getByRole('button',{name:'다음 미기록 후보',exact:true}).click();
    assert.equal(await editor.getByLabel('검토 대상',{exact:true}).inputValue(),'test:check'); // wraps
    await evidence.locator('summary').click();
    await evidence.getByText('system-only/Changed.java:3–7',{exact:true}).waitFor();
    await editor.getByLabel('검토 대상 구분',{exact:true}).selectOption('MISSING');
    await editor.getByLabel('검토 대상',{exact:true}).selectOption('class:missing');
    await evidence.getByText(/영향이 없다는 판정은 아닙니다/).waitFor();
    await editor.getByRole('button',{name:'다음 미기록 후보',exact:true}).click();
    assert.equal(await editor.getByLabel('검토 대상 구분',{exact:true}).inputValue(),'CANDIDATES');
    // Multiple GitHub starts retain their own path provenance; large lists can expand.
    const github=savedFixture('github'),base=github.github.results[0];
    github.github.results=Array.from({length:12},(_,i)=>{
      const id=`method:start-${i}`,name=`Source${i}.change()`;
      github.project.nodes.push({...github.project.nodes.find(n=>n.id===base.changedNode),id,name});
      return {...structuredClone(base),changedNode:id,changedNodeName:name,paths:base.paths.map(p=>({...p,steps:p.steps.map((s,j)=>j?s:{...s,id,name})}))};
    });
    github.project.nodeCount=github.project.nodes.length;
    // Verify this is a supported saved report rather than bypassing import validation.
    parseSavedReport(JSON.stringify(github));await load(github,'evidence-multi-start.json');
    await editor.getByLabel('검토 대상',{exact:true}).selectOption('test:check');
    await evidence.getByText('관련 변경 시작점 12개',{exact:true}).waitFor();
    assert.equal(await evidence.locator('summary').count(),10);
    await evidence.getByRole('button',{name:'나머지 2개 시작점 근거 보기',exact:true}).click();
    assert.equal(await evidence.locator('summary').count(),12);
    await evidence.getByText('Source11.change() · 1개 경로',{exact:true}).click();
    await evidence.locator('li').getByText('Source11.change()',{exact:true}).waitFor();
    const output=path.resolve(__dirname,'../benchmark-output');fs.mkdirSync(output,{recursive:true});
    await evidence.screenshot({path:path.join(output,'review-evidence-desktop.png')});
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await evidence.screenshot({path:path.join(output,'review-evidence-mobile.png')});
    assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);
    console.log('PASS: offline review evidence, exact target and scope isolation, missing-path explanation, unrecorded queue skip/wrap/completion, multi-start provenance and mobile layout');
  }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
