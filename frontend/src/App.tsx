import {DragEvent,useEffect,useMemo,useState,type ReactNode} from 'react';
import {
  Activity,AlertTriangle,BarChart3,CheckCircle2,Download,FileCode2,GitBranch,Github,Layers3,
  Network,Route,Search,ShieldCheck,TestTube2,UploadCloud
} from 'lucide-react';
import GraphView from './components/GraphView';
import {
  evaluateGroundTruth,githubCommitImpact,githubPrImpact,health,impact,impactComparison,uploadZip,
  type AnalysisScope,type Evaluation,type Health,type Impact,type ImpactComparison,type Summary
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
  const [prResults,setPrResults]=useState<Impact[]>([]);
  const [evaluation,setEvaluation]=useState<Evaluation|null>(null);
  const [busy,setBusy]=useState(false);
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

  useEffect(()=>{health().then(setServer).catch(()=>setServer(null))},[]);
  const candidates=useMemo(()=>{
    const all=summary?.nodes.filter(n=>['CONTROLLER','SERVICE','REPOSITORY','ENTITY','METHOD'].includes(n.type))||[];
    const q=query.trim().toLowerCase();
    return (q?all.filter(n=>(n.name+' '+n.type+' '+n.sourcePath).toLowerCase().includes(q)):all).slice(0,500);
  },[summary,query]);
  const selectedNode=summary?.nodes.find(n=>n.id===selected)||null;

  function clearOutputs(){
    setResult(null);setComparison(null);setPrResults([]);setEvaluation(null);
  }

  async function analyzeFile(file:File){
    setBusy(true);setError('');clearOutputs();
    try{
      const next=await uploadZip(file);setSummary(next);
      const first=next.nodes.find(n=>n.type==='SERVICE')?.id||next.nodes.find(n=>n.type==='CONTROLLER')?.id||next.nodes[0]?.id||'';
      setSelected(first);
    }catch(e){setError(messageOf(e))}finally{setBusy(false)}
  }
  async function runImpact(){
    if(!summary||!selected)return;setBusy(true);setError('');setComparison(null);setPrResults([]);setEvaluation(null);
    try{setResult(await impact(summary.projectId,selected,scope,scopeInfo[scope].depth))}catch(e){setError(messageOf(e))}finally{setBusy(false)}
  }
  async function runComparison(){
    if(!summary||!selected)return;setBusy(true);setError('');setResult(null);setPrResults([]);setEvaluation(null);
    try{setComparison(await impactComparison(summary.projectId,selected))}catch(e){setError(messageOf(e))}finally{setBusy(false)}
  }
  async function runPr(){
    if(!summary)return;setBusy(true);setError('');clearOutputs();
    try{
      const number=Number(pr);
      const rows=await githubPrImpact(summary.projectId,owner,repo,number,scope,scopeInfo[scope].depth,token);
      if(!rows.length) throw new Error('현재 업로드한 프로젝트와 매핑되는 Java 변경 노드를 찾지 못했습니다. PR 파일 경로와 프로젝트 ZIP의 경로가 같은지 확인해주세요.');
      setPrResults(rows);
    }catch(e){setError(messageOf(e))}finally{setBusy(false)}
  }
  async function runCommit(){
    if(!summary)return;setBusy(true);setError('');clearOutputs();
    try{
      const rows=await githubCommitImpact(summary.projectId,owner,repo,commitSha,scope,scopeInfo[scope].depth,token);
      if(!rows.length) throw new Error('현재 업로드한 프로젝트와 매핑되는 Java 변경 노드를 찾지 못했습니다. Commit과 프로젝트 버전을 확인해주세요.');
      setPrResults(rows);
    }catch(e){setError(messageOf(e))}finally{setBusy(false)}
  }
  async function runEvaluation(){
    if(!summary||!selected)return;
    const expected=groundTruth.split(/\r?\n|,/).map(x=>x.trim()).filter(Boolean);
    if(!expected.length){setError('Ground Truth 대상 이름 또는 Node ID를 한 줄에 하나씩 입력해주세요.');return}
    setBusy(true);setError('');setEvaluation(null);
    try{setEvaluation(await evaluateGroundTruth(summary.projectId,selected,scope,scopeInfo[scope].depth,expected,5))}
    catch(e){setError(messageOf(e))}finally{setBusy(false)}
  }
  function drop(e:DragEvent){e.preventDefault();setDragging(false);const file=e.dataTransfer.files?.[0];if(file)void analyzeFile(file)}
  function exportReport(){
    if(!summary)return;
    const payload={generatedAt:new Date().toISOString(),project:summary,result,comparison,prResults,evaluation};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');
    a.href=url;a.download=`DevSphere_AX_${summary.projectId}_report.json`;a.click();URL.revokeObjectURL(url);
  }

  return <main>
    <header>
      <div><p className="eyebrow">SOFTWARE CHANGE INTELLIGENCE</p><h1>DevSphere <span>AX</span></h1><p className="subtitle">메소드 한 줄의 변경부터 <b>시스템 전반의 Blast Radius</b>까지 근거 경로로 추적</p></div>
      <div className="header-right"><div className={`status ${server?'online':'offline'}`}><Activity size={15}/>{server?'Backend Connected':'Backend Offline'}</div><div className="mvp">Java 17 · Spring Boot · GitHub PR/Commit · Method Path · CRI</div></div>
    </header>

    {error&&<div className="error-banner"><AlertTriangle size={18}/><span>{error}</span><button onClick={()=>setError('')}>닫기</button></div>}
    {summary?.warnings?.map((w,i)=><div className="warning-banner" key={i}>{w}</div>)}

    <section className="top-grid">
      <div className={`panel uploader ${dragging?'dragging':''}`} onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={drop}>
        <div className="icon-box"><UploadCloud size={28}/></div><div><h2>Spring 프로젝트 분석</h2><p>ZIP → AST → Method/Class/API/DB/Test Graph → 광역 변경 리스크 분석</p></div>
        <label className="upload-button">{busy?'분석 중…':'ZIP 선택'}<input type="file" accept=".zip" disabled={busy} onChange={e=>e.target.files?.[0]&&void analyzeFile(e.target.files[0])}/></label>
      </div>
      <div className="panel metric-panel"><Metric label="Classes" value={summary?.analyzedClasses||0}/><Metric label="Nodes" value={summary?.nodeCount||0}/><Metric label="Edges" value={summary?.edgeCount||0}/><Metric label="Methods" value={summary?.methods||0}/><Metric label="APIs" value={summary?.apis||0}/><Metric label="Analyze" value={summary?`${summary.analysisDurationMs}ms`:'0ms'}/></div>
    </section>

    <section className="workspace">
      <div className="graph-section">
        <div className="section-heading"><div><Network/><span>Software Knowledge Graph</span></div>{summary&&<small>{summary.projectId}</small>}</div>
        {summary?<GraphView nodes={summary.nodes} edges={summary.edges} selected={selected} onSelect={id=>{setSelected(id);clearOutputs()}}/>:<Empty/>}
      </div>

      <aside>
        <div className="section-heading"><div><GitBranch/><span>Wide-Scope Change Risk Analysis</span></div>{summary&&(result||comparison||prResults.length>0||evaluation)&&<button className="icon-action" onClick={exportReport} title="JSON 결과 저장"><Download size={16}/></button>}</div>
        <label className="field-label">분석 대상 검색</label><div className="search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Method, Service, Controller…" disabled={!summary}/></div>
        <label className="field-label">변경 시작점</label><select value={selected} onChange={e=>{setSelected(e.target.value);clearOutputs()}} disabled={!summary}>{candidates.map(n=><option key={n.id} value={n.id}>{n.type} · {n.name}</option>)}</select>
        <label className="field-label">분석 범위</label>
        <select value={scope} onChange={e=>{setScope(e.target.value as AnalysisScope);clearOutputs()}}>
          {(Object.keys(scopeInfo) as AnalysisScope[]).map(k=><option value={k} key={k}>{scopeInfo[k].label} — {scopeInfo[k].desc}</option>)}
        </select>
        <div className="action-row"><button className="run scope-run" onClick={()=>void runImpact()} disabled={!selected||busy}>{busy?'분석 중…':scope==='SYSTEM'?'광역 리스크 분석':'영향 분석'}</button><button className="secondary-run" onClick={()=>void runComparison()} disabled={!selected||busy}><BarChart3 size={15}/>3단계 비교</button></div>
        {selectedNode&&<div className="selected-meta"><FileCode2 size={15}/><div><b>{selectedNode.name}</b><span>{selectedNode.sourcePath||'source path 없음'} · L{selectedNode.line}{selectedNode.attributes?.endLine?`–${selectedNode.attributes.endLine}`:''}</span></div></div>}

        <details className="github-box">
          <summary><Github size={16}/>GitHub PR / Commit → 변경 Method 자동 분석</summary>
          <div className="github-grid"><input placeholder="owner" value={owner} onChange={e=>setOwner(e.target.value)}/><input placeholder="repository" value={repo} onChange={e=>setRepo(e.target.value)}/><input placeholder="PR 번호" inputMode="numeric" value={pr} onChange={e=>setPr(e.target.value.replace(/\D/g,''))}/><input type="password" placeholder="Token (Private repo만)" value={token} onChange={e=>setToken(e.target.value)}/></div>
          <div className="github-actions"><button className="pr-run" disabled={!summary||busy||!pr} onClick={()=>void runPr()}>PR 변경 Method 분석</button><input className="sha-input" placeholder="Commit SHA" value={commitSha} onChange={e=>setCommitSha(e.target.value.trim())}/><button className="pr-run" disabled={!summary||busy||!commitSha} onClick={()=>void runCommit()}>Commit 분석</button></div>
          <small>추가/삭제 Diff line을 모두 Method 범위와 매핑합니다. Token은 브라우저 메모리에만 유지되며 결과 JSON에는 저장하지 않습니다.</small>
        </details>

        <details className="evaluation-box">
          <summary><BarChart3 size={16}/>Ground Truth 정량 평가</summary>
          <textarea value={groundTruth} onChange={e=>setGroundTruth(e.target.value)} placeholder={'예상 영향 대상 이름 또는 Node ID\n예: PaymentService\nPaymentRepository\npayments'} disabled={!summary}/><button className="pr-run" disabled={!summary||!selected||busy} onClick={()=>void runEvaluation()}>Precision · Recall · F1 · Top-5 평가</button>
          {evaluation&&<EvaluationPanel value={evaluation}/>}        
        </details>

        {result?<RiskPanel result={result}/>:comparison?<ComparisonPanel value={comparison}/>:prResults.length?<PrPanel rows={prResults}/>:<div className="result-placeholder"><ShieldCheck size={30}/><b>Evidence-based Change Risk Index</b><span>장애 확률을 임의로 예측하지 않고, 실제 Graph 경로·영향 표면·결합도·테스트 공백을 근거로 0–100 상대 위험지수를 계산합니다.</span></div>}
      </aside>
    </section>
    <footer>AST → Method-level Graph → Confidence-weighted Traversal → Blast Radius → Change Risk Index → Ground Truth Metrics → Grounded AI Explanation</footer>
  </main>
}

function Metric({label,value}:{label:string;value:number|string}){return <div className="metric"><b>{value}</b><span>{label}</span></div>}
function Empty(){return <div className="empty"><Network size={38}/><b>분석할 프로젝트를 업로드하세요</b><span>샘플 프로젝트로 LOCAL / FEATURE / SYSTEM 범위를 비교할 수 있습니다.</span></div>}

function ComparisonPanel({value}:{value:ImpactComparison}){
  const rows=(['LOCAL','FEATURE','SYSTEM'] as AnalysisScope[]).map(k=>value[k]).filter(Boolean);
  return <div className="comparison-panel"><div className="path-title"><BarChart3 size={16}/><b>동일 변경점 · 범위별 리스크 비교</b></div><div className="compare-grid">{rows.map(r=><div className={`compare-card ${r.riskLevel.toLowerCase()}`} key={r.scope}><span>{r.scope}</span><strong>{r.riskScore}</strong><b>{r.riskLevel}</b><small>Blast {r.blastRadius} · Paths {r.paths.length} · Evidence {Math.round(r.evidenceConfidence*100)}%</small></div>)}</div><p className="compare-note">LOCAL → FEATURE → SYSTEM으로 넓어질 때 어떤 영향 노드와 경로가 추가되는지 비교해 광역 분석의 근거를 확인합니다.</p>{rows.map(r=><details className="compare-details" key={r.scope}><summary>{r.scope} · {r.changedNodeName} · CRI {r.riskScore}</summary><RiskPanel result={r}/></details>)}</div>
}

function PrPanel({rows}:{rows:Impact[]}){
  const sorted=[...rows].sort((a,b)=>b.riskScore-a.riskScore);
  return <div className="pr-results"><div className="path-title"><Github size={16}/><b>GitHub 변경 Method 분석 · {rows.length}개 시작점</b></div>{sorted.map((r,i)=><details className="compare-details" open={i===0} key={r.changedNode}><summary>{r.changedNodeName} · {r.riskLevel} · CRI {r.riskScore} · Blast {r.blastRadius}</summary><RiskPanel result={r}/></details>)}</div>
}

function EvaluationPanel({value}:{value:Evaluation}){
  const pct=(v:number)=>`${Math.round(v*1000)/10}%`;
  return <div className="evaluation-result"><div className="eval-metrics"><span><b>{pct(value.precision)}</b>Precision</span><span><b>{pct(value.recall)}</b>Recall</span><span><b>{pct(value.f1)}</b>F1</span><span><b>{pct(value.topKRecall)}</b>Top-{value.topK}</span></div><p>TP {value.truePositive} · FP {value.falsePositive} · FN {value.falseNegative} · Expected {value.expectedCount} · Predicted {value.predictedCount}</p>{value.missed.length>0&&<small>Missed: {value.missed.join(' · ')}</small>}</div>
}

function RiskPanel({result}:{result:Impact}){
  const areaLabel:Record<string,string>={API_SURFACE:'API / Controller',BUSINESS_LOGIC:'Business Logic',DATA:'Data Layer',TEST:'Tests',METHOD:'Methods',OTHER:'Other'};
  return <div className={`risk ${result.riskLevel.toLowerCase()}`}>
    <div className="risk-head"><div><AlertTriangle/><span>CHANGE RISK INDEX · {result.scope}</span><strong>{result.riskLevel}</strong></div><div className="score">{result.riskScore}<small>/100 CRI</small></div></div>
    <div className="risk-metrics"><span><b>{result.blastRadius}</b>Blast Radius</span><span><b>{Math.round(result.evidenceConfidence*100)}%</b>Evidence</span><span><b>{result.exploredNodes}</b>Explored</span><span><b>{result.paths.length}</b>Paths</span></div>
    <p className="explanation">{result.explanation}</p>
    <div className="breakdown">{Object.entries(result.riskBreakdown).map(([k,v])=><div key={k}><span>{k}</span><b>{v}</b></div>)}</div>
    <div className="reason-list">{result.riskReasons.map((x,i)=><span key={i}>{x}</span>)}</div>
    <Info icon={<Layers3/>} title="Impact Areas" items={result.areas.map(a=>`${areaLabel[a.category]||a.category} ${a.count}개 (Depth ${a.maxDepth})`)}/>
    <Info icon={<ShieldCheck/>} title="Direct Impact" items={result.directImpact.slice(0,12).map(x=>`${x.name} · ${x.direction} · ${Math.round(x.confidence*100)}%`)}/>
    <Info icon={<Network/>} title="API / Data Impact" items={[...result.apis,...result.entities]}/>
    <Info icon={<TestTube2/>} title="Regression Test Candidates" items={result.tests}/>
    <div className="path-title"><Route size={15}/><b>근거 경로 · 메소드/파일/라인 단위</b></div>
    {result.paths.slice(0,10).map((p,i)=><div className="path path-wide" key={i}>
      <CheckCircle2 size={14}/><div><b>{p.targetName}</b><span>{Math.round(p.pathConfidence*100)}% · {p.hopCount} hops</span><p>{p.steps.map(s=>`${s.name}${s.sourcePath?` [${shortPath(s.sourcePath)}:${s.line}${s.endLine>s.line?`-${s.endLine}`:''}]`:''}`).join('  →  ')}</p></div>
    </div>)}
  </div>
}
function Info({icon,title,items}:{icon:ReactNode;title:string;items:string[]}){return <div className="info"><div>{icon}<b>{title}</b></div><p>{items.length?items.slice(0,16).join(' · '):'탐지된 항목 없음'}</p></div>}
function shortPath(p:string){const x=p.replace(/\\/g,'/').split('/');return x.slice(-3).join('/')}
function messageOf(e:unknown){return e instanceof Error?e.message:'알 수 없는 오류가 발생했습니다.'}
