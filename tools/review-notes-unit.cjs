const assert=require('node:assert/strict');
const {parseSavedReport,savedAnalyses,compareSavedReports,savedFixture}=require('./snapshot-test-support.cjs');
const {buildHtmlReport}=require('./report-test-support.cjs');
const {buildSnapshotComparisonHtml}=require('./snapshot-report-test-support.cjs');
function fixture(mode='comparison'){
  const data=savedFixture(mode);
  data.project.nodes.push({id:'class:missing',type:'CLASS',name:'Missing',sourcePath:'src/Missing.java',line:1,confidence:1,attributes:{fqcn:'example.Missing'}});data.project.nodeCount++;
  return data;
}
const parse=x=>parseSavedReport(JSON.stringify(x));
function main(){
  for(const mode of ['impact','comparison','github']){
    const data=fixture(mode),key=savedAnalyses(data).find(a=>a.scope==='FEATURE').key;
    const note=(nodeId,decision,reason)=>({analysisKey:key,nodeId,decision,reason,updatedAt:'2026-10-17T00:00:00.000Z'});
    data.review={version:1,reviewer:'<img src=x onerror=alert(1)>',token:'review-secret',entries:[note('method:other','CONFIRMED','<script>text only</script>'),note('test:check','EXCLUDED','not the relevant behavior'),note('class:missing','MISSING','missing call evidence')]};
    const restored=parse(data);assert.equal(restored.review.entries.length,3);assert.equal(restored.review.token,undefined);
    assert.deepEqual(parse(restored).review,restored.review);
    const html=buildHtmlReport(restored);assert.ok(html.includes('검토 기록 · 3개'));assert.ok(html.includes('&lt;script&gt;text only&lt;/script&gt;'));assert.equal(/<script|<img|<iframe/.test(html),false);
    const plain=structuredClone(restored);delete plain.review;
    const delta=compareSavedReports(plain,restored,key);
    assert.equal(delta.error,'');assert.equal(delta.added.length+delta.removed.length+delta.changed.length,0);assert.equal(delta.riskBefore,delta.riskAfter);
    const cmp=buildSnapshotComparisonHtml(restored,plain,key,'with-notes','without-notes');assert.ok(cmp.includes('기준 검토 기록 · 3개'));assert.equal(cmp.includes('비교 검토 기록'),false);
    const bad=[];const mutate=f=>{const value=structuredClone(data);f(value);bad.push(value);};
    mutate(v=>v.review.version=2);mutate(v=>v.review.entries.push(v.review.entries[0]));mutate(v=>v.review.entries[0].decision='UNKNOWN');
    mutate(v=>v.review.entries[0].decision='MISSING');mutate(v=>v.review.entries[2].decision='CONFIRMED');mutate(v=>v.review.entries[1].reason='  ');
    mutate(v=>v.review.entries[2].reason='');mutate(v=>v.review.entries[0].analysisKey='different-context');mutate(v=>v.review.entries[0].nodeId='unknown');
    mutate(v=>v.review.entries[0].updatedAt='not-a-date');mutate(v=>v.review.entries[0].reason='x'.repeat(2001));mutate(v=>v.review.reviewer='x'.repeat(101));
    mutate(v=>v.review.entries[2].nodeId='method:service');mutate(v=>v.review.entries=Array(2001).fill(v.review.entries[0]));
    for(const value of bad)assert.throws(()=>parse(value));
    data.review.entries[0].decision='NEEDS_REVIEW';data.review.entries[0].reason='';assert.equal(parse(data).review.entries[0].decision,'NEEDS_REVIEW');
  }
  const scopes=fixture(),analyses=savedAnalyses(scopes),feature=analyses.find(a=>a.scope==='FEATURE'),system=analyses.find(a=>a.scope==='SYSTEM');
  scopes.review={version:1,reviewer:'reviewer',entries:[{analysisKey:feature.key,nodeId:'method:other',decision:'CONFIRMED',reason:'feature note',updatedAt:'2026-10-17T00:00:00Z'},{analysisKey:system.key,nodeId:'method:other',decision:'EXCLUDED',reason:'system only note',updatedAt:'2026-10-17T00:00:00Z'}]};
  const parsed=parse(scopes);assert.equal(parsed.review.entries.length,2);
  const cmp=buildSnapshotComparisonHtml(parsed,parsed,feature.key,'before','after');assert.ok(cmp.includes('feature note'));assert.equal(cmp.includes('system only note'),false);
  assert.equal(parseSavedReport(JSON.stringify(savedFixture())).review,undefined);
  const bulk=fixture('impact'),bulkKey=savedAnalyses(bulk)[0].key;bulk.review={version:1,reviewer:'bulk review',entries:[]};
  for(let i=0;i<61;i++){
    const nodeId=`class:missing-${i}`;bulk.project.nodes.push({id:nodeId,type:'CLASS',name:`Missing${i}`,sourcePath:`src/Missing${i}.java`,line:1,confidence:1,attributes:{fqcn:`example.Missing${i}`}});bulk.project.nodeCount++;
    bulk.review.entries.push({analysisKey:bulkKey,nodeId,decision:'MISSING',reason:`Missing evidence ${i}`,updatedAt:'2026-10-17T00:00:00Z'});
  }
  const bulkHtml=buildHtmlReport(parse(bulk));assert.ok(bulkHtml.includes('검토 기록 · 61개'));assert.ok(bulkHtml.includes('Missing evidence 60'));
  console.log('PASS: review JSON round trip, context/node/decision/reason/date/size validation, unique per-analysis entries, escaped HTML, scope-filtered comparison and unchanged analysis metrics');
}
main();
