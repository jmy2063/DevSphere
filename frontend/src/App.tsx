import {DragEvent,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {
  Activity,AlertTriangle,BarChart3,Download,FileCode2,GitBranch,Github,Layers3,
  Network,Search,ShieldCheck,UploadCloud
} from 'lucide-react';
import GraphView from './components/GraphView';
import ImpactReview from './components/ImpactReview';
import GithubReportPanel from './components/GithubReportPanel';
import ResultSnapshot from './components/ResultSnapshot';
import EvidencePathPanel from './components/EvidencePathPanel';
import {parseGithubPrUrl} from './lib/github-url';
import {
  evaluateGroundTruth,githubChangeReport,health,impact,impactComparison,uploadZip,
  type GithubChangeReport,type AnalysisScope,type Evaluation,type Health,type Impact,type ImpactComparison,type ImpactPath,type ImpactNode,type Summary
} from './lib/api';

const scopeInfo:Record<AnalysisScope,{label:string;desc:string;depth:number}>={
  LOCAL:{label:'LOCAL · 근접 영향',desc:'직접/근거리 관계 중심',depth:2},
  FEATURE:{label:'FEATURE · 기능 범위',desc:'API·Service·DB·Test 연쇄 분석',depth:4},
  SYSTEM:{label:'SYSTEM · 광역 리스크',desc:'최대 6단계 + 신뢰도 가지치기',depth:6},
};

export default function App(){
  const [summary,setSummary]=useState<Summary|null>(null);
  const [selected,setSelected]=useState('');
  const [result,setResult]=useState<Impact|null>(null);
  const [comparison,setComparison]=useState<ImpactComparison|null>(null);
  const [prReport,setPrReport]=useState<GithubChangeReport|null>(null);
  const [prUrl,setPrUrl]=useState('');
  const [uploadedRevision,setUploadedRevision]=useState('');
  const [verifySources,setVerifySources]=useState(true);
  const [evaluation,setEvaluation]=useState<Evaluation|null>(null);
  const [busy,setBusy]=useState(false);
  const [busyLabel,setBusyLabel]=useState('');
  const [dragging,setDragging]=useState(false);
  const [error,setError]=useState('');
  const [query,setQuery]=useState('');
  const [scope,setScope]=useState<AnalysisScope>('FEATURE');
  const [server,setServer]=useState<Health|null>(null);
  const [owner,setOwner]=useState('');
  const [repo,setRepo]=useState('');
  const [pr,setPr]=useState('');
  const [commitSha,setCommitSha]=useState('');
  const [token,setToken]=useState('');
  const [groundTruth,setGroundTruth]=useState('');
  const [focusedPath,setFocusedPath]=useState<ImpactPath|null>(null);
  const [inspectedNodeId,setInspectedNodeId]=useState('');
  const snapshotRef=useRef<HTMLElement>(null);
  const analysisRef=useRef<HTMLElement>(null);

  useEffect(()=>{health().then(setServer).catch(()=>setServer(null))},[]);
  useEffect(()=>{
    if(!summary)return;
    const frame=requestAnimationFrame(()=>{
      analysisRef.current?.scrollIntoView({behavior:'smooth',block:'start'});
      analysisRef.current?.focus({preventScroll:true});
    });
    return ()=>cancelAnimationFrame(frame);
  },[summary]);
  useEffect(()=>{
    if(!result&&!comparison&&!prReport)return;
    const frame=requestAnimationFrame(()=>{
      snapshotRef.current?.scrollIntoView({behavior:'smooth',block:'start'});
      snapshotRef.current?.focus({preventScroll:true});
    });
    return ()=>cancelAnimationFrame(frame);
  },[result,comparison,prReport]);
  const candidateSearch=useMemo(()=>{
    const all=summary?.nodes.filter(n=>['CONTROLLER','SERVICE','REPOSITORY','ENTITY','METHOD'].includes(n.type))||[];
    const q=query.trim().toLowerCase();
    const matches=q?all.filter(n=>(n.name+' '+n.type+' '+n.sourcePath).toLowerCase().includes(q)):all;
    return {total:matches.length,nodes:matches.slice(0,500)};
  },[summary,query]);
  const selectedNode=summary?.nodes.find(n=>n.id===selected)||null;
  const candidates=selectedNode&&!candidateSearch.nodes.some(n=>n.id===selectedNode.id)?[selectedNode,...candidateSearch.nodes]:candidateSearch.nodes;
  const inspectedNode=summary?.nodes.find(n=>n.id===(inspectedNodeId||selected))||null;

  function clearOutputs(){
    setFocusedPath(null);setInspectedNodeId('');
    setResult(null);setComparison(null);setPrReport(null);setEvaluation(null);
  }

  async function analyzeFile(file:File){
    if(busy)return;
    setBusy(true);setBusyLabel('프로젝트를 분석하고 있습니다…');setError('');clearOutputs();
    try{
      const next=await uploadZip(file);setSummary(next);setQuery('');setGroundTruth('');setUploadedRevision('');
      const first=next.nodes.find(n=>n.type==='SERVICE')?.id||next.nodes.find(n=>n.type==='CONTROLLER')?.id||next.nodes[0]?.id||'';
      setSelected(first);setInspectedNodeId(first);
    }catch(e){setError(messageOf(e))}finally{setBusy(false);setBusyLabel('')}
  }
  async function runImpact(){
    if(!summary||!selected||busy)return;setBusy(true);setBusyLabel('영향 경로를 분석하고 있습니다…');setError('');clearOutputs();
    try{setResult(await impact(summary.projectId,selected,scope,scopeInfo[scope].depth))}catch(e){setError(messageOf(e))}finally{setBusy(false);setBusyLabel('')}
  }
  async function runComparison(){
    if(!summary||!selected||busy)return;setBusy(true);setBusyLabel('분석 범위를 비교하고 있습니다…');setError('');clearOutputs();
    try{setComparison(await impactComparison(summary.projectId,selected))}catch(e){setError(messageOf(e))}finally{setBusy(false);setBusyLabel('')}
  }
  async function runPr(){
    if(!summary||busy)return;
    let target:{owner:string;repo:string;pullNumber:number};
    try{
      const number=Number(pr);
      target=prUrl.trim()?parseGithubPrUrl(prUrl):{owner,repo,pullNumber:number};
    }catch(e){setError(messageOf(e));return}
    setBusy(true);setBusyLabel('PR 변경과 영향 경로를 분석하고 있습니다…');setError('');clearOutputs();
    try{
      setOwner(target.owner);setRepo(target.repo);setPr(String(target.pullNumber));
      setPrReport(await githubChangeReport(summary.projectId,{...target,scope,maxDepth:scopeInfo[scope].depth,uploadedRevision,verifySources},token));
    }catch(e){setError(messageOf(e))}finally{setBusy(false);setBusyLabel('')}
  }
  async function runCommit(){
    if(!summary||busy)return;setBusy(true);setBusyLabel('Commit 변경과 영향 경로를 분석하고 있습니다…');setError('');clearOutputs();
    try{
      setPrReport(await githubChangeReport(summary.projectId,{owner,repo,sha:commitSha,scope,maxDepth:scopeInfo[scope].depth,uploadedRevision,verifySources},token));
    }catch(e){setError(messageOf(e))}finally{setBusy(false);setBusyLabel('')}
  }
  async function runEvaluation(){
    if(!summary||!selected)return;
    const expected=groundTruth.split(/\r?\n|,/).map(x=>x.trim()).filter(Boolean);
    if(!expected.length){setError('Ground Truth 대상 이름 또는 Node ID를 한 줄에 하나씩 입력해주세요.');return}
    setBusy(true);setBusyLabel('Ground Truth를 평가하고 있습니다…');setError('');setEvaluation(null);
    try{setEvaluation(await evaluateGroundTruth(summary.projectId,selected,scope,scopeInfo[scope].depth,expected,5))}
    catch(e){setError(messageOf(e))}finally{setBusy(false);setBusyLabel('')}
  }
  function focusPath(path:ImpactPath){
    setFocusedPath(path);setInspectedNodeId(path.targetId);
    document.querySelector('.graph-section')?.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function inspectNode(id:string){
    setFocusedPath(null);setInspectedNodeId(id);
    document.querySelector('.graph-section')?.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function drop(e:DragEvent){e.preventDefault();setDragging(false);const file=e.dataTransfer.files?.[0];if(file)void analyzeFile(file)}
  function exportReport(){
    if(!summary)return;
    const payload={generatedAt:new Date().toISOString(),project:summary,result,comparison,github:prReport,evaluation};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');
    a.href=url;a.download=`DevSphere_AX_${summary.projectId}_report.json`;a.click();URL.revokeObjectURL(url);
  }

  return <main>
    <header>
      <div><p className="eyebrow">SOFTWARE CHANGE INTELLIGENCE</p><h1>DevSphere <span>AX</span></h1><p className="subtitle">메소드 한 줄의 변경부터 <b>시스템 전반의 Blast Radius</b>까지 근거 경로로 추적</p></div>
      <div className="header-right"><div className={`status ${server?'online':'offline'}`}><Activity size={15}/>{server?'Backend Connected':'Backend Offline'}</div><div className="mvp">Java 17 · Spring Boot · GitHub PR/Commit · Method Path · CRI</div></div>
    </header>

    {error&&<div className="error-banner" role="alert"><AlertTriangle size={18}/><span>{error}</span><button onClick={()=>setError('')}>닫기</button></div>}
    {summary?.warnings?.map((w,i)=><div className="warning-banner" key={i}>{w}</div>)}
    <div className="flow-progress" aria-label="분석 진행 단계">
      <span className={summary?'done':'current'}><b>1</b> 프로젝트 ZIP 업로드</span>
      <span className={summary&&(result||comparison||prReport)?'done':summary?'current':''}><b>2</b> 변경 메서드 또는 PR 선택</span>
      <span className={result||comparison||prReport?'current':''}><b>3</b> 결과와 근거 확인</span>
    </div>
    {busyLabel&&<p className="flow-status" role="status">{busyLabel}</p>}

    <section className="top-grid">
      <div className={`panel uploader ${dragging?'dragging':''}`} onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={drop}>
        <div className="icon-box"><UploadCloud size={28}/></div><div><h2>1. Spring 프로젝트 업로드</h2><p>{summary?`준비 완료 · ${summary.projectId}`:'Java/Spring 프로젝트 ZIP을 선택하세요. 업로드 후 변경 메서드 또는 PR을 분석할 수 있습니다.'}</p></div>
        <label className="upload-button">{busy?'처리 중…':summary?'다른 ZIP 선택':'ZIP 선택'}<input type="file" accept=".zip" disabled={busy} onChange={e=>e.target.files?.[0]&&void analyzeFile(e.target.files[0])}/></label>
      </div>
      {summary?<div className="panel metric-panel"><Metric label="Classes" value={summary.analyzedClasses}/><Metric label="Nodes" value={summary.nodeCount}/><Metric label="Edges" value={summary.edgeCount}/><Metric label="Methods" value={summary.methods}/><Metric label="APIs" value={summary.apis}/><Metric label="Analyze" value={`${summary.analysisDurationMs}ms`}/></div>:<div className="panel metric-empty"><Network size={26}/><b>분석 준비</b><span>ZIP을 업로드하면 프로젝트 구조와 분석 대상을 보여드립니다.</span></div>}
    </section>

    {(result||comparison||prReport)&&<section ref={snapshotRef} tabIndex={-1} className="result-snapshot" aria-label="핵심 분석 결과">
      <ResultSnapshot result={result} comparison={comparison} report={prReport} scope={scope} onDetails={()=>document.getElementById('detailed-results')?.scrollIntoView({behavior:'smooth',block:'start'})} onFocusPath={focusPath} onInspectNode={inspectNode}/>
    </section>}

    <section className="workspace">
      <div className="graph-section">
        <div className="section-heading"><div><Network/><span>Software Knowledge Graph</span></div>{summary&&<small>{summary.projectId}</small>}</div>
        {focusedPath&&<div className="graph-focus-status"><span>근거 경로 · {focusedPath.steps.length}개 노드</span><button className="review-button" onClick={()=>setFocusedPath(null)}>전체 그래프로 돌아가기</button></div>}
        {summary?<GraphView nodes={summary.nodes} edges={summary.edges} selected={inspectedNode?.id} focusIds={focusedPath?.steps.map(step=>step.id)||[]} onSelect={id=>{if(!busy)setInspectedNodeId(id)}}/>:<Empty/>}
        {inspectedNode&&<div className="graph-inspector"><div><span>살펴보는 노드 · {inspectedNode.type}</span><b>{inspectedNode.name}</b><small>{inspectedNode.sourcePath?`${inspectedNode.sourcePath}:${inspectedNode.line}`:'소스 위치 없음'}</small></div>{['CONTROLLER','SERVICE','REPOSITORY','ENTITY','METHOD'].includes(inspectedNode.type)&&inspectedNode.id!==selected&&<button type="button" className="review-button" disabled={busy} onClick={()=>{clearOutputs();setSelected(inspectedNode.id);setInspectedNodeId(inspectedNode.id)}}>이 노드를 변경 시작점으로 선택</button>}</div>}
        {focusedPath&&<EvidencePathPanel path={focusedPath} onInspect={setInspectedNodeId}/>}
      </div>

      <aside ref={analysisRef} tabIndex={-1} aria-label="변경점 분석 입력">
        <div className="section-heading"><div><GitBranch/><span>2. 변경점 선택</span></div>{summary&&(result||comparison||prReport||evaluation)&&<button className="icon-action" onClick={exportReport} title="JSON 결과 저장" aria-label="JSON 결과 저장"><Download size={16}/></button>}</div>
        <p className="analysis-intro">메서드를 직접 선택하거나 아래에 GitHub PR 주소를 붙여 넣으세요.</p>
        <label className="field-label" htmlFor="node-query">분석 대상 검색</label><div className="search"><Search size={16}/><input id="node-query" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Method, Service, Controller…" disabled={!summary||busy}/></div>
        <label className="field-label" htmlFor="selected-node">변경 시작점</label><select id="selected-node" value={selected} onChange={e=>{clearOutputs();setSelected(e.target.value);setInspectedNodeId(e.target.value)}} disabled={!summary||busy}>{candidates.map(n=><option key={n.id} value={n.id}>{n.type} · {n.name}{n.id===selected&&!candidateSearch.nodes.some(item=>item.id===n.id)?' · 현재 선택':''}</option>)}</select>
        {summary&&<p className="candidate-status" role="status">{query.trim()?`검색 결과 ${candidateSearch.total}개`:`분석 가능한 노드 ${candidateSearch.total}개`}{candidateSearch.total>500?' · 처음 500개 표시':''}{selectedNode&&!candidateSearch.nodes.some(n=>n.id===selectedNode.id)?' · 현재 선택은 목록에 유지':''}</p>}
        <label className="field-label" htmlFor="analysis-scope">분석 범위</label>
        <select id="analysis-scope" value={scope} onChange={e=>{setScope(e.target.value as AnalysisScope);clearOutputs()}} disabled={busy}>
          {(Object.keys(scopeInfo) as AnalysisScope[]).map(k=><option value={k} key={k}>{scopeInfo[k].label} — {scopeInfo[k].desc}</option>)}
        </select>
        <div className="action-row"><button className="run scope-run" onClick={()=>void runImpact()} disabled={!selected||busy}>{busy?'분석 중…':scope==='SYSTEM'?'광역 리스크 분석':'영향 분석'}</button><button className="secondary-run" onClick={()=>void runComparison()} disabled={!selected||busy}><BarChart3 size={15}/>3단계 비교</button></div>
        {selectedNode&&<div className="selected-meta"><FileCode2 size={15}/><div><b>{selectedNode.name}</b><span>{selectedNode.sourcePath||'source path 없음'} · L{selectedNode.line}{selectedNode.attributes?.endLine?`–${selectedNode.attributes.endLine}`:''}</span></div></div>}

        <details className="github-box">
          <summary><Github size={16}/>GitHub PR 주소로 분석</summary>
          <label className="github-label" htmlFor="github-pr-url">GitHub PR 주소</label>
          <input id="github-pr-url" className="github-url" placeholder="https://github.com/owner/repo/pull/123" value={prUrl} onChange={e=>setPrUrl(e.target.value)} disabled={busy}/>
          <button className="pr-run github-primary" disabled={!summary||busy||(!pr&&!prUrl.trim())} onClick={()=>void runPr()}>PR 변경 Method 분석</button>
          <small>프로젝트 ZIP을 먼저 올려주세요. Java 소스 내용 검증은 기본으로 켜져 있습니다.</small>
          <details className="github-advanced">
            <summary>고급 옵션 · 버전, 비공개 저장소, Commit</summary>
            <label className="github-label" htmlFor="zip-revision">ZIP 커밋 SHA</label>
            <input id="zip-revision" className="github-url" placeholder="ZIP의 전체 커밋 SHA (선택, 40자리)" value={uploadedRevision} onChange={e=>setUploadedRevision(e.target.value.trim())} disabled={busy}/>
            <small>ZIP 커밋은 사용자 입력이며 파일 내용 일치를 증명하지 않습니다.</small>
            <label className="source-verify-choice"><input type="checkbox" checked={verifySources} onChange={e=>setVerifySources(e.target.checked)} disabled={busy}/>Java 소스 내용 검증</label>
            <small>{verifySources?'저장소의 분석 대상 Java 전체와 비교합니다. 불일치·검증 불가는 분석을 중단합니다. SHA 미입력 시 HEAD와 비교합니다.':'내용 검증을 생략합니다. ZIP 버전은 사용자 선언 또는 HEAD 가정으로 표시합니다.'}</small>
            <div className="github-grid"><input aria-label="GitHub owner" placeholder="owner" value={owner} onChange={e=>setOwner(e.target.value)}/><input aria-label="GitHub repository" placeholder="repository" value={repo} onChange={e=>setRepo(e.target.value)}/><input aria-label="PR 번호" placeholder="PR 번호" inputMode="numeric" value={pr} onChange={e=>setPr(e.target.value.replace(/\D/g,''))}/><input aria-label="GitHub Token" type="password" placeholder="Token (Private repo만)" value={token} onChange={e=>setToken(e.target.value)}/></div>
            <div className="github-actions"><input className="sha-input" aria-label="Commit SHA" placeholder="Commit SHA" value={commitSha} onChange={e=>setCommitSha(e.target.value.trim())}/><button className="pr-run" disabled={!summary||busy||!commitSha} onClick={()=>void runCommit()}>Commit 분석</button></div>
            <small>Token은 브라우저 메모리에만 유지되며 결과 JSON에는 저장하지 않습니다.</small>
          </details>
        </details>

        <details className="evaluation-box">
          <summary><BarChart3 size={16}/>Ground Truth 정량 평가</summary>
          <textarea value={groundTruth} onChange={e=>setGroundTruth(e.target.value)} placeholder={'예상 영향 대상 이름 또는 Node ID\n예: PaymentService\nPaymentRepository\npayments'} disabled={!summary}/><button className="pr-run" disabled={!summary||!selected||busy} onClick={()=>void runEvaluation()}>Precision · Recall · F1 · Top-5 평가</button>
          {evaluation&&<EvaluationPanel value={evaluation}/>}        
        </details>

        {!result&&!comparison&&!prReport&&<div className="result-placeholder"><ShieldCheck size={30}/><b>Evidence-based Change Risk Index</b><span>장애 확률을 임의로 예측하지 않고, 실제 Graph 경로·영향 표면·결합도·테스트 공백을 근거로 0–100 상대 위험지수를 계산합니다.</span></div>}
      </aside>
    </section>
    <section id="detailed-results" className="result-workspace" aria-label="상세 분석 결과">
      {result?<RiskPanel result={result} onFocus={focusPath}/>:comparison?<ComparisonPanel value={comparison} onFocus={focusPath} onInspect={inspectNode}/>:prReport?<GithubReportPanel report={prReport}><PrPanel rows={prReport.results} onFocus={focusPath}/></GithubReportPanel>:null}
    </section>
    <footer>AST → Method-level Graph → Confidence-weighted Traversal → Blast Radius → Change Risk Index → Ground Truth Metrics → Grounded AI Explanation</footer>
  </main>
}

function Metric({label,value}:{label:string;value:number|string}){return <div className="metric"><b>{value}</b><span>{label}</span></div>}
function Empty(){return <div className="empty"><Network size={38}/><b>분석할 프로젝트를 업로드하세요</b><span>샘플 프로젝트로 LOCAL / FEATURE / SYSTEM 범위를 비교할 수 있습니다.</span></div>}

function ComparisonPanel({value,onFocus,onInspect}:{value:ImpactComparison;onFocus:(path:ImpactPath)=>void;onInspect:(id:string)=>void}){
  const rows=(['LOCAL','FEATURE','SYSTEM'] as AnalysisScope[]).map(k=>value[k]).filter(Boolean);
  return <div className="comparison-panel"><div className="path-title"><BarChart3 size={16}/><b>동일 변경점 · 범위별 리스크 비교</b></div><div className="compare-grid">{rows.map(r=><div className={`compare-card ${r.riskLevel.toLowerCase()}`} key={r.scope}><span>{r.scope}</span><strong>{r.riskScore}</strong><b>{r.riskLevel}</b><small>Blast {r.blastRadius} · Paths {r.paths.length} · Evidence {Math.round(r.evidenceConfidence*100)}%</small></div>)}</div><p className="compare-note">범위를 넓힐 때 새로 포함된 노드를 확인하세요. CRI는 그래프 근거 기반 상대 지수입니다.</p><div className="compare-deltas">{rows.map((r,i)=>{
    const before=rows[i-1];
    const previousIds=new Set(before?impactNodes(before).map(n=>n.id):[]);
    const currentNodes=impactNodes(r);
    const currentIds=new Set(currentNodes.map(n=>n.id));
    const added=currentNodes.filter(n=>!previousIds.has(n.id));
    const removed=before?impactNodes(before).filter(n=>!currentIds.has(n.id)):[];
    const scoreDelta=r.riskScore-(before?.riskScore||0);
    return <section className="compare-delta" key={r.scope} aria-label={`${r.scope} 범위 증가분`}><div className="compare-delta-head"><div><span>{before?`${before.scope} → ${r.scope}`:`${r.scope} 기준`}</span><b>새 영향 후보 {added.length}개</b></div><small>CRI {before?`${scoreDelta>=0?'+':''}${scoreDelta}`:`${r.riskScore}`}</small></div><div className="compare-delta-counts"><span>테스트 {added.filter(n=>n.type==='TEST').length}</span><span>API {added.filter(n=>n.type==='API').length}</span><span>데이터 {added.filter(n=>['ENTITY','TABLE','REPOSITORY'].includes(n.type)).length}</span></div>{added.length?<><ul>{added.slice(0,5).map(node=>{const path=r.paths.find(p=>p.targetId===node.id);return <li key={node.id}><button type="button" onClick={()=>path?onFocus(path):onInspect(node.id)}><b>{node.name}</b><small>{node.type} · {node.depth}단계 · {path?'근거 경로 보기':'그래프에서 보기'}</small></button></li>})}</ul>{added.length>5&&<p>그 외 {added.length-5}개는 아래 {r.scope} 상세 결과에서 확인</p>}</>:<p>앞선 범위에서 추가된 영향 후보가 없습니다.</p>}{removed.length>0&&<p>이전 범위에만 있던 후보 {removed.length}개는 이번 범위 결과에서 제외됐습니다.</p>}</section>})}</div>{rows.map(r=><details className="compare-details" key={r.scope}><summary>{r.scope} · {r.changedNodeName} · CRI {r.riskScore}</summary><RiskPanel result={r} onFocus={onFocus}/></details>)}</div>
}
function impactNodes(result:Impact):ImpactNode[]{return [...new Map([...result.directImpact,...result.indirectImpact].map(node=>[node.id,node])).values()]}

function PrPanel({rows,onFocus}:{rows:Impact[];onFocus:(path:ImpactPath)=>void}){
  const sorted=[...rows].sort((a,b)=>b.riskScore-a.riskScore);
  return <div className="pr-results"><div className="path-title"><Github size={16}/><b>GitHub 변경 Method 분석 · {rows.length}개 시작점</b></div>{sorted.map((r,i)=><details className="compare-details" open={i===0} key={r.changedNode}><summary>{r.changedNodeName} · {r.riskLevel} · CRI {r.riskScore} · Blast {r.blastRadius}</summary><RiskPanel result={r} onFocus={onFocus}/></details>)}</div>
}

function EvaluationPanel({value}:{value:Evaluation}){
  const pct=(v:number)=>`${Math.round(v*1000)/10}%`;
  return <div className="evaluation-result"><div className="eval-metrics"><span><b>{pct(value.precision)}</b>Precision</span><span><b>{pct(value.recall)}</b>Recall</span><span><b>{pct(value.f1)}</b>F1</span><span><b>{pct(value.topKRecall)}</b>Top-{value.topK}</span></div><p>TP {value.truePositive} · FP {value.falsePositive} · FN {value.falseNegative} · Expected {value.expectedCount} · Predicted {value.predictedCount}</p>{value.missed.length>0&&<small>Missed: {value.missed.join(' · ')}</small>}</div>
}

function RiskPanel({result,onFocus}:{result:Impact;onFocus?:(path:ImpactPath)=>void}){
  const areaLabel:Record<string,string>={API_SURFACE:'API / Controller',BUSINESS_LOGIC:'Business Logic',DATA:'Data Layer',TEST:'Tests',METHOD:'Methods',OTHER:'Other'};
  return <div className={`risk ${result.riskLevel.toLowerCase()}`}>
    <div className="risk-head"><div><AlertTriangle/><span>CHANGE RISK INDEX · {result.scope}</span><strong>{result.riskLevel}</strong></div><div className="score">{result.riskScore}<small>/100 CRI</small></div></div>
    <div className="risk-metrics"><span><b>{result.blastRadius}</b>Blast Radius</span><span><b>{Math.round(result.evidenceConfidence*100)}%</b>Evidence</span><span><b>{result.exploredNodes}</b>Explored</span><span><b>{result.paths.length}</b>Paths</span></div>
    <div className="review-layout"><ImpactReview key={`${result.changedNode}-${result.scope}`} result={result} onFocus={onFocus}/>
    <div className="risk-details"><h3>변경 위험의 판단 근거</h3><p className="explanation">{result.explanation}</p>
    <div className="breakdown">{Object.entries(result.riskBreakdown).map(([k,v])=><div key={k}><span>{k}</span><b>{v}</b></div>)}</div>
    <div className="reason-list">{result.riskReasons.map((x,i)=><span key={i}>{x}</span>)}</div>
    <Info icon={<Layers3/>} title="Impact Areas" items={result.areas.map(a=>`${areaLabel[a.category]||a.category} ${a.count}개 (Depth ${a.maxDepth})`)}/>
    </div></div>
  </div>
}
function Info({icon,title,items}:{icon:ReactNode;title:string;items:string[]}){return <div className="info"><div>{icon}<b>{title}</b></div><p>{items.length?items.slice(0,16).join(' · '):'탐지된 항목 없음'}</p></div>}
function messageOf(e:unknown){return e instanceof Error?e.message:'알 수 없는 오류가 발생했습니다.'}
