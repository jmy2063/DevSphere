import {useState} from 'react';
import type {Impact} from '../lib/api';

export default function ReviewEvidence({results,nodeId}:{results:Impact[];nodeId:string}){
  const [all,setAll]=useState(false);
  const sources=results.flatMap(result=>{
    const candidate=[...result.directImpact,...result.indirectImpact].find(n=>n.id===nodeId);
    const paths=result.paths.filter(p=>p.targetId===nodeId);
    return candidate||paths.length?[{result,candidate,paths}]:[];
  });
  return <section className="review-evidence" aria-label="선택 대상의 분석 근거"><h4>선택 대상의 분석 근거</h4>
    <p className="review-note">저장된 분석의 경로와 위치입니다. 신뢰도는 정적 그래프 근거이며 실제 실행이나 테스트 성공을 뜻하지 않습니다.</p>
    {!sources.length?<p>이 분석에 저장된 후보·근거 경로가 없습니다. 영향이 없다는 판정은 아닙니다. 누락 판단에는 별도로 확인한 소스와 이유를 기록하세요.</p>:<>
      <p>관련 변경 시작점 {sources.length}개</p>
      {(all?sources:sources.slice(0,10)).map(({result,candidate,paths},index)=><details className="review-details" key={`${result.changedNode}-${index}`}>
        <summary>{result.changedNodeName} · {paths.length}개 경로</summary>
        <code>{result.changedNode}</code>
        {candidate&&<p>{candidate.depth}단계 · {candidate.relation} · {candidate.direction} · 신뢰도 {Math.round(candidate.confidence*100)}%<br/>{candidate.sourcePath}:{candidate.line}</p>}
        {!paths.length?<p>후보에는 포함되지만 이 JSON에 대상까지의 경로가 저장되어 있지 않습니다. 경로 저장 개수 제한 등으로 생략될 수 있습니다.</p>:paths.map((path,i)=><div className="review-node" key={i}>
          <b>{path.hopCount}단계 경로 · 신뢰도 {Math.round(path.pathConfidence*100)}%</b>
          <ol>{path.steps.map((step,j)=><li key={j}><b>{step.name}</b><span>{step.viaRelation} · {step.direction}</span><span>{step.sourcePath}:{step.line}{step.endLine>step.line?`–${step.endLine}`:''}</span><code>{step.id}</code></li>)}</ol>
        </div>)}
      </details>)}
      {sources.length>10&&<button className="review-button" onClick={()=>setAll(!all)}>{all?'시작점 접기':`나머지 ${sources.length-10}개 시작점 근거 보기`}</button>}
    </>}
  </section>;
}
