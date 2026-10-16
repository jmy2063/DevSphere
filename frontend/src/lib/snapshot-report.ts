import type {ImpactNode} from './api';
import {reportDocument,reviewBlock,type ReportData} from './report';
import {compareSavedReports,savedAnalyses} from './snapshots';

const escape=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const code=(v:unknown)=>`<code>${escape(v)}</code>`;
const notice=(v:string)=>`<p class="notice">${escape(v)}</p>`;
const metric=(label:string,v:unknown)=>`<div class="metric"><span>${escape(label)}</span><strong>${escape(v)}</strong></div>`;
function table(headers:string[],rows:string[][]):string {
  return rows.length?`<div class="table-wrap"><table role="table"><thead role="rowgroup"><tr role="row">${headers.map(h=>`<th scope="col" role="columnheader">${escape(h)}</th>`).join('')}</tr></thead><tbody role="rowgroup">${rows.map(row=>`<tr role="row">${row.map((v,i)=>`<td role="cell" data-label="${escape(headers[i])}">${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:'<p class="muted">해당 항목이 없습니다.</p>';
}
const location=(n:ImpactNode)=>`${escape(n.sourcePath||'위치 없음')}:${escape(n.line)}–${escape(n.endLine)}`;
const evidence=(n:ImpactNode)=>`${escape(n.type)} · ${escape(n.depth)}단계 · ${escape(Math.round(n.confidence*100))}%<br>${escape(n.relation)} / ${escape(n.direction)}`;
function nodes(title:string,rows:ImpactNode[]):string {
  return `<section><h2>${escape(title)} · ${rows.length}개</h2>${table(['대상 / ID','소스 위치','근거'],rows.map(n=>[`${escape(n.name)}<br>${code(n.id)}`,location(n),evidence(n)]))}</section>`;
}
function source(label:string,name:string,report:ReportData):string {
  const g=report.github;
  return `<section><h2>${escape(label)} 보고서</h2>${table(['항목','파일에 기록된 값'],[
    ['파일 / 보관 이름',escape(name)],['프로젝트 ID',code(report.project.projectId)],
    ['생성 시각',escape(report.generatedAt)],['불러온 시각',escape(report.importedAt||'기록 없음')],
    ['사용자 프로젝트 비교 키',code(report.comparisonKey||'미지정')],
    ['그래프 크기',escape(`${report.project.nodeCount}개 노드 / ${report.project.edgeCount}개 관계`)],
    ...(g?[
      ['GitHub 변경 대상',escape(`${g.owner}/${g.repo} · ${g.kind} ${g.reference}`)],
      ['BASE / HEAD',`${code(g.baseSha)}<br>${code(g.headSha)}`],
      ['매핑 / revision 상태',escape(`${g.mappingSide} / ${g.revisionStatus}`)],
      ['Java 소스 검증 기록',`${escape(g.sourceVerification?.status||'NOT_REQUESTED')}<br>${code(g.sourceVerification?.revision||'')}`]
    ]:[])
  ])}${report.project.warnings.map(notice).join('')}${g?g.warnings.map(notice).join(''):''}</section>`;
}

export function buildSnapshotComparisonHtml(before:ReportData,after:ReportData,key:string,beforeName:string,afterName:string,generatedAt=new Date().toISOString()):string {
  // Recompute through the same gates as the UI; never accept caller-supplied delta counts.
  const delta=compareSavedReports(before,after,key);
  if(delta.error)throw new Error(delta.error);
  const analysis=savedAnalyses(before).find(a=>a.key===key)!;
  const change=delta.riskAfter-delta.riskBefore;
  const body=`<header><h1>DevSphere AX 결과 비교 보고서</h1><p>${escape(analysis.label)}<br>비교 보고서 생성 ${escape(generatedAt)}</p></header>
    <section><h2>비교 요약</h2><p>기준 → 비교 순서입니다. 범위 ${code(analysis.scope)} · 최대 ${escape(analysis.maxDepth)}단계 · ${escape(analysis.kind)}</p>
    <div class="metrics">${metric('추가',delta.added.length)}${metric('제외',delta.removed.length)}${metric('근거·위치 변경',delta.changed.length)}${metric('유지',delta.unchanged)}${metric('테스트 추가',delta.testsAdded.length)}${metric('테스트 제외',delta.testsRemoved.length)}</div>
    <p>CRI ${escape(delta.riskBefore)} → ${escape(delta.riskAfter)} (${change>=0?'+':''}${escape(change)})${before.github?' · 개별 시작점 최댓값':''} · 변경 시작점 ${delta.startsBefore} → ${delta.startsAfter}개</p>
    ${notice('CRI는 그래프 근거 기반 상대 위험지수이며 장애 확률이 아닙니다. 테스트는 실행·커버리지 증명이 아닌 검토 후보입니다.')}
    ${delta.warnings.map(notice).join('')}
    ${notice('추가·제외와 근거·위치 변화는 저장된 분석 결과의 차이입니다. 실제 기능 변경·장애·테스트 성공 여부를 판정하지 않습니다. 의미 식별자를 비교하며 경로 전체의 차이는 별도 판정하지 않습니다.')}
    <p>후보 목록은 화면의 처음 50개 제한 없이 모두 포함합니다. 유지된 후보의 개별 목록과 원본 그래프·경로는 포함하지 않습니다. 재검토·재비교하려면 양쪽 원본 JSON도 함께 보관하세요. 이 HTML은 JSON 불러오기 대상이 아닙니다.</p></section>
    ${source('기준',beforeName,before)}${source('비교',afterName,after)}
    ${reviewBlock(before,key,'기준 검토 기록')}${reviewBlock(after,key,'비교 검토 기록')}
    <section><h2>비교한 변경 시작점</h2>${table(['기준','비교'],[[analysis.results.map(r=>`${escape(r.changedNodeName)}<br>${code(r.changedNode)}`).join('<hr>'),savedAnalyses(after).find(a=>a.key===key)!.results.map(r=>`${escape(r.changedNodeName)}<br>${code(r.changedNode)}`).join('<hr>')]])}</section>
    ${nodes('추가된 영향 후보',delta.added)}${nodes('제외된 영향 후보',delta.removed)}
    <section><h2>근거·위치가 달라진 후보 · ${delta.changed.length}개</h2>${table(['이전 대상 / ID','이후 대상 / ID','이전 위치 / 근거','이후 위치 / 근거'],delta.changed.map(pair=>[`${escape(pair.before.name)}<br>${code(pair.before.id)}`,`${escape(pair.after.name)}<br>${code(pair.after.id)}`,`${location(pair.before)}<br>${evidence(pair.before)}`,`${location(pair.after)}<br>${evidence(pair.after)}`]))}</section>
    ${nodes('추가된 테스트 후보',delta.testsAdded)}${nodes('제외된 테스트 후보',delta.testsRemoved)}
    <footer>DevSphere AX · 저장된 결과 비교 · 파일의 출처·변조 여부·소스·분석기 버전을 재검증하지 않았습니다. 서버 없이 열 수 있으며 자동 갱신되지 않습니다.</footer>`;
  return reportDocument('DevSphere AX 결과 비교 보고서',body);
}
