const assert=require('node:assert/strict');
const {buildHtmlReport,fixture,head,base}=require('./report-test-support.cjs');
function main(){
  const f=fixture();
  const html=buildHtmlReport(f.data);
  assert.ok(html.startsWith('<!doctype html>'));assert.ok(html.includes('2026-10-15 13:00:00 UTC'));
  assert.ok(html.includes('영향 후보 전체 · 2개'));assert.ok(html.includes('서버 없이 열 수'));
  assert.equal(html.includes('<script'),false);assert.equal(html.includes('<link'),false);
  assert.ok(html.includes("default-src 'none'"));
  const duplicate=structuredClone(f.data);duplicate.result.indirectImpact.push(duplicate.result.directImpact[0]);
  assert.ok(buildHtmlReport(duplicate).includes('영향 후보 전체 · 2개'));
  const comparison=buildHtmlReport({...f.data,result:null,comparison:f.comparison});
  assert.ok(comparison.includes('분석 범위 비교'));assert.ok(comparison.includes('직전 범위 대비 추가 / 제외'));
  for(const scope of ['LOCAL','FEATURE','SYSTEM'])assert.ok(comparison.includes('<h2>'+scope+' ·'));
  const github=buildHtmlReport({...f.data,result:null,github:f.github});
  assert.ok(github.includes('Java 소스 검증 완료 · HEAD'));
  assert.ok(github.includes('https://github.com/example/review/blob/'+head+'/test/ServiceTest.java#L8'));
  assert.equal(github.includes('/blob/'+head+'/archive/'),false);
  assert.ok(github.includes('PR 전체 위험 점수가 아닙니다'));
  const baseReport=structuredClone(f.github);baseReport.mappingSide='BASE';baseReport.revisionStatus='VERIFIED_JAVA_BASE';baseReport.sourceVerification.revision=base;
  assert.ok(buildHtmlReport({...f.data,result:null,github:baseReport}).includes('/blob/'+base+'/test/ServiceTest.java#L8'));
  const mismatch=structuredClone(f.github);mismatch.revisionStatus='JAVA_CONTENT_MISMATCH';mismatch.results=[];mismatch.summary.maxStartRiskScore=0;mismatch.sourceVerification.status='MISMATCH';
  const failed=buildHtmlReport({...f.data,result:null,github:mismatch});
  assert.ok(failed.includes('산출 안 됨'));assert.ok(failed.includes('위험 점수를 산출하지 않았습니다'));
  assert.equal(failed.includes('/blob/'),false);
  const unavailable=structuredClone(f.github);unavailable.results=[];unavailable.revisionStatus='JAVA_VERIFICATION_UNAVAILABLE';unavailable.sourceVerification.status='UNAVAILABLE';unavailable.sourceVerification.message='전체 검증 불가';
  const unavailableHtml=buildHtmlReport({...f.data,result:null,github:unavailable});
  assert.ok(unavailableHtml.includes('전체 검증 불가'));assert.equal(unavailableHtml.includes('>ZIP Java</th>'),false);
  for(const state of ['UNVERIFIED','DECLARED_HEAD_MATCH']){
    const report={...f.github,revisionStatus:state};assert.equal(buildHtmlReport({...f.data,result:null,github:report}).includes('/blob/'),false);
  }
  const badRevision=structuredClone(f.github);badRevision.sourceVerification.revision=base;
  assert.equal(buildHtmlReport({...f.data,result:null,github:badRevision}).includes('/blob/'),false);
  const badSide={...f.github,mappingSide:'BASE'};
  assert.equal(buildHtmlReport({...f.data,result:null,github:badSide}).includes('/blob/'),false);
  const traversal=structuredClone(f.github);traversal.sourceVerification.zipPrefix='';traversal.summary.tests[0].sourcePath='../secret.java';traversal.results=[];
  assert.equal(buildHtmlReport({...f.data,result:null,github:traversal}).includes('/blob/'),false);
  const evaluated=buildHtmlReport({...f.data,result:null,evaluation:f.evaluation});
  assert.ok(evaluated.includes('입력한 기대 대상과의 비교'));assert.ok(evaluated.includes('Top-5 recall'));assert.ok(evaluated.includes('50%'));
  assert.ok(buildHtmlReport({...f.data,generatedAt:'invalid'}).includes('시각 정보 없음'));
  assert.throws(()=>buildHtmlReport({...f.data,result:null}),/분석 결과/);
  const malicious=structuredClone(f.data);malicious.project.projectId='<script>alert("x")</script>';malicious.project.warnings=['<img src="https://evil.test" onerror="alert(1)">'];malicious.result.explanation='<iframe src="https://evil.test"></iframe>';malicious.result.directImpact[0].depth='<svg/onload=alert(1)>';malicious.result.paths[0].hopCount='<script>bad</script>';
  const escaped=buildHtmlReport({...malicious,token:'fixture-secret'});
  for(const forbidden of ['<script','<img','<iframe','<svg','fixture-secret'])assert.equal(escaped.includes(forbidden),false,forbidden);
  assert.ok(escaped.includes('&lt;script&gt;'));assert.ok(escaped.includes('&lt;img'));
  console.log('PASS: HTML impact/comparison/PR/evaluation, blocked-risk state, verified source links, ID deduplication, text escaping, no credentials or active content');
}
if(require.main===module)main();
