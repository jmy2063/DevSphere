import type {ReportData} from './report';
import {parseSavedReport} from './snapshots';

export type ReviewSlots=Record<'before'|'after',{name:string;data:ReportData}|null>;
export const EMPTY_REVIEW_SLOTS:ReviewSlots={before:null,after:null};
const DATABASE='devsphere-review-workspace',STORE='workspace',KEY='current';
export class WorkspaceConflict extends Error {
  constructor(){super('다른 탭에서 브라우저 보관본이 바뀌었습니다. 현재 검토를 JSON으로 저장한 뒤 새로고침하세요.');}
}
function openDatabase():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    let settled=false;
    const request=indexedDB.open(DATABASE,1);
    const timer=setTimeout(()=>{settled=true;reject(new Error('브라우저 보관소 응답 시간이 초과되었습니다.'));},5000);
    function fail(error:unknown){settled=true;clearTimeout(timer);reject(error);}
    request.onupgradeneeded=()=>request.result.createObjectStore(STORE);
    request.onsuccess=()=>{
      clearTimeout(timer);const db=request.result;
      if(settled){db.close();return;}
      settled=true;db.onversionchange=()=>db.close();resolve(db);
    };
    request.onerror=()=>fail(request.error);
    request.onblocked=()=>fail(new Error('브라우저 보관소를 열 수 없습니다. 다른 탭을 닫고 다시 시도하세요.'));
  });
}
function normalizeSlots(value:unknown):ReviewSlots{
  if(!value||typeof value!=='object')throw new Error('브라우저 보관본 형식이 올바르지 않습니다.');
  const slots=value as Record<string,unknown>;
  return Object.fromEntries((['before','after'] as const).map(side=>{
    const record=slots[side];if(record===null)return [side,null];
    if(!record||typeof record!=='object')throw new Error('브라우저 보관본 슬롯이 올바르지 않습니다.');
    const {name,data}=record as {name:unknown;data:ReportData};
    if(typeof name!=='string'||name.length>1000)throw new Error('브라우저 보관본 이름이 올바르지 않습니다.');
    return [side,{name,data:parseSavedReport(JSON.stringify(data))}];
  })) as ReviewSlots;
}
export async function readReviewWorkspace():Promise<{slots:ReviewSlots;revision:string}|null>{
  const db=await openDatabase();
  try{
    const value=await new Promise<unknown>((resolve,reject)=>{
      const tx=db.transaction(STORE,'readonly'),request=tx.objectStore(STORE).get(KEY);
      tx.oncomplete=()=>resolve(request.result);tx.onabort=()=>reject(tx.error);
    });
    if(value===undefined)return null;
    const row=value as {version?:unknown;revision?:unknown;slots?:unknown};
    if(!row||row.version!==1||typeof row.revision!=='string'||!row.revision||row.revision.length>100)throw new Error('지원하지 않거나 손상된 브라우저 보관본입니다.');
    return {slots:normalizeSlots(row.slots),revision:row.revision};
  }finally{db.close();}
}
export async function writeReviewWorkspace(slots:ReviewSlots,expectedRevision:string|null):Promise<string>{
  // Persist only the same whitelisted schema accepted by file import.
  const normalized=normalizeSlots(slots),revision=crypto.randomUUID(),db=await openDatabase();
  try{
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE),request=store.get(KEY);
      let conflict=false;
      request.onsuccess=()=>{
        const previous=request.result;
        if((previous?.revision??null)!==expectedRevision){conflict=true;tx.abort();return;}
        store.put({version:1,revision,slots:normalized},KEY);
      };
      tx.oncomplete=()=>resolve();tx.onabort=()=>reject(conflict?new WorkspaceConflict():tx.error);
    });return revision;
  }finally{db.close();}
}
export async function clearReviewWorkspace():Promise<void>{
  const db=await openDatabase();
  try{
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(KEY);
      tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);
    });
  }finally{db.close();}
}
