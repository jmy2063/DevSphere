import type {Summary,Impact,ImpactComparison,GithubChangeReport,Evaluation,ImpactNode} from './api';

export type ReportData={formatVersion?:1;generatedAt:string;project:Summary;result:Impact|null;comparison:ImpactComparison|null;github:GithubChangeReport|null;evaluation:Evaluation|null;comparisonKey?:string;importedAt?:string};

// All content is rendered as text. No scripts, remote assets, embedded JSON, or credentials.
const escape=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const code=(value:unknown)=>`<code>${escape(value)}</code>`;
const percent=(value:number)=>Number.isFinite(value)?`${Math.round(Math.max(0,Math.min(1,value))*100)}%`:'정보 없음';
const nodesOf=(result:Impact)=>[...new Map([...result.directImpact,...result.indirectImpact].map(n=>[n.id,n])).values()];
const list=(values:string[])=>values.length?`<ul>${values.map(v=>`<li>${escape(v)}</li>`).join('')}</ul>`:'<p class="muted">없음</p>';
const notice=(text:string)=>`<p class="notice">${escape(text)}</p>`;
const metric=(label:string,value:unknown)=>`<div class="metric"><span>${escape(label)}</span><strong>${escape(value)}</strong></div>`;
const revisionLabels:Record<string,string>={UNVERIFIED:'ZIP 버전 미확인 · HEAD 가정',DECLARED_HEAD_MATCH:'입력한 커밋: HEAD 일치 · 내용 검증 없음',DECLARED_BASE_MATCH:'입력한 커밋: BASE 일치 · 내용 검증 없음',DECLARED_MISMATCH:'선언한 커밋 불일치 · 분석 중단',VERIFIED_JAVA_HEAD:'Java 소스 검증 완료 · HEAD',VERIFIED_JAVA_BASE:'Java 소스 검증 완료 · BASE',JAVA_CONTENT_MISMATCH:'Java 소스 불일치 · 분석 중단',JAVA_VERIFICATION_UNAVAILABLE:'Java 소스 검증 불가 · 분석 중단'};
const mappingLabels:Record<string,string>={MAPPED_METHOD:'메소드 매핑',CLASS_FALLBACK:'파일/클래스 후보',UNMAPPED:'매핑 실패',AMBIGUOUS_PATH:'경로 중복',SKIPPED_NON_JAVA:'Java 외 파일'};
const differenceLabels:Record<string,string>={CONTENT_CHANGED:'내용 변경',MISSING_IN_ZIP:'ZIP에 없음',EXTRA_IN_ZIP:'ZIP에만 있음'};

function table(headers:string[],rows:string[][]):string {
  return rows.length?`<div class="table-wrap"><table role="table"><thead role="rowgroup"><tr role="row">${headers.map(h=>`<th scope="col" role="columnheader">${escape(h)}</th>`).join('')}</tr></thead><tbody role="rowgroup">${rows.map(row=>`<tr role="row">${row.map((cell,i)=>`<td role="cell" data-label="${escape(headers[i]||'')}">${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:'<p class="muted">해당 항목이 없습니다.</p>';
}

function location(path:string,line:number,github:GithubChangeReport|null):string {
  const label=`${path||'소스 위치 없음'}${path?`:${line}`:''}`;
  const verification=github?.sourceVerification;
  if(!github||verification?.status!=='VERIFIED'||!['HEAD','BASE'].includes(github.mappingSide)||github.revisionStatus!==`VERIFIED_JAVA_${github.mappingSide}`||!path||!Number.isInteger(line)||line<1)return escape(label);
  const revision=verification.revision;
  const expected=github.mappingSide==='BASE'?github.baseSha:github.headSha;
  if(!/^[a-fA-F0-9]{40}$/.test(revision)||revision.toLowerCase()!==expected.toLowerCase())return escape(label);
  if(verification.zipPrefix&&!path.startsWith(verification.zipPrefix))return escape(label);
  const repoPath=path.slice(verification.zipPrefix.length).replace(/\\/g,'/');
  const segments=repoPath.split('/');
  if(segments.some(p=>!p||p==='.'||p==='..'))return escape(label);
  const url=`https://github.com/${encodeURIComponent(github.owner)}/${encodeURIComponent(github.repo)}/blob/${revision}/${segments.map(encodeURIComponent).join('/')}#L${line}`;
  return `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(label)}</a>`;
}

function testsTable(nodes:ImpactNode[],github:GithubChangeReport|null):string {
  return table(['테스트 후보','소스 근거','깊이 / 신뢰도'],nodes.filter(n=>n.type==='TEST').map(n=>[escape(n.name),location(n.sourcePath,n.line,github),`${escape(n.depth)}단계 / ${percent(n.confidence)}`]));
}

function impactBlock(result:Impact,github:GithubChangeReport|null):string {
  const nodes=nodesOf(result);
  return `<section class="impact"><h2>${escape(result.scope)} · ${escape(result.changedNodeName)}</h2>
    <p>변경 시작점 ${code(result.changedNode)}</p>
    <div class="metrics">${metric('개별 시작점 CRI',`${result.riskScore} / 100 · ${result.riskLevel}`)}${metric('중복 제거 영향',nodes.length)}${metric('테스트 후보',nodes.filter(n=>n.type==='TEST').length)}${metric('근거 신뢰도',percent(result.evidenceConfidence))}</div>
    <h3>위험 판단 근거</h3>${list(result.riskReasons)}
    ${table(['CRI 항목','점수'],Object.entries(result.riskBreakdown).map(([key,value])=>[escape(key),escape(value)]))}
    <h3>테스트 후보</h3>${testsTable(nodes,github)}
    <details open><summary>영향 후보 전체 · ${nodes.length}개</summary>${table(['대상 / ID','유형','소스 위치','관계 / 방향','깊이 / 신뢰도'],nodes.map(n=>[`${escape(n.name)}<br>${code(n.id)}`,escape(n.type),location(n.sourcePath,n.line,github),`${escape(n.relation)} / ${escape(n.direction)}`,`${escape(n.depth)} / ${percent(n.confidence)}`]))}</details>
    <details open><summary>대표 근거 경로 · ${result.paths.length}개</summary><p class="muted">엔진이 반환한 대표 경로이며 모든 가능한 경로를 나열하지 않습니다.</p>${result.paths.map(p=>`<article class="path"><h4>${escape(p.targetName)} · ${escape(p.hopCount)}단계 · ${percent(p.pathConfidence)}</h4><ol>${p.steps.map(step=>`<li><b>${escape(step.name)}</b> <span class="muted">${escape(step.type)} · ${escape(step.viaRelation)} · ${escape(step.direction)}</span><br>${location(step.sourcePath,step.line,github)}<br>${code(step.id)}</li>`).join('')}</ol></article>`).join('')}</details>
    <details><summary>분석 설명</summary><p class="explanation">${escape(result.explanation)}</p></details></section>`;
}

function githubBlock(report:GithubChangeReport):string {
  const s=report.summary,v=report.sourceVerification;
  const verification=v?`<h3>Java 소스 검증</h3><p>${escape(v.message)}</p><p>검증 상태 ${code(v.status)} · 비교 커밋 ${code(v.revision||'없음')}</p>${v.zipPrefix?`<p>ZIP 최상위 폴더: ${code(v.zipPrefix)}</p>`:''}
    ${['VERIFIED','MISMATCH'].includes(v.status)?table(['ZIP Java','저장소 Java','일치','내용 변경','ZIP 누락','ZIP 추가'],[[v.localFiles,v.repositoryFiles,v.matchedFiles,v.changedFiles,v.missingFiles,v.extraFiles].map(escape)]):''}
    ${v.differences.length?table(['불일치 파일','사유'],v.differences.map(d=>[code(d.path),escape(differenceLabels[d.status]||d.status)]))+notice(`불일치 총 ${v.changedFiles+v.missingFiles+v.extraFiles}개 중 서버가 반환한 ${v.differences.length}개를 표시합니다.`):''}`:notice('소스 내용 검증 기록이 없습니다.');
  return `<section><h2>${escape(report.kind)} · ${escape(report.owner)}/${escape(report.repo)} · ${escape(report.reference)}</h2>
    ${notice(revisionLabels[report.revisionStatus]||report.revisionStatus)}
    <p>BASE ${code(report.baseSha||'없음')}<br>HEAD ${code(report.headSha||'없음')}<br>사용자 선언 ${code(report.declaredRevision||'미입력')} · 매핑 방향 ${escape(report.mappingSide)}</p>
    ${report.warnings.map(notice).join('')}${verification}
    <div class="metrics">${metric('변경 파일',s.changedFiles)}${metric('메소드 매핑',`${s.methodMappedFiles}/${s.javaFiles}`)}${metric('파일 후보',s.fallbackFiles)}${metric('Java 매핑 실패',s.unmappedJavaFiles)}${metric('중복 제거 영향',s.uniqueImpactNodes)}${metric('개별 시작점 최고 CRI',report.results.length?s.maxStartRiskScore:'산출 안 됨')}</div>
    ${notice('중복 제거 영향은 변경 시작점을 제외합니다. 최고 CRI는 개별 시작점 중 최댓값이며 PR 전체 위험 점수가 아닙니다.')}
    <h3>추천 테스트 후보</h3>${table(['테스트','소스 위치','깊이 / 신뢰도','연결된 변경'],s.tests.map(t=>[`${escape(t.name)}<br>${code(t.id)}`,location(t.sourcePath,t.line,report),`${escape(t.depth)} / ${percent(t.confidence)}`,t.changedStarts.map(escape).join('<br>')]))}
    <h3>파일별 매핑 결과 · ${report.files.length}개</h3>${table(['파일 / 이전 경로','변경 유형','매핑 상태','판정 이유','시작점'],report.files.map(f=>[`${code(f.filename)}${f.previousFilename?`<br>이전: ${code(f.previousFilename)}`:''}`,escape(f.changeStatus),escape(mappingLabels[f.mappingStatus]||f.mappingStatus),escape(f.reason),f.startNodeIds.map(code).join('<br>')]))}
    ${!report.results.length?notice('분석된 시작점이 없어 위험 점수를 산출하지 않았습니다. 파일별 매핑 및 소스 검증 사유를 확인하세요.'):''}</section>
    ${report.results.map(r=>impactBlock(r,report)).join('')}`;
}

function comparisonBlock(comparison:ImpactComparison):string {
  const rows=(['LOCAL','FEATURE','SYSTEM'] as const).flatMap(scope=>comparison[scope]?[comparison[scope]]:[]);
  return `<section><h2>분석 범위 비교</h2>${table(['범위','CRI','영향 후보','직전 범위 대비 추가 / 제외','테스트 후보'],rows.map((r,i)=>{
    const now=new Set(nodesOf(r).map(n=>n.id)),before=new Set(i?nodesOf(rows[i-1]).map(n=>n.id):[]);
    return [escape(r.scope),`${escape(r.riskScore)} / ${escape(r.riskLevel)}`,escape(now.size),i?`${[...now].filter(id=>!before.has(id)).length} / ${[...before].filter(id=>!now.has(id)).length}`:'기준 범위',escape(nodesOf(r).filter(n=>n.type==='TEST').length)];
  }))}<p>범위를 넓혀도 신뢰도·탐색 한도에 따라 후보가 달라질 수 있습니다.</p></section>${rows.map(r=>impactBlock(r,null)).join('')}`;
}

function evaluationBlock(evaluation:Evaluation):string {
  return `<section><h2>입력한 기대 대상과의 비교</h2><p>대상 ${code(evaluation.changedNode)} · ${escape(evaluation.scope)}</p>
    ${notice('사용자가 입력한 기대 대상 안에서의 비교입니다. 독립 검수나 전체 서비스 정확도·테스트 실행 결과를 의미하지 않습니다.')}
    ${table(['기대 대상','예측 대상','Precision','Recall','F1',`Top-${evaluation.topK} recall`],[[escape(evaluation.expectedCount),escape(evaluation.predictedCount),percent(evaluation.precision),percent(evaluation.recall),percent(evaluation.f1),percent(evaluation.topKRecall)]])}
    <h3>일치</h3>${list(evaluation.matched)}<h3>누락</h3>${list(evaluation.missed)}<h3>기대 목록 밖 후보</h3>${list(evaluation.unexpected)}</section>`;
}

export function buildHtmlReport(data:ReportData):string {
  if(!data.result&&!data.comparison&&!data.github&&!data.evaluation)throw new Error('저장할 분석 결과가 없습니다.');
  const date=new Date(data.generatedAt);
  const time=Number.isFinite(date.getTime())?date.toISOString().replace('T',' ').replace(/\.\d{3}Z$/,' UTC'):'시각 정보 없음';
  const project=data.project;
  const body=data.github?githubBlock(data.github):data.comparison?comparisonBlock(data.comparison):data.result?impactBlock(data.result,null):'';
  return reportDocument(`DevSphere AX 검토 보고서 · ${project.projectId}`, `<header><h1>DevSphere AX 검토 보고서</h1><p>프로젝트 ${code(project.projectId)}<br>생성 시각 ${escape(time)}</p></header>
    <section><h2>검토 안내</h2>${notice('CRI는 그래프 근거 기반 상대 위험지수이며 장애 확률이 아닙니다. 테스트는 실행·커버리지 증명이 아닌 검토 후보입니다. 테스트를 통한 다른 업무로의 전파는 차단합니다.')}
    ${data.importedAt?notice('불러온 JSON 파일에 기록된 결과입니다. 현재 서버에서 분석·소스 검증을 재실행하지 않았으며 파일의 출처·변조 여부를 확인하지 않았습니다.'):''}
    ${data.comparisonKey?`<p>사용자 지정 프로젝트 비교 키: ${code(data.comparisonKey)}</p>`:''}
    <p>이 파일은 저장 시점의 분석 스냅샷입니다. 서버 없이 열 수 있으며 최신 결과로 자동 갱신하지 않습니다. 접힌 항목은 제목을 눌러 펼치고, 브라우저 찾기 기능으로 경로·이름을 검색할 수 있습니다.</p>
    <p>분석 클래스 ${escape(project.analyzedClasses)}개 · 노드 ${escape(project.nodeCount)}개 · 관계 ${escape(project.edgeCount)}개</p>${project.warnings.map(notice).join('')}
    ${data.github?'':notice('이 결과에는 ZIP 커밋과의 소스 내용 일치 검증 기록이 없습니다.')}</section>${body}${data.evaluation?evaluationBlock(data.evaluation):''}
    <footer>DevSphere AX · 정적 Java/Spring 분석 · 소스 검증이 있는 경우에도 Java 경로·원본 바이트만 검증하며 설정·리소스·의존성·실행 환경은 포함하지 않습니다. 검증된 GitHub 소스 위치만 외부 코드 링크로 제공합니다. 보고서가 서비스 전체 영향 정답이나 실제 장애 발생을 증명하지는 않습니다.</footer>`);
}

// Body contains only markup assembled by the report builders; user text must be escaped there.
export function reportDocument(title:string,body:string):string {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escape(title)}</title><style>
    *{box-sizing:border-box}body{margin:0;background:#f1f5f7;color:#163044;font:15px/1.6 system-ui,sans-serif}main{max-width:1120px;margin:auto;padding:28px}header{background:#102e40;color:#efffff;padding:28px;border-radius:14px}header p{color:#b6d8df}h1{font-size:28px;margin:0}h2{font-size:21px;color:#155b64;margin:0 0 16px}h3{font-size:17px;margin:22px 0 10px}h4{font-size:15px;margin:0}section{background:white;border:1px solid #d7e3e9;border-radius:12px;padding:22px;margin:20px 0;min-width:0}p,li,td,th,code,h1,h2,h3,h4,summary{overflow-wrap:anywhere}code{font:12px/1.6 ui-monospace,monospace;white-space:normal;color:#3f5868}header code{color:#c4edf0}a{color:#116572}table{border-collapse:collapse;width:100%;table-layout:fixed;font-size:13px}th,td{border:1px solid #d3e0e7;text-align:left;vertical-align:top;padding:9px}th{background:#eaf4f4}.table-wrap{max-width:100%}.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:18px 0}.metric{border:1px solid #bcd9d8;border-radius:9px;padding:12px;background:#f1f9f8}.metric span{font-size:12px;display:block;color:#4c6975}.metric strong{font-size:20px;display:block;overflow-wrap:anywhere}.notice{background:#fff6dc;border-left:4px solid #ba861c;padding:12px 14px}.muted,footer{font-size:12px;color:#5f7580}.path{border-top:1px solid #d7e3e9;padding:16px 0}.path li{padding:5px 0}details{margin:16px 0;border-top:1px solid #c6d9df;padding-top:12px}summary{font-weight:700;cursor:pointer}.explanation{white-space:pre-wrap}footer{padding:20px 0}@media(max-width:600px){main{padding:10px}header,section{padding:14px}h1{font-size:24px}table{font-size:11px}td,th{padding:6px}}@media print{@page{size:A4;margin:12mm}body{background:white;font-size:10pt}main{padding:0;max-width:none}header,section{border-radius:0;box-shadow:none}section{padding:10px;break-before:auto}h2,h3,h4,summary{break-after:avoid}tr,.metric{break-inside:avoid}thead{display:table-header-group}details::details-content{content-visibility:visible!important}details>*:not(summary){display:block!important}details>div.table-wrap{display:block!important}a{color:inherit}footer{border-top:1px solid #aaa}}
    @media screen and (max-width:600px){table,tbody,tr,td{display:block}thead{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}tr{border:1px solid #c6d9df;border-radius:8px;margin:10px 0;overflow:hidden}td{border:0;border-bottom:1px solid #e1e9ed;padding:9px;font-size:12px}td:last-child{border-bottom:0}td::before{content:attr(data-label);display:block;color:#557581;font-weight:700;font-size:11px;margin-bottom:3px}}
    </style></head><body><main>${body}</main></body></html>`;
}
