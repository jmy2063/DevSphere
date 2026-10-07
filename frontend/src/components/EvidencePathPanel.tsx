import type {ImpactPath} from '../lib/api';

export default function EvidencePathPanel({path,onInspect}:{path:ImpactPath;onInspect:(id:string)=>void}){
  return <section className="evidence-path" aria-label="선택한 근거 경로">
    <div className="evidence-path-head">
      <div><span>선택한 근거 경로</span><h3>{path.targetName}</h3></div>
      <p>{path.hopCount}단계 · 경로 신뢰도 {Math.round(path.pathConfidence*100)}%</p>
    </div>
    <ol>
      {path.steps.map((step,index)=><li key={`${step.id}-${index}`}>
        <button type="button" onClick={()=>onInspect(step.id)} aria-label={`${index+1}단계 ${step.name} 살펴보기`}>
          <span className="evidence-index">{index+1}</span>
          <span className="evidence-content"><b>{step.name}</b><small>{step.type} · {step.sourcePath?`${step.sourcePath}:${step.line}${step.endLine>step.line?`–${step.endLine}`:''}`:'소스 위치 없음'}</small></span>
        </button>
        {index>0&&<span className="evidence-relation">{step.viaRelation||'관계 정보 없음'} · {step.direction||'방향 정보 없음'}</span>}
      </li>)}
    </ol>
    <p className="evidence-caption">엔진이 반환한 대표 경로입니다. 관계와 소스 위치를 순서대로 확인할 수 있습니다.</p>
  </section>;
}
