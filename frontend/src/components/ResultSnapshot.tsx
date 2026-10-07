import type {AnalysisScope,GithubChangeReport,Impact,ImpactComparison,ImpactNode,ImpactPath} from '../lib/api';

type Props={
  result:Impact|null;
  comparison:ImpactComparison|null;
  report:GithubChangeReport|null;
  scope:AnalysisScope;
  onDetails:()=>void;
  onFocusPath:(path:ImpactPath)=>void;
  onInspectNode:(id:string)=>void;
};

export default function ResultSnapshot({result,comparison,report,scope,onDetails,onFocusPath,onInspectNode}:Props){
  const selected=result||comparison?.[scope]||comparison?.FEATURE||null;
  const pr=report?.kind==='PR';
  const sources=selected?[selected]:report?.results||[];
  const candidates=[...new Map(sources.flatMap(row=>[...row.directImpact,...row.indirectImpact]).map(node=>[node.id,node])).values()];
  const topImpact=candidates.filter(node=>node.type!=='TEST').sort((a,b)=>a.depth-b.depth||b.confidence-a.confidence).slice(0,3);
  const allLocalTests=candidates.filter(node=>node.type==='TEST').sort((a,b)=>a.depth-b.depth||b.confidence-a.confidence);
  const localTests=allLocalTests.slice(0,3);
  const reportTests=report?.summary.tests.slice(0,3)||[];
  const hasScore=Boolean(selected||report?.results.length);
  const score=selected?.riskScore??report?.summary.maxStartRiskScore??0;
  const level=selected?.riskLevel??(report?.results.length?report.results.reduce((top,row)=>row.riskScore>top.riskScore?row:top).riskLevel:'UNKNOWN');
  const title=report?(pr?`PR #${report.reference}`:`Commit ${report.reference.slice(0,8)}`):selected?.changedNodeName||'분석 결과';
  const impactCount=selected?candidates.length:report?.summary.uniqueImpactNodes??0;
  const testCount=selected?allLocalTests.length:report?.summary.tests.length??0;
  function inspect(id:string){
    const path=sources.flatMap(row=>row.paths).find(candidate=>candidate.targetId===id);
    if(path)onFocusPath(path);
    else onInspectNode(id);
  }

  return <>
    <div className="snapshot-head">
      <div><span className="snapshot-eyebrow">{hasScore?'분석 완료':'보고서 생성 · 영향 분석 없음'} · {report?'GitHub 변경':'선택한 변경점'}</span><h2>{title}</h2><p>{hasScore?'먼저 영향과 테스트 후보를 확인하고, 아래에서 근거 경로를 살펴보세요.':'버전·소스 검증과 파일별 매핑 상태를 상세 보고서에서 확인하세요.'}</p></div>
      <div className={`snapshot-score ${String(level).toLowerCase()}`}><span>{report?'시작점 최고 CRI':'상대 위험지수 CRI'}</span><strong>{hasScore?score:'—'}{hasScore&&<small>/100</small>}</strong><b>{hasScore?level:'산출 안 됨'}</b></div>
    </div>
    <div className="snapshot-grid">
      <div className="snapshot-card"><span>영향 후보 · {impactCount}개</span>{topImpact.length?topImpact.map(node=><button type="button" className="snapshot-item" key={node.id} onClick={()=>inspect(node.id)}>{node.name}<small>{node.type} · {node.depth}단계 · 근거 보기</small></button>):<p>{report?.results.length?'상세 보고서에서 영향 경로를 확인하세요.':'분석된 영향 후보가 없습니다.'}</p>}</div>
      <div className="snapshot-card"><span>먼저 확인할 테스트 · {testCount}개</span>{selected?localTests.length?localTests.map(node=><button type="button" className="snapshot-item" key={node.id} onClick={()=>inspect(node.id)}>{node.name}<small>{location(node)} · 근거 보기</small></button>):<p>연결된 테스트 후보가 없습니다. 변경 동작을 직접 확인하세요.</p>:reportTests.length?reportTests.map(test=><button type="button" className="snapshot-item" key={test.id} onClick={()=>inspect(test.id)}>{test.name}<small>{test.sourcePath}:{test.line} · 근거 보기</small></button>):<p>추천 테스트 후보가 없습니다.</p>}</div>
      <div className="snapshot-card snapshot-next"><span>다음 확인</span><p>{report?`${report.summary.changedFiles}개 변경 파일의 매핑 상태와 소스 검증 결과를 확인하세요.`:`${selected?.paths.length||0}개 대표 경로에서 영향을 연결한 근거를 확인하세요.`}</p><button type="button" onClick={onDetails}>상세 결과 보기</button></div>
    </div>
    <p className="snapshot-note">CRI는 장애 발생 확률이 아닌 그래프 근거 기반 상대 지수입니다. 테스트는 실행 결과가 아닌 후보입니다.</p>
  </>;
}

function location(node:ImpactNode){return node.sourcePath?`${node.sourcePath}:${node.line}`:`${node.depth}단계`}
