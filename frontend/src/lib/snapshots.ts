import type {Summary,Node,Edge,Impact,ImpactNode,ImpactPath,Evaluation,GithubChangeReport,AnalysisScope} from './api';
import type {ReportData} from './report';

export const MAX_SNAPSHOT_BYTES=10*1024*1024;
const types=new Set(['PROJECT','PACKAGE','CONTROLLER','SERVICE','REPOSITORY','ENTITY','CLASS','METHOD','API','TEST','TABLE']);
const scopes=new Set(['LOCAL','FEATURE','SYSTEM']);
const forbidden=new Set(['__proto__','constructor','prototype']);
type Obj=Record<string,unknown>;
function fail(path:string):never{throw new Error(`보고서 형식이 올바르지 않습니다: ${path}`);}
function obj(value:unknown,path:string):Obj{if(!value||typeof value!=='object'||Array.isArray(value))return fail(path);return value as Obj;}
function text(value:unknown,path:string,max=4000):string{if(typeof value!=='string'||value.length>max)return fail(path);return value;}
function id(value:unknown,path:string):string{const s=text(value,path);if(!s.trim())return fail(path);return s;}
function num(value:unknown,path:string,min=0,max=Number.MAX_SAFE_INTEGER,integer=false):number{if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max||integer&&!Number.isInteger(value))return fail(path);return value;}
function count(value:unknown,path:string):number{return num(value,path,0,Number.MAX_SAFE_INTEGER,true);}
function scope(value:unknown,path:string):AnalysisScope{if(typeof value!=='string'||!scopes.has(value))return fail(path);return value as AnalysisScope;}
function nodeType(value:unknown,path:string):Node['type']{if(typeof value!=='string'||!types.has(value))return fail(path);return value as Node['type'];}
function strings(value:unknown,path:string):string[]{return array(value,path,20000).map((v,i)=>text(v,`${path}[${i}]`));}
function array(value:unknown,path:string,max=20000):unknown[]{if(!Array.isArray(value)||value.length>max)return fail(path);return value;}
function stringMap(value:unknown,path:string):Record<string,string>{
  const pairs=Object.entries(obj(value,path));if(pairs.length>100)return fail(path);
  return Object.fromEntries(pairs.map(([k,v])=>{if(forbidden.has(k)||k.length>200)return fail(path);return [k,text(v,`${path}.${k}`,20000)];}));
}
function numberMap(value:unknown,path:string):Record<string,number>{
  const pairs=Object.entries(obj(value,path));if(pairs.length>100)return fail(path);
  return Object.fromEntries(pairs.map(([k,v])=>{if(forbidden.has(k)||k.length>200)return fail(path);return [k,num(v,`${path}.${k}`)];}));
}
function at<T>(value:unknown,path:string,parse:(o:Obj,p:string)=>T):T{return parse(obj(value,path),path);}
function timestamp(value:unknown,path:string):string{const v=text(value,path,100);if(!Number.isFinite(Date.parse(v)))return fail(path);return v;}

/** Whitelist the supported schema; never restore a server session or trust embedded verification claims. */
export function parseSavedReport(json:string,importedAt=new Date().toISOString()):ReportData {
  if(new TextEncoder().encode(json).byteLength>MAX_SNAPSHOT_BYTES)throw new Error('JSON 보고서는 최대 10MB까지 불러올 수 있습니다.');
  let raw:unknown;try{raw=JSON.parse(json);}catch{throw new Error('올바른 JSON 파일을 선택해주세요.');}
  const root=obj(raw,'report');
  if(root.formatVersion!==undefined&&root.formatVersion!==1)throw new Error('지원하지 않는 보고서 버전입니다.');
  let budget=250000;
  function rows<T>(value:unknown,path:string,max:number,parse:(v:unknown,p:string)=>T):T[]{const values=array(value,path,max);budget-=values.length;if(budget<0)throw new Error('보고서 항목 수가 읽기 한도를 초과했습니다.');return values.map((v,i)=>parse(v,`${path}[${i}]`));}
  const project=at(root.project,'project',(o,p):Summary=>({
    projectId:id(o.projectId,`${p}.projectId`),analyzedClasses:count(o.analyzedClasses,p),nodeCount:count(o.nodeCount,p),edgeCount:count(o.edgeCount,p),analysisDurationMs:count(o.analysisDurationMs,p),
    controllers:count(o.controllers,p),services:count(o.services,p),repositories:count(o.repositories,p),entities:count(o.entities,p),methods:count(o.methods,p),apis:count(o.apis,p),tests:count(o.tests,p),warnings:strings(o.warnings,`${p}.warnings`),
    nodes:rows(o.nodes,`${p}.nodes`,50000,(v,q)=>at(v,q,(n,r):Node=>({id:id(n.id,`${r}.id`),name:id(n.name,`${r}.name`),type:nodeType(n.type,r),sourcePath:text(n.sourcePath,r),line:num(n.line,r,1,Number.MAX_SAFE_INTEGER,true),confidence:num(n.confidence,r,0,1),attributes:stringMap(n.attributes,`${r}.attributes`)}))),
    edges:rows(o.edges,`${p}.edges`,200000,(v,q)=>at(v,q,(e,r):Edge=>({source:id(e.source,r),target:id(e.target,r),type:id(e.type,r),confidence:num(e.confidence,r,0,1)})))
  }));
  const graph=new Map(project.nodes.map(n=>[n.id,n]));
  if(graph.size!==project.nodes.length)fail('project.nodes 중복 ID');
  if(project.nodes.length!==project.nodeCount||project.edges.length!==project.edgeCount)fail('project 노드/관계 수');
  for(const e of project.edges)if(!graph.has(e.source)||!graph.has(e.target))fail('project.edges 대상');
  function known(value:unknown,path:string):string{const key=id(value,path);if(!graph.has(key))return fail(`${path} (프로젝트에 없는 ID)`);return key;}
  function impactNode(value:unknown,path:string):ImpactNode{return at(value,path,(o,p)=>({id:known(o.id,p),name:id(o.name,p),type:nodeType(o.type,p),sourcePath:text(o.sourcePath,p),line:num(o.line,p,1,Number.MAX_SAFE_INTEGER,true),endLine:num(o.endLine,p,1,Number.MAX_SAFE_INTEGER,true),depth:num(o.depth,p,0,6,true),relation:text(o.relation,p),direction:text(o.direction,p),confidence:num(o.confidence,p,0,1)}));}
  function impact(value:unknown,path:string):Impact{return at(value,path,(o,p)=>{
    const level=text(o.riskLevel,p);if(!['LOW','MEDIUM','HIGH','CRITICAL'].includes(level))fail(`${p}.riskLevel`);
    const result:Impact={changedNode:known(o.changedNode,`${p}.changedNode`),changedNodeName:id(o.changedNodeName,p),scope:scope(o.scope,p),
      directImpact:rows(o.directImpact,`${p}.directImpact`,6000,impactNode),indirectImpact:rows(o.indirectImpact,`${p}.indirectImpact`,6000,impactNode),
      apis:strings(o.apis,p),entities:strings(o.entities,p),tests:strings(o.tests,p),riskScore:num(o.riskScore,p,0,100,true),riskLevel:level as Impact['riskLevel'],riskReasons:strings(o.riskReasons,p),riskBreakdown:numberMap(o.riskBreakdown,p),evidenceConfidence:num(o.evidenceConfidence,p,0,1),blastRadius:count(o.blastRadius,p),maxDepth:num(o.maxDepth,p,1,6,true),exploredNodes:count(o.exploredNodes,p),explanation:text(o.explanation,p,200000),
      areas:rows(o.areas,`${p}.areas`,100,(v,q)=>at(v,q,(a,r)=>({category:text(a.category,r),count:count(a.count,r),maxDepth:num(a.maxDepth,r,0,6,true),names:strings(a.names,r)}))),
      paths:rows(o.paths,`${p}.paths`,120,(v,q)=>at(v,q,(a,r):ImpactPath=>({targetId:known(a.targetId,r),targetName:id(a.targetName,r),targetType:nodeType(a.targetType,r),hopCount:num(a.hopCount,r,0,6,true),pathConfidence:num(a.pathConfidence,r,0,1),steps:rows(a.steps,`${r}.steps`,32,(s,t)=>at(s,t,(n,u)=>({id:known(n.id,u),name:id(n.name,u),type:nodeType(n.type,u),sourcePath:text(n.sourcePath,u),line:num(n.line,u,1,Number.MAX_SAFE_INTEGER,true),endLine:num(n.endLine,u,1,Number.MAX_SAFE_INTEGER,true),viaRelation:text(n.viaRelation,u),direction:text(n.direction,u)})))})))
    };
    const predicted=[...result.directImpact,...result.indirectImpact];
    if(new Set(predicted.map(n=>n.id)).size!==predicted.length)fail(`${p}.영향 후보 중복 ID`);
    for(const n of predicted)if(n.depth>result.maxDepth||n.endLine<n.line||n.id===result.changedNode)fail(`${p}.영향 후보 범위`);
    const predictedIds=new Set(predicted.map(n=>n.id));
    for(const path of result.paths)if(!predictedIds.has(path.targetId)||path.steps.length<2||path.steps[0].id!==result.changedNode||path.steps[path.steps.length-1].id!==path.targetId)fail(`${p}.근거 경로`);
    return result;
  });}
  const result=root.result==null?null:impact(root.result,'result');
  const comparison=root.comparison==null?null:at(root.comparison,'comparison',(o,p)=>{
    const LOCAL=impact(o.LOCAL,`${p}.LOCAL`),FEATURE=impact(o.FEATURE,`${p}.FEATURE`),SYSTEM=impact(o.SYSTEM,`${p}.SYSTEM`);
    if(LOCAL.scope!=='LOCAL'||FEATURE.scope!=='FEATURE'||SYSTEM.scope!=='SYSTEM'||new Set([LOCAL.changedNode,FEATURE.changedNode,SYSTEM.changedNode]).size!==1)fail(p);
    return {LOCAL,FEATURE,SYSTEM};
  });
  const github=root.github==null?null:at(root.github,'github',(o,p):GithubChangeReport=>{
    const kind=text(o.kind,p);if(!['PR','COMMIT'].includes(kind))fail(`${p}.kind`);
    const owner=id(o.owner,p),repo=id(o.repo,p);if(![owner,repo].every(s=>/^[A-Za-z0-9_.-]{1,100}$/.test(s)))fail(`${p}.저장소`);
    const parsed:GithubChangeReport={kind,owner,repo,reference:id(o.reference,p),baseSha:text(o.baseSha,p,64),headSha:id(o.headSha,p),declaredRevision:text(o.declaredRevision,p,64),revisionStatus:id(o.revisionStatus,p),mappingSide:text(o.mappingSide,p),warnings:strings(o.warnings,p),
      results:rows(o.results,`${p}.results`,1000,impact),
      files:rows(o.files,`${p}.files`,3000,(v,q)=>at(v,q,(f,r)=>({filename:text(f.filename,r),previousFilename:text(f.previousFilename,r),changeStatus:text(f.changeStatus,r),mappingStatus:text(f.mappingStatus,r),reason:text(f.reason,r),startNodeIds:rows(f.startNodeIds,r,6000,known)}))),
      summary:at(o.summary,`${p}.summary`,(s,r)=>({changedFiles:count(s.changedFiles,r),javaFiles:count(s.javaFiles,r),methodMappedFiles:count(s.methodMappedFiles,r),fallbackFiles:count(s.fallbackFiles,r),unmappedJavaFiles:count(s.unmappedJavaFiles,r),changedStarts:count(s.changedStarts,r),uniqueImpactNodes:count(s.uniqueImpactNodes,r),uniqueStructuralNodes:count(s.uniqueStructuralNodes,r),maxStartRiskScore:num(s.maxStartRiskScore,r,0,100,true),tests:rows(s.tests,`${r}.tests`,6000,(v,q)=>at(v,q,(t,u)=>({id:known(t.id,u),name:id(t.name,u),sourcePath:text(t.sourcePath,u),line:num(t.line,u,1,Number.MAX_SAFE_INTEGER,true),depth:num(t.depth,u,0,6,true),confidence:num(t.confidence,u,0,1),changedStarts:strings(t.changedStarts,u)})))}))};
    if(o.sourceVerification!=null)parsed.sourceVerification=at(o.sourceVerification,`${p}.sourceVerification`,(v,q)=>({status:id(v.status,q),revision:text(v.revision,q,64),zipPrefix:text(v.zipPrefix,q),localFiles:count(v.localFiles,q),repositoryFiles:count(v.repositoryFiles,q),matchedFiles:count(v.matchedFiles,q),changedFiles:count(v.changedFiles,q),missingFiles:count(v.missingFiles,q),extraFiles:count(v.extraFiles,q),message:text(v.message,q),differences:rows(v.differences,q,100,(x,y)=>at(x,y,(d,z)=>({path:text(d.path,z),status:id(d.status,z)})))}));
    return parsed;
  });
  const evaluation=root.evaluation==null?null:at(root.evaluation,'evaluation',(o,p):Evaluation=>({changedNode:known(o.changedNode,p),scope:scope(o.scope,p),expectedCount:count(o.expectedCount,p),predictedCount:count(o.predictedCount,p),truePositive:count(o.truePositive,p),falsePositive:count(o.falsePositive,p),falseNegative:count(o.falseNegative,p),precision:num(o.precision,p,0,1),recall:num(o.recall,p,0,1),f1:num(o.f1,p,0,1),topK:num(o.topK,p,1,1000,true),topKRecall:num(o.topKRecall,p,0,1),matched:strings(o.matched,p),missed:strings(o.missed,p),unexpected:strings(o.unexpected,p)}));
  const active=[result,comparison,github].filter(Boolean).length;
  if(active>1||active===0&&!evaluation)fail('분석 결과');
  const report:ReportData={formatVersion:1,generatedAt:timestamp(root.generatedAt,'generatedAt'),project,result,comparison,github,evaluation,comparisonKey:root.comparisonKey==null?'':text(root.comparisonKey,'comparisonKey',200).trim(),importedAt:timestamp(importedAt,'importedAt')};
  if(root.review!=null){
    const contexts=new Map(savedAnalyses(report).map(a=>[a.key,{candidates:new Set(a.results.flatMap(r=>[...r.directImpact,...r.indirectImpact].map(n=>n.id))),starts:new Set(a.results.map(r=>r.changedNode))}]));
    const seen=new Set<string>();
    report.review=at(root.review,'review',(o,p)=>{
      if(o.version!==1)fail(`${p}.version`);
      return {version:1,reviewer:text(o.reviewer,`${p}.reviewer`,100).trim(),entries:rows(o.entries,`${p}.entries`,2000,(v,q)=>at(v,q,(e,r)=>{
        const analysisKey=text(e.analysisKey,`${r}.analysisKey`,100000),nodeId=known(e.nodeId,`${r}.nodeId`);
        const decision=text(e.decision,`${r}.decision`),reason=text(e.reason,`${r}.reason`,2000).trim();
        const context=contexts.get(analysisKey),key=JSON.stringify([analysisKey,nodeId]);
        if(!context||seen.has(key)||context.starts.has(nodeId)||['PROJECT','PACKAGE'].includes(graph.get(nodeId)!.type))fail(`${r}.검토 대상`);
        if(!['CONFIRMED','EXCLUDED','NEEDS_REVIEW','MISSING'].includes(decision))fail(`${r}.decision`);
        if(decision==='MISSING'?context.candidates.has(nodeId):!context.candidates.has(nodeId))fail(`${r}.후보 구분`);
        if(['EXCLUDED','MISSING'].includes(decision)&&!reason)fail(`${r}.판단 이유`);
        seen.add(key);
        return {analysisKey,nodeId,decision:decision as import('./report').ReviewDecision,reason,updatedAt:timestamp(e.updatedAt,`${r}.updatedAt`)};
      }))};
    });
  }
  return report;
}

export type SavedAnalysis={key:string;label:string;kind:'NODE'|'PR'|'COMMIT';scope:string;maxDepth:number;starts:string[];results:Impact[];risk:number};
const graphIndexes=new WeakMap<Summary,Map<string,Node>>();
function identity(id:string,report:ReportData):string {
  let graph=graphIndexes.get(report.project);if(!graph){graph=new Map(report.project.nodes.map(n=>[n.id,n]));graphIndexes.set(report.project,graph);}
  const n=graph.get(id);if(!n)return JSON.stringify(['ID',id]);
  if(n.type==='METHOD'&&n.attributes.ownerFqcn&&n.attributes.methodName&&typeof n.attributes.parameterTypes==='string')return JSON.stringify(['METHOD',n.attributes.ownerFqcn,n.attributes.methodName,n.attributes.parameterTypes]);
  if(['CLASS','CONTROLLER','SERVICE','REPOSITORY','ENTITY','TEST'].includes(n.type)&&n.attributes.fqcn)return JSON.stringify(['CLASS',n.attributes.fqcn]);
  return JSON.stringify([n.type,n.id]);
}
export function savedAnalyses(report:ReportData):SavedAnalysis[] {
  if(report.github){
    const r=report.github,first=r.results[0];if(!first)return [];
    const starts=r.results.map(i=>identity(i.changedNode,report)).sort();
    return [{key:JSON.stringify([r.kind,r.owner.toLowerCase(),r.repo.toLowerCase(),r.kind==='COMMIT'?r.headSha.toLowerCase():r.reference,first.scope]),label:`${r.kind} ${r.reference} · ${first.scope}`,kind:r.kind as 'PR'|'COMMIT',scope:first.scope,maxDepth:first.maxDepth,starts,results:r.results,risk:Math.max(...r.results.map(i=>i.riskScore))}];
  }
  const rows=report.result?[report.result]:report.comparison?Object.values(report.comparison):[];
  return rows.map(r=>({key:JSON.stringify(['NODE',identity(r.changedNode,report),r.scope]),label:`${r.changedNodeName} · ${r.scope}`,kind:'NODE',scope:r.scope,maxDepth:r.maxDepth,starts:[identity(r.changedNode,report)],results:[r],risk:r.riskScore}));
}
export type SnapshotDelta={error:string;warnings:string[];added:ImpactNode[];removed:ImpactNode[];changed:{before:ImpactNode;after:ImpactNode}[];unchanged:number;testsAdded:ImpactNode[];testsRemoved:ImpactNode[];riskBefore:number;riskAfter:number;startsBefore:number;startsAfter:number};
export function compareSavedReports(before:ReportData,after:ReportData,key:string):SnapshotDelta {
  const out:SnapshotDelta={error:'',warnings:[],added:[],removed:[],changed:[],unchanged:0,testsAdded:[],testsRemoved:[],riskBefore:0,riskAfter:0,startsBefore:0,startsAfter:0};
  const a=savedAnalyses(before).find(r=>r.key===key),b=savedAnalyses(after).find(r=>r.key===key);
  if(!a||!b)return {...out,error:'같은 변경 시작점·분석 범위 또는 같은 GitHub 변경 보고서를 선택해주세요. 분석되지 않은 보고서는 증감을 비교할 수 없습니다.'};
  if((before.comparisonKey||after.comparisonKey)&&(!before.comparisonKey||before.comparisonKey!==after.comparisonKey))return {...out,error:'양쪽에 동일한 프로젝트 비교 키를 지정해주세요. 이 키는 사용자가 지정하는 프로젝트 표기입니다.'};
  if(Boolean(before.github)!==Boolean(after.github))return {...out,error:'일반 영향 분석과 GitHub 변경 집합은 비교할 수 없습니다.'};
  const x=before.github,y=after.github;
  if(x&&y){
    if(x.owner.toLowerCase()!==y.owner.toLowerCase()||x.repo.toLowerCase()!==y.repo.toLowerCase()||x.kind!==y.kind||x.kind==='PR'&&x.reference!==y.reference)return {...out,error:'저장소 또는 GitHub 변경 대상이 다릅니다.'};
    if(x.kind==='COMMIT'&&x.headSha.toLowerCase()!==y.headSha.toLowerCase())return {...out,error:'서로 다른 커밋의 변경 집합은 같은 분석 대상으로 비교하지 않습니다.'};
    if(x.mappingSide!==y.mappingSide||x.revisionStatus!==y.revisionStatus||(x.sourceVerification?.status||'NOT_REQUESTED')!==(y.sourceVerification?.status||'NOT_REQUESTED'))return {...out,error:'소스 검증 상태 또는 HEAD/BASE 매핑 방향이 다릅니다.'};
  }else if(!before.comparisonKey&&before.project.projectId!==after.project.projectId)return {...out,error:'업로드 식별자가 다릅니다. 같은 프로젝트라고 확인한 경우 양쪽에 동일한 프로젝트 비교 키를 지정해주세요.'};
  if(a.maxDepth!==b.maxDepth||[...a.results,...b.results].some(r=>r.scope!==a.scope||r.maxDepth!==a.maxDepth))return {...out,error:'분석 범위 또는 최대 탐색 깊이가 달라 비교할 수 없습니다.'};
  function collect(report:ReportData,analysis:SavedAnalysis):Map<string,ImpactNode>{
    const result=new Map<string,ImpactNode>(),starts=new Set(analysis.starts);
    for(const row of analysis.results){
      const within=new Set<string>();
      for(const node of [...row.directImpact,...row.indirectImpact]){
        const stable=identity(node.id,report);
        if(within.has(stable))throw new Error('같은 의미 식별자에 여러 후보가 있어 비교할 수 없습니다.');within.add(stable);
        if(starts.has(stable))continue;
        const old=result.get(stable);
        if(old&&old.id!==node.id)throw new Error('같은 의미 식별자에 여러 Node ID가 있어 비교할 수 없습니다.');
        if(!old||node.depth<old.depth||node.depth===old.depth&&node.confidence>old.confidence)result.set(stable,node);
      }
    }
    return result;
  }
  let left:Map<string,ImpactNode>,right:Map<string,ImpactNode>;
  try{left=collect(before,a);right=collect(after,b);}catch(e){return {...out,error:e instanceof Error?e.message:'후보 식별자를 비교할 수 없습니다.'};}
  const metadata=(n:ImpactNode)=>JSON.stringify([n.type,n.name,n.sourcePath,n.line,n.endLine,n.depth,n.confidence,n.relation,n.direction]);
  for(const [id,node] of right){const old=left.get(id);if(!old)out.added.push(node);else if(metadata(old)!==metadata(node))out.changed.push({before:old,after:node});else out.unchanged++;}
  for(const [id,node] of left)if(!right.has(id))out.removed.push(node);
  out.testsAdded=[...right].filter(([id,n])=>n.type==='TEST'&&left.get(id)?.type!=='TEST').map(([,n])=>n);
  out.testsRemoved=[...left].filter(([id,n])=>n.type==='TEST'&&right.get(id)?.type!=='TEST').map(([,n])=>n);
  Object.assign(out,{riskBefore:a.risk,riskAfter:b.risk,startsBefore:a.starts.length,startsAfter:b.starts.length});
  out.warnings.push('파일에 저장된 결과끼리 비교합니다. 소스·서명·분석기 버전을 재검증하지 않으므로 점수 변화의 원인을 소스 변경으로만 단정할 수 없습니다.');
  if(!x)out.warnings.push('프로젝트 비교 키 또는 업로드 ID는 파일의 자기 표기입니다. 동일한 저장소라는 보증이 아닙니다.');
  if(a.starts.length!==b.starts.length)out.warnings.push('분석된 변경 시작점 수가 달라졌습니다. GitHub 변경 집합의 차이도 후보 증감에 영향을 줍니다.');
  return out;
}
