export const API = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');

export type NodeType = 'PROJECT'|'PACKAGE'|'CONTROLLER'|'SERVICE'|'REPOSITORY'|'ENTITY'|'CLASS'|'METHOD'|'API'|'TEST'|'TABLE';
export type AnalysisScope = 'LOCAL'|'FEATURE'|'SYSTEM';
export type Node = {id:string; name:string; type:NodeType; sourcePath:string; line:number; confidence:number; attributes:Record<string,string>};
export type Edge = {source:string; target:string; type:string; confidence:number};
export type Summary = {
  projectId:string; analyzedClasses:number; nodeCount:number; edgeCount:number; analysisDurationMs:number;
  controllers:number; services:number; repositories:number; entities:number; methods:number; apis:number; tests:number;
  nodes:Node[]; edges:Edge[]; warnings:string[];
};
export type ImpactNode = {
  id:string;name:string;type:string;depth:number;relation:string;direction:string;confidence:number;
  sourcePath:string;line:number;endLine:number
};
export type PathStep = {
  id:string;name:string;type:string;sourcePath:string;line:number;endLine:number;viaRelation:string;direction:string
};
export type ImpactPath = {
  targetId:string;targetName:string;targetType:string;hopCount:number;pathConfidence:number;steps:PathStep[]
};
export type ImpactArea = {category:string;count:number;maxDepth:number;names:string[]};
export type Impact = {
  changedNode:string; changedNodeName:string; scope:AnalysisScope;
  directImpact:ImpactNode[]; indirectImpact:ImpactNode[];
  apis:string[]; entities:string[]; tests:string[]; areas:ImpactArea[];
  riskScore:number; riskLevel:'LOW'|'MEDIUM'|'HIGH'|'CRITICAL'; riskReasons:string[];
  riskBreakdown:Record<string,number>; evidenceConfidence:number; blastRadius:number;
  maxDepth:number; exploredNodes:number; paths:ImpactPath[]; explanation:string;
};
export type ImpactComparison = Record<AnalysisScope, Impact>;
export type Health = {status:string; service:string; time:string; neo4jConfigured:boolean};
export type Evaluation = {
  changedNode:string;scope:string;expectedCount:number;predictedCount:number;truePositive:number;falsePositive:number;falseNegative:number;
  precision:number;recall:number;f1:number;topK:number;topKRecall:number;matched:string[];missed:string[];unexpected:string[]
};

type ApiErrorBody = {message?:string;error?:string;code?:string};

async function parseResponse<T>(response:Response):Promise<T>{
  if(response.ok){
    const text=await response.text();
    if(!text) throw new Error('서버가 빈 응답을 반환했습니다.');
    try{return JSON.parse(text) as T}catch{throw new Error('서버 응답 JSON 형식이 올바르지 않습니다.');}
  }
  let body:ApiErrorBody={};
  try{body=await response.json()}catch{/* non-json error */}
  throw new Error(body.message||body.error||`요청 실패 (HTTP ${response.status})`);
}

async function request<T>(url:string,init:RequestInit={},timeoutMs=30_000):Promise<T>{
  const controller=new AbortController();
  const timer=window.setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(url,{...init,signal:controller.signal});
    return await parseResponse<T>(response);
  }catch(error){
    if(error instanceof DOMException&&error.name==='AbortError') throw new Error('요청 시간이 초과되었습니다. Backend 상태와 네트워크를 확인해주세요.');
    throw error;
  }finally{
    window.clearTimeout(timer);
  }
}

export async function health():Promise<Health>{
  return request<Health>(`${API}/api/health`,{},5_000);
}

export async function uploadZip(file:File):Promise<Summary>{
  if(!file.name.toLowerCase().endsWith('.zip')) throw new Error('Spring 프로젝트 ZIP 파일을 선택해주세요.');
  if(file.size<=0) throw new Error('빈 ZIP 파일은 업로드할 수 없습니다.');
  if(file.size>50*1024*1024) throw new Error('업로드 파일은 50MB 이하여야 합니다.');
  const form=new FormData();
  form.append('file',file); form.append('name',file.name.replace(/\.zip$/i,''));
  return request<Summary>(`${API}/api/analysis/upload`,{method:'POST',body:form},90_000);
}

export async function impact(projectId:string,nodeId:string,scope:AnalysisScope,maxDepth?:number):Promise<Impact>{
  return request<Impact>(`${API}/api/analysis/${encodeURIComponent(projectId)}/impact`,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nodeId,scope,maxDepth})
  });
}

export async function impactComparison(projectId:string,nodeId:string):Promise<ImpactComparison>{
  return request<ImpactComparison>(`${API}/api/analysis/${encodeURIComponent(projectId)}/impact-comparison`,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nodeId})
  });
}

export async function githubPrImpact(
  projectId:string,
  owner:string,
  repo:string,
  pullNumber:number,
  scope:AnalysisScope,
  maxDepth:number,
  token?:string
):Promise<Impact[]>{
  if(!owner.trim()||!repo.trim()) throw new Error('GitHub owner와 repository를 입력해주세요.');
  if(!Number.isInteger(pullNumber)||pullNumber<=0) throw new Error('PR 번호는 1 이상의 정수여야 합니다.');
  const headers:Record<string,string>={'Content-Type':'application/json'};
  if(token?.trim()) headers['X-GitHub-Token']=token.trim();
  return request<Impact[]>(`${API}/api/analysis/${encodeURIComponent(projectId)}/github-pr-impact`,{
    method:'POST',headers,body:JSON.stringify({owner:owner.trim(),repo:repo.trim(),pullNumber,scope,maxDepth})
  },45_000);
}

export async function githubCommitImpact(
  projectId:string,owner:string,repo:string,sha:string,scope:AnalysisScope,maxDepth:number,token?:string
):Promise<Impact[]>{
  if(!owner.trim()||!repo.trim()) throw new Error('GitHub owner와 repository를 입력해주세요.');
  if(!/^[a-fA-F0-9]{7,64}$/.test(sha.trim())) throw new Error('Commit SHA 형식이 올바르지 않습니다.');
  const headers:Record<string,string>={'Content-Type':'application/json'};
  if(token?.trim()) headers['X-GitHub-Token']=token.trim();
  return request<Impact[]>(`${API}/api/analysis/${encodeURIComponent(projectId)}/github-commit-impact`,{
    method:'POST',headers,body:JSON.stringify({owner:owner.trim(),repo:repo.trim(),sha:sha.trim(),scope,maxDepth})
  },45_000);
}

export async function evaluateGroundTruth(
  projectId:string,nodeId:string,scope:AnalysisScope,maxDepth:number,expectedTargets:string[],topK=5
):Promise<Evaluation>{
  return request<Evaluation>(`${API}/api/analysis/${encodeURIComponent(projectId)}/evaluate`,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nodeId,scope,maxDepth,expectedTargets,topK})
  });
}
