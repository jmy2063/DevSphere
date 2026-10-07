import {useMemo,useState} from 'react';
import type {Impact,ImpactNode} from '../lib/api';

export default function ImpactReview({result,onFocus}:{result:Impact;onFocus?:(ids:string[])=>void}){
  const [query,setQuery]=useState('');
  const [kind,setKind]=useState('ALL');
  const [expanded,setExpanded]=useState(false);
  const [copied,setCopied]=useState('');
  const nodes=useMemo(()=>[...new Map([...result.directImpact,...result.indirectImpact].map(n=>[n.id,n])).values()], [result]);
  const filtered=nodes.filter(n=>(kind==='ALL'||n.type===kind)&&`${n.name} ${n.id} ${n.sourcePath}`.toLowerCase().includes(query.toLowerCase()));
  const shown=expanded?filtered:filtered.slice(0,8);
  const tests=nodes.filter(n=>n.type==='TEST');
  const [pathQuery,setPathQuery]=useState('');
  const [allPaths,setAllPaths]=useState(false);
  const paths=result.paths.filter(p=>`${p.targetName} ${p.steps.map(s=>s.name+' '+s.sourcePath).join(' ')}`.toLowerCase().includes(pathQuery.toLowerCase()));
  async function copy(id:string){
    try{await navigator.clipboard.writeText(id);setCopied(id)}catch{setCopied('복사 실패: 아래 Node ID를 직접 선택해주세요.')}
  }
  function location(n:ImpactNode){return n.sourcePath?`${n.sourcePath}:${n.line}${n.endLine>n.line?`–${n.endLine}`:''}`:'소스 위치 없음'}
  return <section className="impact-review" aria-label="변경 검토">
    <h3>이 변경에서 확인할 항목</h3>
    <div className="review-counts"><span>API <b>{result.apis.length}</b></span><span>Entity / Table <b>{result.entities.length}</b></span><span>테스트 후보 <b>{tests.length}</b></span></div>
    <p className="review-note">근거 신뢰도 {Math.round(result.evidenceConfidence*100)}%는 정적 관계의 가중치로 계산한 값입니다. 측정된 정확도나 장애 확률이 아닙니다.</p>
    <details className="review-details" open><summary>먼저 확인할 테스트 후보 · {tests.length}개</summary>
      <p className="review-note">연결된 테스트 후보이며 실행 결과나 변경 코드의 커버리지를 보장하지 않습니다.</p>
      {tests.length?tests.map(n=><div className="review-node" key={n.id}><b>{n.name}</b><span>{location(n)}</span><small>{n.depth}단계 · {n.relation} · 신뢰도 {Math.round(n.confidence*100)}%</small></div>):<p className="review-note">연결된 테스트를 찾지 못했습니다. 변경 동작을 검증하는 테스트를 직접 확인하세요.</p>}
    </details>
    <h4>전체 영향 후보 · {nodes.length}개</h4>
    <div className="review-filters"><input aria-label="영향 후보 검색" placeholder="이름·파일·Node ID 검색" value={query} onChange={e=>{setQuery(e.target.value);setExpanded(false)}}/><select aria-label="영향 유형" value={kind} onChange={e=>{setKind(e.target.value);setExpanded(false)}}><option value="ALL">모든 유형</option>{[...new Set(nodes.map(n=>n.type))].sort().map(t=><option key={t}>{t}</option>)}</select></div>
    <p className="review-note">검색 결과 {filtered.length}개 중 {shown.length}개 표시</p>
    {shown.map(n=><details className="review-details" key={n.id}><summary>{n.type} · {n.name} · {n.depth}단계</summary><div className="review-node"><span>{location(n)}</span><small>{n.direction} · {n.relation} · 신뢰도 {Math.round(n.confidence*100)}%</small><code>{n.id}</code><button className="review-button" onClick={()=>void copy(n.id)}>평가용 Node ID 복사</button>{copied===n.id&&<small role="status">복사했습니다.</small>}</div></details>)}
    {!filtered.length&&<p className="review-note">검색 조건에 맞는 영향 후보가 없습니다.</p>}
    {copied.startsWith('복사 실패')&&<p role="status" className="review-note">{copied}</p>}
    {filtered.length>8&&<button className="review-button" onClick={()=>setExpanded(!expanded)}>{expanded?'접기':`나머지 ${filtered.length-8}개 모두 보기`}</button>}
    <h4>근거 경로 · {result.paths.length}개</h4>
    <input className="path-search" aria-label="근거 경로 검색" placeholder="경로 대상·메소드·파일 검색" value={pathQuery} onChange={e=>{setPathQuery(e.target.value);setAllPaths(false)}}/>
    <p className="review-note">검색 결과 {paths.length}개 중 {Math.min(paths.length,allPaths?paths.length:5)}개 표시 · 엔진이 반환한 대표 경로입니다.</p>
    {(allPaths?paths:paths.slice(0,5)).map(p=><details className="review-details" key={p.targetId}><summary>{p.targetName} · {p.hopCount}단계 · {Math.round(p.pathConfidence*100)}%</summary>
      <ol className="review-steps">{p.steps.map((s,i)=><li key={`${s.id}-${i}`}><b>{s.name}</b><span>{s.viaRelation} · {s.direction}</span><code>{s.sourcePath?`${s.sourcePath}:${s.line}${s.endLine>s.line?`–${s.endLine}`:''}`:'소스 위치 없음'}</code></li>)}</ol>
      {onFocus&&<button className="review-button" onClick={()=>onFocus(p.steps.map(s=>s.id))}>그래프에서 이 경로 보기</button>}
    </details>)}
    {!paths.length&&<p className="review-note">표시할 근거 경로가 없습니다.</p>}
    {paths.length>5&&<button className="review-button" onClick={()=>setAllPaths(!allPaths)}>{allPaths?'경로 접기':`나머지 ${paths.length-5}개 경로 모두 보기`}</button>}
  </section>
}
