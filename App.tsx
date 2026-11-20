import {useEffect,useMemo,useRef,useState,type DragEvent,type ReactNode} from 'react';
import {
  Activity,AlertTriangle,BarChart3,Download,FileCode2,GitBranch,Github,Layers3,
  Network,Search,ShieldCheck,UploadCloud
} from 'lucide-react';
import GraphView from './components/GraphView';
import ImpactReview from './components/ImpactReview';
import GithubReportPanel from './components/GithubReportPanel';
import ResultSnapshot from './components/ResultSnapshot';
import {parseGithubPrUrl} from './lib/github-url';
import {
  evaluateGroundTruth,githubChangeReport,health,impact,impactComparison,uploadZip,
  type GithubChangeReport,type AnalysisScope,type Evaluation,type Health,type Impact,type ImpactComparison,type Summary
} from './lib/api';

const scopeInfo:Record<AnalysisScope,{label:string;desc:string;depth:number}>={
  LOCAL:{label:'LOCAL · 근접 영향',desc:'직접/근거리 관계 중심',depth:2},
  FEATURE:{label:'FEATURE · 기능 범위',desc:'API·Service·DB·Test 연쇄 분석',depth:4},
  SYSTEM:{label:'SYSTEM · 광역 리스크',desc:'최대 6단계 + 신뢰도 가지치기',depth:6},
};

const CANDIDATE_TYPES=new Set<string>(['CONTROLLER','SERVICE','REPOSITORY','ENTITY','METHOD']);
const MAX_CANDIDATES=500;
const AREA_LABEL:Record<string,string>={API_SURFACE:'API / Controller',BUSINESS_LOGIC:'Business Logic',DATA:'Data Layer',TEST:'Tests',METHOD:'Methods',OTHER:'Other'};
const SHA_RE=/^[0-9a-f]{7,40}$/i;
const FULL_SHA_RE=/^[0-9a-f]{40}$/i;

/** 모션 줄이기 설정을 존중하는 스크롤 + 선택적 포커스 */
function scrollToEl(el:HTMLElement|null|undefined,focus=false){
  if(!el)return;
  const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({behavior:reduce?'auto':'smooth',block:'start'});
  if(focus)el.focus({preventScroll:true});
}

/** 줄바꿈 또는 괄호 밖의 쉼표로 분리 (메서드 시그니처 `foo(String,int)` 보호), 중복 제거 */
function parseExpected(text:string){
  return Array.from(new Set(text.split(/\r?\n|,(?![^()]*\))/).map(x=>x.trim()).filter(Boolean)));
}

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
  const [focusedPath,setFocusedPath]=useState<string[]>([]);
  const snapshotRef=useRef<HTMLElement>(null);
  const analysisRef=useRef<HTMLElement>(null);
  const graphRef=useRef<HTMLDivElement>(null);
  // state 갱신 전 연속 호출(더블 클릭, 연속 드롭)도 막기 위한 동기 잠금
  const busyRef=useRef(false);

  useEffect(()=>{
    let alive=true;
    const check=()=>{
      health().then(h=>{if(alive)setServer(h)}).catch(()=>{if(alive)setServer(null)});
    };
    check();
    // 백엔드를 나중에 켠 경우에도 탭으로 돌아오면 상태를 다시 확인
    window.addEventListener('focus',check);
    return ()=>{alive=false;window.removeEventListener('focus',check)};
  },[]);
  useEffect(()=>{
    if(!summary)return;
    const frame=requestAnimationFrame(()=>scrollToEl(analysisRef.current,true));
    return ()=>cancelAnimationFrame(frame);
  },[summary]);
  useEffect(()=>{
    if(!result&&!comparison&&!prReport)return;
    const frame=requestAnimationFrame(()=>scrollToEl(snapshotRef.current,true));
    return ()=>cancelAnimationFrame(frame);
  },[result,comparison,prReport]);

  const candidates=useMemo(()=>{
    const all=summary?.nodes.filter(n=>CANDIDATE_TYPES.has(n.type))??[];
    const q=query.trim().toLowerCase();
    const matched=q?all.filter(n=>`${n.name} ${n.type} ${n.sourcePath}`.toLowerCase().includes(q)):all;
    return {list:matched.slice(0,MAX_CANDIDATES),total:matched.length};
  },[summary,query]);
  const selectedNode=useMemo(()=>summary?.nodes.find(n=>n.id===selected)??null,[summary,selected]);
  // 검색 필터/그래프 클릭으로 선택 노드가 목록에서 빠져도 <select> 표시와 state가 어긋나지 않도록 항상 포함
  const options=useMemo(
    ()=>selectedNode&&!candidates.list.some(n=>n.id===selectedNode.id)?[selectedNode,...candidates.list]:candidates.list,
    [selectedNode,candidates.list]
  );

  function clearOutputs(){
    setFocusedPath([]);
    setResult(null);setComparison(null);setPrReport(null);setEvaluation(null);
  }

  /** 공통 실행 래퍼: 중복 실행 방지 · 로딩/에러 상태 처리 */
  async function run(label:string,task:()=>Promise<void>,clear=true){
    if(busyRef.current)return;
    busyRef.current=true;
    setBusy(true);setBusyLabel(label);setError('');
    if(clear)clearOutputs();
    try{await task()}
    catch(e){setError(messageOf(e))}
    finally{busyRef.current=false;setBusy(false);setBusyLabel('')}
  }

  function analyzeFile(file:File){
    if(!/\.zip$/i.test(file.name)){setError('ZIP 파일(.zip)만 업로드할 수 있습니다.');return Promise.resolve()}
    return run('프로젝트를 분석하고 있습니다…',async()=>{
      const next=await uploadZip(file);
      setSummary(next);setUploadedRevision('');setQuery('');
      const first=next.nodes.find(n=>n.type==='SERVICE')?.id||next.nodes.find(n=>n.type==='CONTROLLER')?.id||next.nodes[0]?.id||'';
      setSelected(first);
    });
  }
  function runImpact(){
    if(!summary||!selected)return;
    return run('영향 경로를 분석하고 있습니다…',async()=>{
      setResult(await impact(summary.projectId,selected,scope,scopeInfo[scope].depth));
    });
  }
  function runComparison(){
    if(!summary||!selected)return;
    return run('분석 범위를 비교하고 있습니다…',async()=>{
      setComparison(await impactComparison(summary.projectId,selected));
    });
  }
  function assertRevision(){
    if(uploadedRevision&&!FULL_SHA_RE.test(uploadedRevision))throw new Error('ZIP 커밋 SHA는 40자리 16진수여야 합니다. 비워두면 HEAD와 비교합니다.');
  }
  function runPr(){
    if(!summary)return;
    return run('PR 변경과 영향 경로를 분석하고 있습니다…',async()=>{
      const target=prUrl.trim()
        ?parseGithubPrUrl(prUrl.trim())
        :{owner:owner.trim(),repo:repo.trim(),pullNumber:Number(pr)};
      if(!target.owner||!target.repo||!Number.isInteger(target.pullNumber)||target.pullNumber<=0)
        throw new Error('PR 주소를 붙여 넣거나 owner · repository · PR 번호를 모두 입력해주세요.');
      assertRevision();
      setOwner(target.owner);setRepo(target.repo);setPr(String(target.pullNumber));
      setPrReport(await githubChangeReport(summary.projectId,{...target,scope,maxDepth:scopeInfo[scope].depth,uploadedRevision,verifySources},token));
    });
  }
  function runCommit(){
    if(!summary)return;
    return run('Commit 변경과 영향 경로를 분석하고 있습니다…',async()=>{
      if(!owner.trim()||!repo.trim())throw new Error('Commit 분석에는 owner와 repository가 필요합니다.');
      if(!SHA_RE.test(commitSha))throw new Error('Commit SHA는 7~40자리 16진수여야 합니다.');
      assertRevision();
      setPrReport(await githubChangeReport(summary.projectId,{owner:owner.trim(),repo:repo.trim(),sha:commitSha,scope,maxDepth:scopeInfo[scope].depth,uploadedRevision,verifySources},token));
    });
  }
  function runEvaluation(){
    if(!summary||!selected)return;
    const expected=parseExpected(groundTruth);
    if(!expected.length){setError('Ground Truth 대상 이름 또는 Node ID를 한 줄에 하나씩 입력해주세요.');return}
    return run('Ground Truth를 평가하고 있습니다…',async()=>{
      setEvaluation(null);
      setEvaluation(await evaluateGroundTruth(summary.projectId,selected,scope,scopeInfo[scope].depth,expected,5));
    },false);
  }
  function focusPath(ids:string[]){
    setFocusedPath(ids);
    scrollToEl(graphRef.current);
  }
  function drop(e:DragEvent<HTMLDivElement>){
    e.preventDefault();setDragging(false);
    const file=e.dataTransfer.files?.[0];
    if(file)void analyzeFile(file);
  }
  function exportReport(){
    if(!summary)return;
    const payload={generatedAt:new Date().toISOString(),project:summary,result,comparison,github:prReport,evaluation};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download=`DevSphere_AX_${summary.projectId.replace(/[^\w.-]+/g,'_')}_report.json`;
    document.body.appendChild(a);a.click();a.remove();
    // 즉시 revoke하면 일부 브라우저에서 다운로드가 취소될 수 있음
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  const hasOutput=Boolean(result||comparison||prReport);
  const prReady=Boolean(prUrl.trim()||(owner.trim()&&repo.trim()&&pr));

  return <main aria-busy={busy}>
    <header>
      <div><p className="eyebrow">SOFTWARE CHANGE INTELLIGENCE</p><h1>DevSphere <span>AX</span></h1><p className="subtitle">메소드 한 줄의 변경부터 <b>시스템 전반의 Blast Radius</b>까지 근거 경로로 추적</p></div>
      <div className="header-right"><div className={`status ${server?'online':'offline'}`}><Activity size={15}/>{server?'Backend Connected':'Backend Offline'}</div><div className="mvp">Java 17 · Spring Boot · GitHub PR/Commit · Method Path · CRI</div></div>
    </header>

    {error&&<div className="error-banner" role="alert"><AlertTriangle size={18}/><span>{error}</span><button onClick={()=>setError('')}>닫기</button></div>}
    {summary?.warnings?.map((w,i)=><div className="warning-banner" key={i}>{w}</div>)}
    <div className="flow-progress" aria-label="분석 진행 단계">
      <span className={summary?'done':'current'}><b>1</b> 프로젝트 ZIP 업로드</span>
      <span className={summary&&hasOutput?'done':summary?'current':''}><b>2</b> 변경 메서드 또는 PR 선택</span>
      <span className={hasOutput?'current':''}><b>3</b> 결과와 근거 확인</span>
    </div>
    {busyLabel&&<p className="flow-status" role="status">{busyLabel}</p>}

    <section className="top-grid">
      <div
        className={`panel uploader ${dragging?'dragging':''}`}
        onDragOver={e=>{e.preventDefault();if(!busy)setDragging(true)}}
        onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setDragging(false)}}
        onDrop={drop}
      >
        <div className="icon-box"><UploadCloud size={28}/></div><div><h2>1. Spring 프로젝트 업로드</h2><p>{summary?`준비 완료 · ${summary.projectId}`:'Java/Spring 프로젝트 ZIP을 선택하세요. 업로드 후 변경 메서드 또는 PR을 분석할 수 있습니다.'}</p></div>
        <label className="upload-button">{busy?'처리 중…':summary?'다른 ZIP 선택':'ZIP 선택'}<input type="file" accept=".zip" disabled={busy} onChange={e=>{
          const file=e.target.files?.[0];
          e.target.value=''; // 같은 파일을 다시 선택해도 onChange가 발생하도록 초기화
          if(file)void analyzeFile(file);
        }}/></label>
      </div>
      {summary?<div className="panel metric-panel"><Metric label="Classes" value={summary.analyzedClasses}/><Metric label="Nodes" value={summary.nodeCount}/><Metric label="Edges" value={summary.edgeCount}/><Metric label="Methods" value={summary.methods}/><Metric label="APIs" value={summary.apis}/><Metric label="Analyze" value={`${summary.analysisDurationMs}ms`}/></div>:<div className="panel metric-empty"><Network size={26}/><b>분석 준비</b><span>ZIP을 업로드하면 프로젝트 구조와 분석 대상을 보여드립니다.</span></div>}
    </section>

    {hasOutput&&<section ref={snapshotRef} tabIndex={-1} className="result-snapshot" aria-label="핵심 분석 결과">
      <ResultSnapshot result={result} comparison={comparison} report={prReport} scope={scope} onDetails={()=>scrollToEl(document.getElementById('detailed-results'))}/>
    </section>}

    <section className="workspace">
      <div className="graph-section" ref={graphRef}>
        <div className="section-heading"><div><Network/><span>Software Knowledge Graph</span></div>{summary&&<small>{summary.projectId}</small>}</div>
        {focusedPath.length>0&&<div className="graph-focus-status"><span>근거 경로 · {focusedPath.length}개 노드</span><button className="review-button" onClick={()=>setFocusedPath([])}>전체 그래프로 돌아가기</button></div>}
        {summary?<GraphView nodes={summary.nodes} edges={summary.edges} selected={selected} focusIds={focusedPath} onSelect={id=>{if(!busy){setSelected(id);clearOutputs()}}}/>:<Empty/>}
      </div>

      <aside ref={analysisRef} tabIndex={-1} aria-label="변경점 분석 입력">
        <div className="section-heading"><div><GitBranch/><span>2. 변경점 선택</span></div>{summary&&(hasOutput||evaluation)&&<button className="icon-action" onClick={exportReport} title="JSON 결과 저장" aria-label="JSON 결과 저장"><Download size={16}/></button>}</div>
        <p className="analysis-intro">메서드를 직접 선택하거나 아래에 GitHub PR 주소를 붙여 넣으세요.</p>
        <label className="field-label" htmlFor="node-query">분석 대상 검색</label><div className="search"><Search size={16}/><input id="node-query" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Method, Service, Controller…" disabled={!summary||busy}/></div>
        <label className="field-label" htmlFor="selected-node">변경 시작점</label><select id="selected-node" value={selected} onChange={e=>{setSelected(e.target.value);clearOutputs()}} disabled={!summary||busy}>{options.map(n=><option key={n.id} value={n.id}>{n.type} · {n.name}</option>)}</select>
        {candidates.total>MAX_CANDIDATES&&<small role="note">검색 결과 {candidates.total}개 중 {MAX_CANDIDATES}개만 표시됩니다. 검색어를 더 구체적으로 입력해주세요.</small>}
        {summary&&query.trim()&&candidates.total===0&&<small role="note">검색 결과가 없습니다.</small>}
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
          <button className="pr-run github-primary" disabled={!summary||busy||!prReady} onClick={()=>void runPr()}>PR 변경 Method 분석</button>
          <small>프로젝트 ZIP을 먼저 올려주세요. Java 소스 내용 검증은 기본으로 켜져 있습니다.</small>
          <details className="github-advanced">
            <summary>고급 옵션 · 버전, 비공개 저장소, Commit</summary>
            <label className="github-label" htmlFor="zip-revision">ZIP 커밋 SHA</label>
            <input id="zip-revision" className="github-url" placeholder="ZIP의 전체 커밋 SHA (선택, 40자리)" value={uploadedRevision} onChange={e=>setUploadedRevision(e.target.value.trim())} disabled={busy} maxLength={40} spellCheck={false} autoComplete="off"/>
            <small>ZIP 커밋은 사용자 입력이며 파일 내용 일치를 증명하지 않습니다.</small>
            <label className="source-verify-choice"><input type="checkbox" checked={verifySources} onChange={e=>setVerifySources(e.target.checked)} disabled={busy}/>Java 소스 내용 검증</label>
            <small>{verifySources?'저장소의 분석 대상 Java 전체와 비교합니다. 불일치·검증 불가는 분석을 중단합니다. SHA 미입력 시 HEAD와 비교합니다.':'내용 검증을 생략합니다. ZIP 버전은 사용자 선언 또는 HEAD 가정으로 표시합니다.'}</small>
            <div className="github-grid"><input aria-label="GitHub owner" placeholder="owner" value={owner} onChange={e=>setOwner(e.target.value)} autoComplete="off" spellCheck={false}/><input aria-label="GitHub repository" placeholder="repository" value={repo} onChange={e=>setRepo(e.target.value)} autoComplete="off" spellCheck={false}/><input aria-label="PR 번호" placeholder="PR 번호" inputMode="numeric" value={pr} onChange={e=>setPr(e.target.value.replace(/\D/g,''))}/><input aria-label="GitHub Token" type="password" placeholder="Token (Private repo만)" value={token} onChange={e=>setToken(e.target.value)} autoComplete="off" spellCheck={false}/></div>
            <div className="github-actions"><input className="sha-input" aria-label="Commit SHA" placeholder="Commit SHA" value={commitSha} onChange={e=>setCommitSha(e.target.value.trim())} maxLength={40} spellCheck={false} autoComplete="off"/><button className="pr-run" disabled={!summary||busy||!commitSha} onClick={()=>void runCommit()}>Commit 분석</button></div>
            <small>Token은 브라우저 메모리에만 유지되며 결과 JSON에는 저장하지 않습니다.</small>
          </details>
        </details>

        <details className="evaluation-box">
          <summary><BarChart3 size={16}/>Ground Truth 정량 평가</summary>
          <textarea value={groundTruth} onChange={e=>setGroundTruth(e.target.value)} placeholder={'예상 영향 대상 이름 또는 Node ID\n예: PaymentService\nPaymentRepository\npayments'} disabled={!summary}/><button className="pr-run" disabled={!summary||!selected||busy} onClick={()=>void runEvaluation()}>Precision · Recall · F1 · Top-5 평가</button>
          {evaluation&&<EvaluationPanel value={evaluation}/>}
        </details>

        {!hasOutput&&<div className="result-placeholder"><ShieldCheck size={30}/><b>Evidence-based Change Risk Index</b><span>장애 확률을 임의로 예측하지 않고, 실제 Graph 경로·영향 표면·결합도·테스트 공백을 근거로 0–100 상대 위험지수를 계산합니다.</span></div>}
      </aside>
    </section>
    <section id="detailed-results" className="result-workspace" aria-label="상세 분석 결과">
      {result?<RiskPanel result={result} onFocus={focusPath}/>:comparison?<ComparisonPanel value={comparison} onFocus={focusPath}/>:prReport?<GithubReportPanel report={prReport}><PrPanel rows={prReport.results} onFocus={focusPath}/></GithubReportPanel>:null}
    </section>
    <footer>AST → Method-level Graph → Confidence-weighted Traversal → Blast Radius → Change Risk Index → Ground Truth Metrics → Grounded AI Explanation</footer>
  </main>
}

function Metric({label,value}:{label:string;value:number|string}){return <div className="metric"><b>{value}</b><span>{label}</span></div>}
function Empty(){return <div className="empty"><Network size={38}/><b>분석할 프로젝트를 업로드하세요</b><span>샘플 프로젝트로 LOCAL / FEATURE / SYSTEM 범위를 비교할 수 있습니다.</span></div>}

function ComparisonPanel({value,onFocus}:{value:ImpactComparison;onFocus:(ids:string[])=>void}){
  const rows=(['LOCAL','FEATURE','SYSTEM'] as AnalysisScope[]).map(k=>value[k]).filter(Boolean);
  return <div className="comparison-panel"><div className="path-title"><BarChart3 size={16}/><b>동일 변경점 · 범위별 리스크 비교</b></div><div className="compare-grid">{rows.map(r=><div className={`compare-card ${r.riskLevel.toLowerCase()}`} key={r.scope}><span>{r.scope}</span><strong>{r.riskScore}</strong><b>{r.riskLevel}</b><small>Blast {r.blastRadius} · Paths {r.paths.length} · Evidence {Math.round(r.evidenceConfidence*100)}%</small></div>)}</div><p className="compare-note">LOCAL → FEATURE → SYSTEM으로 넓어질 때 어떤 영향 노드와 경로가 추가되는지 비교해 광역 분석의 근거를 확인합니다.</p>{rows.map(r=><details className="compare-details" key={r.scope}><summary>{r.scope} · {r.changedNodeName} · CRI {r.riskScore}</summary><RiskPanel result={r} onFocus={onFocus}/></details>)}</div>
}

function PrPanel({rows,onFocus}:{rows:Impact[];onFocus:(ids:string[])=>void}){
  const sorted=[...rows].sort((a,b)=>b.riskScore-a.riskScore);
  return <div className="pr-results"><div className="path-title"><Github size={16}/><b>GitHub 변경 Method 분석 · {rows.length}개 시작점</b></div>{sorted.map((r,i)=><details className="compare-details" open={i===0} key={r.changedNode}><summary>{r.changedNodeName} · {r.riskLevel} · CRI {r.riskScore} · Blast {r.blastRadius}</summary><RiskPanel result={r} onFocus={onFocus}/></details>)}</div>
}

function EvaluationPanel({value}:{value:Evaluation}){
  const pct=(v:number)=>`${Math.round(v*1000)/10}%`;
  return <div className="evaluation-result"><div className="eval-metrics"><span><b>{pct(value.precision)}</b>Precision</span><span><b>{pct(value.recall)}</b>Recall</span><span><b>{pct(value.f1)}</b>F1</span><span><b>{pct(value.topKRecall)}</b>Top-{value.topK}</span></div><p>TP {value.truePositive} · FP {value.falsePositive} · FN {value.falseNegative} · Expected {value.expectedCount} · Predicted {value.predictedCount}</p>{value.missed.length>0&&<small>Missed: {value.missed.join(' · ')}</small>}</div>
}

function RiskPanel({result,onFocus}:{result:Impact;onFocus?:(ids:string[])=>void}){
  return <div className={`risk ${result.riskLevel.toLowerCase()}`}>
    <div className="risk-head"><div><AlertTriangle/><span>CHANGE RISK INDEX · {result.scope}</span><strong>{result.riskLevel}</strong></div><div className="score">{result.riskScore}<small>/100 CRI</small></div></div>
    <div className="risk-metrics"><span><b>{result.blastRadius}</b>Blast Radius</span><span><b>{Math.round(result.evidenceConfidence*100)}%</b>Evidence</span><span><b>{result.exploredNodes}</b>Explored</span><span><b>{result.paths.length}</b>Paths</span></div>
    <div className="review-layout"><ImpactReview key={`${result.changedNode}-${result.scope}`} result={result} onFocus={onFocus}/>
    <div className="risk-details"><h3>변경 위험의 판단 근거</h3><p className="explanation">{result.explanation}</p>
    <div className="breakdown">{Object.entries(result.riskBreakdown).map(([k,v])=><div key={k}><span>{k}</span><b>{v}</b></div>)}</div>
    <div className="reason-list">{result.riskReasons.map((x,i)=><span key={i}>{x}</span>)}</div>
    <Info icon={<Layers3/>} title="Impact Areas" items={result.areas.map(a=>`${AREA_LABEL[a.category]||a.category} ${a.count}개 (Depth ${a.maxDepth})`)}/>
    </div></div>
  </div>
}

const INFO_LIMIT=16;
function Info({icon,title,items}:{icon:ReactNode;title:string;items:string[]}){
  const rest=items.length-INFO_LIMIT;
  return <div className="info"><div>{icon}<b>{title}</b></div><p>{items.length?items.slice(0,INFO_LIMIT).join(' · ')+(rest>0?` 외 ${rest}개`:''):'탐지된 항목 없음'}</p></div>
}
function messageOf(e:unknown){return e instanceof Error?e.message:'알 수 없는 오류가 발생했습니다.'}
