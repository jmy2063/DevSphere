import {useEffect,useMemo,useState} from 'react';
import type {ReportData,ReviewDecision,ReviewLog} from '../lib/report';
import {savedAnalyses} from '../lib/snapshots';

const labels:Record<ReviewDecision,string>={CONFIRMED:'영향 확인',EXCLUDED:'제외',NEEDS_REVIEW:'확인 필요',MISSING:'누락 후보'};
export default function ReviewEditor({report,disabled,onChange}:{report:ReportData;disabled:boolean;onChange:(log:ReviewLog)=>boolean}){
  const analyses=useMemo(()=>savedAnalyses(report),[report]);
  const [key,setKey]=useState(''),[nodeId,setNodeId]=useState(''),[query,setQuery]=useState('');
  const [mode,setMode]=useState('CANDIDATES');
  const [reviewer,setReviewer]=useState(report.review?.reviewer||'');
  const [decision,setDecision]=useState<ReviewDecision>('NEEDS_REVIEW'),[reason,setReason]=useState('');
  const [message,setMessage]=useState(''),[error,setError]=useState('');
  const [allEntries,setAllEntries]=useState(false);
  const analysis=analyses.find(a=>a.key===key)||analyses.find(a=>a.scope==='FEATURE')||analyses[0];
  const graph=useMemo(()=>new Map(report.project.nodes.map(n=>[n.id,n])),[report.project]);
  const candidates=useMemo(()=>new Set(analysis?.results.flatMap(r=>[...r.directImpact,...r.indirectImpact].map(n=>n.id))||[]),[analysis]);
  const starts=useMemo(()=>new Set(analysis?.results.map(r=>r.changedNode)||[]),[analysis]);
  const available=useMemo(()=>report.project.nodes.filter(n=>!['PROJECT','PACKAGE'].includes(n.type)&&!starts.has(n.id)&&(mode==='CANDIDATES'?candidates.has(n.id):!candidates.has(n.id))),[report.project,starts,candidates,mode]);
  const filtered=available.filter(n=>`${n.name} ${n.id} ${n.sourcePath}`.toLowerCase().includes(query.toLowerCase()));
  const node=available.find(n=>n.id===nodeId)||filtered[0];
  const shown=filtered.slice(0,100);
  if(node&&!shown.some(n=>n.id===node.id))shown.unshift(node);
  const entries=report.review?.entries||[];
  const entry=entries.find(e=>e.analysisKey===analysis?.key&&e.nodeId===node?.id);
  useEffect(()=>{setDecision(entry?.decision||(mode==='MISSING'?'MISSING':'NEEDS_REVIEW'));setReason(entry?.reason||'');setError('');},[analysis?.key,node?.id,entry,mode]);
  useEffect(()=>{setMessage('');},[analysis?.key,node?.id,mode]);
  useEffect(()=>{setAllEntries(false);},[analysis?.key]);
  const current=entries.filter(e=>e.analysisKey===analysis?.key);
  const recorded=new Set(current.map(e=>e.nodeId));
  const unrecorded=[...candidates].filter(id=>!starts.has(id)&&!recorded.has(id)).length;
  function save(){
    setError('');setMessage('');if(!analysis||!node)return;
    if(['EXCLUDED','MISSING'].includes(decision)&&!reason.trim()){setError('제외·누락 후보에는 판단 이유를 입력해주세요.');return;}
    const next={analysisKey:analysis.key,nodeId:node.id,decision,reason:reason.trim(),updatedAt:new Date().toISOString()};
    const updated=[...entries.filter(e=>e.analysisKey!==analysis.key||e.nodeId!==node.id),next];
    if(updated.length>2000){setError('검토 기록은 보고서당 최대 2,000개입니다.');return;}
    if(onChange({version:1,reviewer:reviewer.trim(),entries:updated}))setMessage('검토 기록을 반영했습니다. JSON 다시 저장으로 파일에 보관하세요.');
  }
  return <section className="review-editor" aria-label="검토 기록 편집"><h3>검토 판단과 이유</h3>
    <p className="review-note">선택한 결과의 복사본에 기록합니다. 분석 후보·점수·평가 지표는 바뀌지 않습니다. 검토자 이름은 직접 입력한 표기이며 독립 검수나 테스트 실행을 인증하지 않습니다. 새로고침 전 JSON을 다시 저장하세요.</p>
    {!analyses.length?<p>분석된 시작점이 없는 보고서에는 대상별 기록을 남길 수 없습니다.</p>:<fieldset disabled={disabled}>
      <label>검토자 표기 (선택)<input aria-label="검토자 표기" maxLength={100} value={reviewer} onChange={e=>setReviewer(e.target.value)}/></label>
      <label>검토할 분석<select aria-label="검토할 분석" value={analysis?.key||''} onChange={e=>{setKey(e.target.value);setNodeId('');setQuery('');}}>{analyses.map(a=><option key={a.key} value={a.key}>{a.label}</option>)}</select></label>
      <div className="review-counts"><span>미기록 <b>{unrecorded}</b></span>{(Object.keys(labels) as ReviewDecision[]).map(d=><span key={d}>{labels[d]} <b>{current.filter(e=>e.decision===d).length}</b></span>)}</div>
      <label>대상 구분<select aria-label="검토 대상 구분" value={mode} onChange={e=>{setMode(e.target.value);setNodeId('');setQuery('');}}><option value="CANDIDATES">분석 후보 검토</option><option value="MISSING">누락 후보 추가</option></select></label>
      {mode==='MISSING'&&<p className="review-note">그래프에는 있지만 이 분석의 후보 목록에는 없는 대상을 기록합니다. 그래프 자체에 없는 파일·노드는 이번 단계에서 추가할 수 없습니다.</p>}
      <input aria-label="검토 대상 검색" placeholder="이름·파일·Node ID 검색" value={query} onChange={e=>{setQuery(e.target.value);setNodeId('');}}/>
      <p className="review-note">검색 결과 {filtered.length}개 · 목록은 처음 100개와 현재 선택을 표시합니다.</p>
      <label>검토 대상<select aria-label="검토 대상" value={node?.id||''} onChange={e=>setNodeId(e.target.value)}>{!node&&<option value="">선택 가능한 대상 없음</option>}{shown.map(n=><option key={n.id} value={n.id}>{n.type} · {n.name}</option>)}</select></label>
      {node&&<><p><code>{node.id}</code><br/>{node.sourcePath}:{node.line}</p>
        <label>판단<select aria-label="검토 판단" value={decision} onChange={e=>setDecision(e.target.value as ReviewDecision)}>{(mode==='MISSING'?['MISSING'] as ReviewDecision[]:['NEEDS_REVIEW','CONFIRMED','EXCLUDED'] as ReviewDecision[]).map(d=><option key={d} value={d}>{labels[d]}</option>)}</select></label>
        <label>판단 이유<textarea aria-label="검토 판단 이유" maxLength={2000} rows={3} value={reason} onChange={e=>setReason(e.target.value)} placeholder="소스·호출 경로·테스트 근거를 기록하세요."/></label>
        <button className="review-button" onClick={save}>기록 저장</button></>}
      {error&&<p role="alert" className="saved-error">{error}</p>}{message&&<p role="status">{message}</p>}
      <details className="review-details"><summary>이 분석의 저장된 검토 기록 · {current.length}개</summary>{(allEntries?current:current.slice(0,50)).map(e=><article className="review-node" key={e.nodeId}><b>{labels[e.decision]} · {graph.get(e.nodeId)?.name||e.nodeId}</b><code>{e.nodeId}</code><p>{e.reason||'판단 이유 없음'}</p><small>{e.updatedAt}</small><div className="saved-actions"><button className="review-button" onClick={()=>{setMode(e.decision==='MISSING'?'MISSING':'CANDIDATES');setQuery('');setNodeId(e.nodeId);}}>이 기록 편집</button><button className="review-button" onClick={()=>{setMessage('');onChange({version:1,reviewer:reviewer.trim(),entries:entries.filter(x=>x!==e)});}}>기록 삭제</button></div></article>)}{current.length>50&&<button className="review-button" onClick={()=>setAllEntries(!allEntries)}>{allEntries?'기록 접기':`나머지 ${current.length-50}개 기록 보기`}</button>}</details>
    </fieldset>}
  </section>;
}
