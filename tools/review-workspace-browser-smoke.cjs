const {chromium}=require('../frontend/node_modules/playwright');
const {savedFixture,parseSavedReport}=require('./snapshot-test-support.cjs');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const url=process.env.UI_URL||'http://127.0.0.1:5173';
async function main(){
  const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1000}}),errors=[],requests=[];
    await context.route('**/api/**',route=>{if(!route.request().url().endsWith('/health'))requests.push(route.request().url());return route.fulfill({status:503,body:'{}'});});
    const page=await context.newPage();
    async function open(target=page){
      target.on('pageerror',e=>errors.push(e.message));
      await target.goto(url);await target.locator('.saved-reviews > summary').click();
      await target.getByRole('button',{name:'브라우저 보관본 지우기',exact:true}).waitFor({state:'visible'});
      await target.waitForFunction(()=>!document.querySelector('.review-persistence button').disabled);
    }
    function panel(target=page){return target.getByRole('region',{name:'검토 자동 보관'});}
    function slot(side,target=page){return target.getByRole('article',{name:`${side} 스냅샷`});}
    async function load(side,name,data,target=page){
      await target.getByLabel(`${side} JSON 불러오기`,{exact:true}).setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
      await slot(side,target).getByText(name,{exact:true}).waitFor();
    }
    async function stored(target=page){
      return target.evaluate(()=>new Promise((resolve,reject)=>{
        const request=indexedDB.open('devsphere-review-workspace',1);
        request.onsuccess=()=>{const db=request.result,tx=db.transaction('workspace','readonly'),get=tx.objectStore('workspace').get('current');tx.oncomplete=()=>{db.close();resolve(get.result??null);};tx.onabort=()=>reject(tx.error);};request.onerror=()=>reject(request.error);
      }));
    }
    async function complete(target=page){await panel(target).getByText(/이 브라우저에 보관 완료/).waitFor();await target.waitForFunction(()=>!document.querySelector('.review-persistence button').disabled);}
    await open();const data=savedFixture('comparison');
    // Nothing is persisted without opting in.
    await load('기준','not-opted-in.json',data);assert.equal(await stored(),null);
    await page.reload();await page.locator('.saved-reviews > summary').click();
    assert.equal(await slot('기준').getByText('not-opted-in.json',{exact:true}).count(),0);
    await load('기준','recover-before.json',data);await load('비교','recover-after.json',data);
    await panel().getByLabel('이 브라우저에 검토 자동 보관',{exact:true}).check();await complete();
    assert.equal((await stored()).slots.before.name,'recover-before.json');
    await slot('기준').getByRole('button',{name:'검토 기록 편집',exact:true}).click();
    const editor=page.getByRole('region',{name:'검토 기록 편집'});
    await editor.getByLabel('검토자 표기',{exact:true}).fill('Offline reviewer');
    await editor.getByLabel('검토 대상',{exact:true}).selectOption('method:other');
    await editor.getByLabel('검토 판단',{exact:true}).selectOption('EXCLUDED');
    await editor.getByLabel('검토 판단 이유',{exact:true}).fill('Reason survives refresh <script>text</script>');
    await editor.getByRole('button',{name:'기록 저장',exact:true}).click();await complete();
    const row=await stored();assert.equal(row.slots.before.data.review.entries[0].decision,'EXCLUDED');
    parseSavedReport(JSON.stringify(row.slots.before.data));
    await page.reload();await page.locator('.saved-reviews > summary').click();
    await panel().getByText(/브라우저 보관본을 복구했습니다/).waitFor();
    await slot('기준').getByText('recover-before.json',{exact:true}).waitFor();
    await slot('비교').getByText('recover-after.json',{exact:true}).waitFor();
    await slot('기준').getByRole('button',{name:'검토 기록 편집',exact:true}).click();
    await editor.getByLabel('검토 대상',{exact:true}).selectOption('method:other');
    assert.equal(await editor.getByLabel('검토 판단 이유',{exact:true}).inputValue(),'Reason survives refresh <script>text</script>');
    assert.equal(await editor.getByLabel('검토자 표기',{exact:true}).inputValue(),'Offline reviewer');
    assert.equal(await page.getByRole('button',{name:'현재 결과를 기준으로 보관',exact:true}).isDisabled(),true);
    // A second tab can read the same checkpoint, but cannot overwrite a newer revision.
    const other=await context.newPage();await open(other);
    await slot('기준',other).getByText('recover-before.json',{exact:true}).waitFor();
    assert.equal((await stored()).revision,row.revision); // reading never creates a new revision
    await page.getByLabel('기준 프로젝트 비교 키',{exact:true}).fill('newer-tab-key');await complete();
    await other.getByLabel('기준 프로젝트 비교 키',{exact:true}).fill('stale-tab-key');
    await panel(other).getByRole('alert').getByText(/다른 탭에서 브라우저 보관본이 바뀌었습니다/).waitFor();
    assert.equal((await stored()).slots.before.data.comparisonKey,'newer-tab-key');
    // Failure retains in-memory work, can retry, and never claims a completed save.
    await other.close();
    await page.evaluate(()=>{window.originalIdbPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){const request=window.originalIdbPut.apply(this,args);this.transaction.abort();return request;};});
    await page.getByLabel('기준 프로젝트 비교 키',{exact:true}).fill('retained-after-failure');
    await panel().getByRole('alert').getByText(/브라우저 보관에 실패했습니다/).waitFor();
    assert.equal(await page.getByLabel('기준 프로젝트 비교 키',{exact:true}).inputValue(),'retained-after-failure');
    assert.equal(await panel().getByText(/이 브라우저에 보관 완료/).count(),0);
    assert.equal((await stored()).slots.before.data.comparisonKey,'newer-tab-key');
    await page.evaluate(()=>{IDBObjectStore.prototype.put=window.originalIdbPut;});
    await panel().getByRole('button',{name:'다시 보관',exact:true}).click();await complete();
    assert.equal((await stored()).slots.before.data.comparisonKey,'retained-after-failure');
    await slot('비교').getByRole('button',{name:'제거',exact:true}).click();await complete();assert.equal((await stored()).slots.after,null);
    const output=path.resolve(__dirname,'../benchmark-output');fs.mkdirSync(output,{recursive:true});
    await panel().screenshot({path:path.join(output,'review-workspace-desktop.png')});
    await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await panel().screenshot({path:path.join(output,'review-workspace-mobile.png')});
    await panel().getByLabel('이 브라우저에 검토 자동 보관',{exact:true}).uncheck();
    await panel().getByText(/브라우저 보관본을 지웠습니다/).waitFor();assert.equal(await stored(),null);
    assert.equal(await slot('기준').getByText('recover-before.json',{exact:true}).count(),1);
    await page.reload();await page.locator('.saved-reviews > summary').click();
    await page.waitForFunction(()=>!document.querySelector('.review-persistence button').disabled);
    assert.equal(await slot('기준').getByText('recover-before.json',{exact:true}).count(),0);
    // Corrupted checkpoint does not restore or silently overwrite either slot.
    await page.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('devsphere-review-workspace',1);request.onsuccess=()=>{const db=request.result,tx=db.transaction('workspace','readwrite');tx.objectStore('workspace').put({version:1,revision:'broken',slots:{before:{name:'bad',data:{}},after:null}},'current');tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};}));
    await page.reload();await page.locator('.saved-reviews > summary').click();
    await panel().getByRole('alert').getByText(/브라우저 보관본을 읽을 수 없습니다/).waitFor();
    await load('기준','manual-import-still-works.json',data);
    assert.equal((await stored()).revision,'broken');
    await panel().getByRole('button',{name:'브라우저 보관본 지우기',exact:true}).click();await panel().getByText(/브라우저 보관본을 지웠습니다/).waitFor();
    assert.equal(await stored(),null);
    await panel().getByLabel('이 브라우저에 검토 자동 보관',{exact:true}).check();await complete();
    assert.equal((await stored()).slots.before.name,'manual-import-still-works.json');
    await panel().getByRole('button',{name:'브라우저 보관본 지우기',exact:true}).click();await panel().getByText(/브라우저 보관본을 지웠습니다/).waitFor();
    // Unavailable browser storage must leave import/export available.
    await page.addInitScript(()=>{indexedDB.open=()=>{throw new DOMException('storage denied','SecurityError');};});
    await page.reload();await page.locator('.saved-reviews > summary').click();
    await panel().getByRole('alert').getByText(/브라우저 보관본을 읽을 수 없습니다/).waitFor();
    await load('기준','storage-denied-import.json',data);
    const pending=page.waitForEvent('download');await slot('기준').getByRole('button',{name:'JSON 다시 저장',exact:true}).click();
    await(await pending).saveAs(path.join(output,'review-workspace-fallback-report.json'));
    assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
    console.log('PASS: opt-in workspace checkpoint, both slots and notes survive refresh, no server session restore, conflict protection, failed-write retry, slot removal, clear, corrupt recovery and mobile layout');
  }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
