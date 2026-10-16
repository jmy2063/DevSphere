import {useMemo,useState} from 'react';
import {buildHtmlReport,type ReportData} from '../lib/report';
import {buildSnapshotComparisonHtml} from '../lib/snapshot-report';
import {MAX_SNAPSHOT_BYTES,parseSavedReport,savedAnalyses,compareSavedReports} from '../lib/snapshots';
import type {ImpactNode} from '../lib/api';
import type {ReviewLog} from '../lib/report';
import ReviewEditor from './ReviewEditor';

type Side='before'|'after';
type Saved={name:string;data:ReportData};
const labels={before:'기준',after:'비교'};
function download(data:ReportData,format:'json'|'html'){
  const blob=new Blob([format==='html'?buildHtmlReport(data):JSON.stringify(data,null,2)],{type:format==='html'?'text/html;charset=utf-8':'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;
  a.download=`DevSphere_${data.project.projectId.replace(/[^A-Za-z0-9._-]/g,'_').slice(0,80)}_saved.${format}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function Nodes({title,nodes}:{title:string;nodes:ImpactNode[]}){
  const [all,setAll]=useState(false);
  return <details className="review-details"><summary>{title} · {nodes.length}개</summary>{(all?nodes:nodes.slice(0,50)).map(n=><div className="review-node" key={n.id}><b>{n.name}</b><span>{n.type} · {n.sourcePath}:{n.line}</span><small>{n.depth}단계 · 신뢰도 {Math.round(n.confidence*100)}% · {n.relation} · {n.direction}</small><code>{n.id}</code></div>)}{nodes.length>50&&<button className="review-button" onClick={()=>setAll(!all)}>{all?'접기':`나머지 ${nodes.length-50}개 보기`}</button>}</details>;
}

export default function SavedReviews({getCurrent,available,comparisonKey,onKeyChange}:{getCurrent:()=>ReportData|null;available:boolean;comparisonKey:string;onKeyChange:(value:string)=>void}){
  const [saved,setSaved]=useState<Record<Side,Saved|null>>({before:null,after:null});
  const [loading,setLoading]=useState(false),[error,setError]=useState('');
  const [choice,setChoice]=useState(''),[viewer,setViewer]=useState<Side|null>(null);
  const [editor,setEditor]=useState<Side|null>(null);
  const before=saved.before?.data,after=saved.after?.data;
  const choices=useMemo(()=>before&&after?savedAnalyses(before).filter(a=>savedAnalyses(after).some(b=>b.key===a.key)):[],[before,after]);
  const selected=choices.find(c=>c.key===choice)||choices.find(c=>c.scope==='FEATURE')||choices[0];
  const delta=useMemo(()=>before&&after?compareSavedReports(before,after,selected?.key||''):null,[before,after,selected]);
  const visible=viewer?saved[viewer]:null;
  const html=useMemo(()=>visible?buildHtmlReport(visible.data):'',[visible]);

  async function importFile(side:Side,file:File){
    if(loading)return;setLoading(true);setError('');
    try{
      if(file.size>MAX_SNAPSHOT_BYTES)throw new Error('JSON 보고서는 최대 10MB까지 불러올 수 있습니다.');
      const data=parseSavedReport(await file.text());
      setSaved(old=>({...old,[side]:{name:file.name,data}}));setChoice('');
    }catch(e){setError(e instanceof Error?e.message:'보고서를 불러올 수 없습니다.');}finally{setLoading(false);}
  }
  function capture(side:Side){
    setError('');try{
      const data=getCurrent();if(!data)throw new Error('현재 분석 결과가 없습니다.');
      setSaved(old=>({...old,[side]:{name:'현재 분석 결과',data:parseSavedReport(JSON.stringify(data))}}));setChoice('');
    }catch(e){setError(e instanceof Error?e.message:'결과를 보관할 수 없습니다.');}
  }
  function editKey(side:Side,value:string){setSaved(old=>{const target=old[side];return target?{...old,[side]:{...target,data:{...target.data,comparisonKey:value}}}:old;});}
  function editReview(side:Side,review:ReviewLog):boolean{
    const record=saved[side];if(!record||loading)return false;
    setError('');try{
      const data=parseSavedReport(JSON.stringify({...record.data,review}),record.data.importedAt);
      setSaved(old=>({...old,[side]:{...record,data}}));return true;
    }catch(e){setError(e instanceof Error?e.message:'검토 기록을 저장할 수 없습니다.');return false;}
  }
  function saveComparison(){
    if(!saved.before||!saved.after||!selected)return;
    setError('');
    try{
      const html=buildSnapshotComparisonHtml(saved.before.data,saved.after.data,selected.key,saved.before.name,saved.after.name);
      const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'})),a=document.createElement('a');
      a.href=url;a.download=`DevSphere_comparison_${selected.scope}.html`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(e){setError(e instanceof Error?e.message:'비교 보고서를 저장할 수 없습니다.');}
  }
  return <details className="saved-reviews">
    <summary>저장된 JSON 검토·비교</summary>
    <p>서버에 파일을 보내지 않고 저장된 결과를 읽습니다. 현재 분석 세션은 바꾸지 않습니다. 파일당 최대 10MB이며, 불러온 검증 상태는 파일의 기록을 보여줄 뿐 현재 검증한 결과가 아닙니다.</p>
    <label className="field-label" htmlFor="export-comparison-key">현재 결과에 붙일 프로젝트 비교 키 (선택)</label>
    <input id="export-comparison-key" value={comparisonKey} maxLength={200} onChange={e=>onKeyChange(e.target.value)} placeholder="예: team/my-service · 내보내는 JSON에 포함"/>
    <p className="review-note">다른 업로드끼리 비교할 때는 같은 프로젝트라고 확인한 뒤 양쪽에 같은 키를 지정하세요. 키는 사용자 표기이며 저장소 동일성을 보증하지 않습니다. GitHub 보고서는 저장소·변경 대상도 일치해야 합니다.</p>
    {loading&&<p role="status">JSON 보고서를 읽고 있습니다…</p>}
    {error&&<p className="saved-error" role="alert">{error}</p>}
    <div className="saved-slots">{(['before','after'] as Side[]).map(side=>{
      const record=saved[side];
      return <article className="saved-slot" key={side} aria-label={`${labels[side]} 스냅샷`}><h3>{labels[side]} 결과</h3>
        <label className="review-button saved-file">{labels[side]} JSON 불러오기<input type="file" accept=".json,application/json" aria-label={`${labels[side]} JSON 불러오기`} disabled={loading} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void importFile(side,file);}}/></label>
        <button className="review-button" disabled={!available||loading} onClick={()=>capture(side)}>현재 결과를 {side==='before'?'기준으로':'비교로'} 보관</button>
        {record&&<><p><b>{record.name}</b><br/>{record.data.project.projectId}<br/>생성 {record.data.generatedAt}<br/>검토 기록 {record.data.review?.entries.length||0}개</p>
          <label className="field-label" htmlFor={`saved-key-${side}`}>{labels[side]} 프로젝트 비교 키</label><input id={`saved-key-${side}`} value={record.data.comparisonKey||''} maxLength={200} disabled={loading} onChange={e=>editKey(side,e.target.value)}/>
          <div className="saved-actions"><button className="review-button" disabled={loading} onClick={()=>setEditor(side)}>검토 기록 편집</button><button className="review-button" onClick={()=>setViewer(side)}>검토 내용 열기</button><button className="review-button" onClick={()=>download(record.data,'html')}>HTML 저장</button><button className="review-button" onClick={()=>download(record.data,'json')}>JSON 다시 저장</button><button className="review-button" disabled={loading} onClick={()=>{setSaved(old=>({...old,[side]:null}));if(viewer===side)setViewer(null);if(editor===side)setEditor(null);}}>제거</button></div>
        </>}
      </article>;
    })}</div>
    {editor&&saved[editor]&&<div><h3>{labels[editor]} 결과 검토</h3><button className="review-button" onClick={()=>setEditor(null)}>검토 편집 닫기</button><ReviewEditor key={`${editor}-${saved[editor]!.data.importedAt}`} report={saved[editor]!.data} disabled={loading} onChange={log=>editReview(editor,log)}/><div className="saved-actions"><button className="review-button" disabled={loading} onClick={()=>download(saved[editor]!.data,'json')}>검토 기록 포함 JSON 저장</button><button className="review-button" disabled={loading} onClick={()=>download(saved[editor]!.data,'html')}>검토 기록 포함 HTML 저장</button></div></div>}
    {delta&&<section className="saved-delta" aria-label="저장 결과 증감 비교"><h3>저장 결과 증감 비교</h3>
      {choices.length>0&&<label>비교할 분석<select aria-label="비교할 분석" value={selected?.key||''} onChange={e=>setChoice(e.target.value)}>{choices.map(c=><option value={c.key} key={c.key}>{c.label}</option>)}</select></label>}
      {delta.error?<p className="saved-error" role="status">{delta.error}</p>:<>
        <button className="review-button" disabled={loading} onClick={saveComparison}>비교 HTML 보고서 저장</button>
        <p className="review-note">양쪽 파일 정보와 추가·제외·근거 변경 후보 전체를 저장합니다. 다시 비교할 때 사용할 원본 JSON도 함께 보관하세요.</p>
        <div className="report-counts"><span>추가 <b>{delta.added.length}</b></span><span>제외 <b>{delta.removed.length}</b></span><span>근거·위치 변경 <b>{delta.changed.length}</b></span><span>유지 <b>{delta.unchanged}</b></span><span>테스트 추가 <b>{delta.testsAdded.length}</b></span><span>테스트 제외 <b>{delta.testsRemoved.length}</b></span></div>
        <p>CRI {delta.riskBefore} → {delta.riskAfter} ({delta.riskAfter-delta.riskBefore>=0?'+':''}{delta.riskAfter-delta.riskBefore}){before?.github?' · 개별 시작점 최댓값':''} · 변경 시작점 {delta.startsBefore} → {delta.startsAfter}개</p>
        {delta.warnings.map(w=><p className="review-note" key={w}>{w}</p>)}
        <p className="review-note">추가·제외는 의미 식별자로 비교합니다. 근거·위치 변경에는 깊이·신뢰도·관계·파일·줄 번호 변화가 포함되며, 실제 장애나 기능 변경을 판정한 것은 아닙니다.</p>
        <Nodes key={`added-${selected?.key}-${before?.generatedAt}-${after?.generatedAt}`} title="추가된 영향 후보" nodes={delta.added}/>
        <Nodes title="제외된 영향 후보" nodes={delta.removed}/><Nodes title="추가된 테스트 후보" nodes={delta.testsAdded}/><Nodes title="제외된 테스트 후보" nodes={delta.testsRemoved}/>
        <details className="review-details"><summary>근거·위치가 달라진 후보 · {delta.changed.length}개</summary>{delta.changed.slice(0,50).map(pair=><div className="review-node" key={pair.after.id}><b>{pair.after.name}</b><span>이전 {pair.before.sourcePath}:{pair.before.line} · {pair.before.depth}단계 · {Math.round(pair.before.confidence*100)}%</span><span>이후 {pair.after.sourcePath}:{pair.after.line} · {pair.after.depth}단계 · {Math.round(pair.after.confidence*100)}%</span></div>)}{delta.changed.length>50&&<p>처음 50개 표시 · 전체 내용은 양쪽 보고서를 열어 확인하세요.</p>}</details>
      </>}
    </section>}
    {visible&&<section className="saved-viewer" aria-label="불러온 보고서 검토"><h3>{viewer?labels[viewer]:''} 보고서 · 읽기 전용</h3><p>파일의 출처와 검증 기록을 재확인하지 않았습니다. 이 내용으로 서버 분석을 실행하지 않습니다.</p><button className="review-button" onClick={()=>setViewer(null)}>미리보기 닫기</button>{html.length>3000000?<p>보고서가 커서 미리보기를 생략했습니다. HTML 저장 후 브라우저에서 확인하세요.</p>:<iframe title="저장된 보고서 미리보기" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={html}/>}</section>}
  </details>;
}
