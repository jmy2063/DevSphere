import {useState,type ReactNode} from 'react';
import type {GithubChangeReport} from '../lib/api';

export default function GithubReportPanel({report,children}:{report:GithubChangeReport;children:ReactNode}){
  const [query,setQuery]=useState('');
  const s=report.summary;
  const verification=report.sourceVerification;
  const revisionLabels:Record<string,string>={UNVERIFIED:'ZIP 버전 미확인 · HEAD 가정',DECLARED_HEAD_MATCH:'입력한 커밋: HEAD 일치',DECLARED_BASE_MATCH:'입력한 커밋: BASE 일치',DECLARED_MISMATCH:'입력한 커밋: 버전 불일치',VERIFIED_JAVA_HEAD:'Java 소스 검증 완료 · HEAD',VERIFIED_JAVA_BASE:'Java 소스 검증 완료 · BASE',JAVA_CONTENT_MISMATCH:'Java 소스 불일치 · 분석 중단',JAVA_VERIFICATION_UNAVAILABLE:'Java 소스 검증 불가 · 분석 중단'};
  const mappingLabels:Record<string,string>={MAPPED_METHOD:'메소드 매핑',CLASS_FALLBACK:'파일/클래스 후보',UNMAPPED:'매핑 실패',AMBIGUOUS_PATH:'경로 중복',SKIPPED_NON_JAVA:'Java 외 파일'};
  const files=report.files.filter(f=>`${f.filename} ${f.previousFilename} ${f.reason}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="github-report" aria-label="GitHub 변경 요약">
    <h2>{report.kind==='PR'?'PR':'Commit'} 분석 요약 · {report.owner}/{report.repo} · {report.reference}</h2>
    <div className="revision-status"><b>{revisionLabels[report.revisionStatus]||report.revisionStatus}</b><span>매핑 방향: {report.mappingSide}</span><code>BASE {report.baseSha||'없음'}</code><code>HEAD {report.headSha||'없음'}</code></div>
    {report.warnings.map((w,i)=><p className="report-warning" key={i}>{w}</p>)}
    {verification&&verification.status!=='NOT_REQUESTED'&&<section className={`source-verification ${verification.status==='VERIFIED'?'verified':''}`} aria-label="Java 소스 검증 결과">
      <h3>Java 소스 내용 검증</h3><p>{verification.message}</p>
      {verification.revision&&<code>비교 커밋 {verification.revision}</code>}
      {verification.zipPrefix&&<p>ZIP 최상위 폴더: {verification.zipPrefix}</p>}
      <div className="report-counts"><span>ZIP Java <b>{verification.localFiles}</b></span><span>저장소 Java <b>{verification.repositoryFiles}</b></span><span>일치 <b>{verification.matchedFiles}</b></span><span>내용 변경 <b>{verification.changedFiles}</b></span><span>ZIP 누락 <b>{verification.missingFiles}</b></span><span>ZIP 추가 <b>{verification.extraFiles}</b></span></div>
      {!!verification.differences.length&&<details className="review-details" open><summary>Java 불일치 파일 · {verification.changedFiles+verification.missingFiles+verification.extraFiles}개</summary>{verification.differences.map(d=><div className="review-node" key={d.path}><b>{d.path}</b><span>{({CONTENT_CHANGED:'내용 변경',MISSING_IN_ZIP:'ZIP에 없음',EXTRA_IN_ZIP:'ZIP에만 있음'} as Record<string,string>)[d.status]||d.status}</span></div>)}<small>불일치 경로는 최대 100개 표시합니다.</small></details>}
      <p className="review-note">분석 대상 Java의 경로와 원본 바이트를 비교합니다. build/target 등 생성 폴더는 제외하며 설정·리소스는 검증하지 않습니다. 줄바꿈 차이도 불일치로 판정합니다.</p>
    </section>}
    <div className="report-counts"><span>변경 파일 <b>{s.changedFiles}</b></span><span>메소드 매핑 <b>{s.methodMappedFiles}/{s.javaFiles}</b></span><span>파일 후보 <b>{s.fallbackFiles}</b></span><span>Java 매핑 실패 <b>{s.unmappedJavaFiles}</b></span><span>중복 제거 영향 <b>{s.uniqueImpactNodes}</b></span><span>시작점별 최고 CRI <b>{s.maxStartRiskScore}</b></span></div>
    <p className="review-note">영향은 Node ID로 중복 제거하고 변경 시작점은 제외했습니다. 최고 CRI는 개별 시작점 중 최댓값이며 PR 전체 위험 점수가 아닙니다.</p>
    <details className="review-details" open><summary>추천 테스트 후보 · {s.tests.length}개</summary><p className="review-note">가까운 경로와 높은 근거 신뢰도를 우선합니다. 실제 테스트 실행이나 커버리지는 확인하지 않았습니다.</p>{s.tests.map(t=><div className="review-node" key={t.id}><b>{t.name}</b><span>{t.sourcePath}:{t.line} · {t.depth}단계 · {Math.round(t.confidence*100)}%</span><small>연결된 변경: {t.changedStarts.join(' · ')}</small></div>)}</details>
    <details className="review-details" open><summary>파일별 매핑 결과 · {report.files.length}개</summary><input className="path-search" aria-label="변경 파일 검색" placeholder="파일 경로·실패 이유 검색" value={query} onChange={e=>setQuery(e.target.value)}/>{files.map((f,i)=><div className="review-node" key={`${f.filename}-${i}`}><b>{f.filename}</b>{f.previousFilename&&<span>이전 경로: {f.previousFilename}</span>}<span>{mappingLabels[f.mappingStatus]||f.mappingStatus} · {f.changeStatus}</span><small>{f.reason}</small><small>시작점 {f.startNodeIds.length}개</small></div>)}{!files.length&&<p className="review-note">검색 조건에 맞는 변경 파일이 없습니다.</p>}</details>
    {children}
  </section>
}
