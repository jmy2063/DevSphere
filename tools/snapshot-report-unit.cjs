const assert=require('node:assert/strict');
const {savedFixture,parseSavedReport,savedAnalyses}=require('./snapshot-test-support.cjs');
const {buildSnapshotComparisonHtml}=require('./snapshot-report-test-support.cjs');
const parse=x=>parseSavedReport(JSON.stringify(x));
function main(){
  const before=savedFixture(),after=structuredClone(before),sample=before.result.directImpact.find(n=>n.type==='METHOD');
  function add(report,prefix,index,line){
    const id=`method:${prefix}${index}`,n={...sample,id,name:`${prefix}${index}()`,line,endLine:line+1};
    report.project.nodes.push({id,name:n.name,type:n.type,sourcePath:n.sourcePath,line,confidence:1,attributes:{ownerFqcn:`example.${prefix}`,methodName:`m${index}`,parameterTypes:''}});
    report.project.nodeCount++;report.result.directImpact.push(n);
  }
  for(let i=0;i<61;i++){
    add(before,'removed',i,10);add(after,'added',i,20);
    add(before,'changed',i,10);add(after,'changed',i,30);
  }
  after.result.riskScore=50;
  const a=parse(before),b=parse(after),key=savedAnalyses(a)[0].key;
  const attack='<img src=x onerror="alert(1)"><script>bad()</script>';
  a.project.projectId=attack;a.result.directImpact[0].name=attack;
  const html=buildSnapshotComparisonHtml(a,b,key,attack,'after.json','2026-10-16T00:00:00.000Z');
  for(const s of ['추가된 영향 후보 · 61개','제외된 영향 후보 · 61개','근거·위치가 달라진 후보 · 62개','method:added60','method:removed60','method:changed60','CRI 42 → 50 (+8)','최대 4단계','원본 JSON도 함께 보관','2026-10-16T00:00:00.000Z'])assert.ok(html.includes(s),s);
  assert.ok(html.includes('&lt;img'));assert.equal(/<script|<img|<iframe|<link|href=/i.test(html),false);
  assert.ok(html.includes("default-src 'none'"));assert.ok(html.includes('table-header-group'));
  const invalid=structuredClone(b);invalid.comparisonKey='different';
  assert.throws(()=>buildSnapshotComparisonHtml(a,invalid,key,'a','b'),/비교 키/);
  assert.throws(()=>buildSnapshotComparisonHtml(a,b,'missing','a','b'),/분석 범위/);
  const ambiguous=structuredClone(b),node=ambiguous.project.nodes.find(n=>n.id===sample.id);
  ambiguous.project.nodes.push({...node,id:'ambiguous'});ambiguous.result.directImpact.push({...sample,id:'ambiguous'});
  assert.throws(()=>buildSnapshotComparisonHtml(a,ambiguous,key,'a','b'),/식별자/);
  const scopes=parse(savedFixture('comparison')),system=savedAnalyses(scopes).find(x=>x.scope==='SYSTEM');
  const systemHtml=buildSnapshotComparisonHtml(scopes,scopes,system.key,'a','b');
  assert.ok(systemHtml.includes('CRI 55 → 55 (+0)'));assert.ok(systemHtml.includes('SYSTEM'));
  const g=parse(savedFixture('github')),g2=structuredClone(g);g2.github.headSha='c'.repeat(40);g2.github.sourceVerification.revision=g2.github.headSha;
  const gh=buildSnapshotComparisonHtml(g,g2,savedAnalyses(g)[0].key,'old.json','new.json');
  for(const s of ['example/review · PR 7','VERIFIED_JAVA_HEAD','VERIFIED','b'.repeat(40),'c'.repeat(40),'개별 시작점 최댓값','재검증하지 않았습니다'])assert.ok(gh.includes(s),s);
  console.log('PASS: comparison HTML uses gated deltas, all 61+ candidate rows, old/new evidence, selected scope, PR provenance, text escaping and blocked/ambiguous export rejection');
}
main();
