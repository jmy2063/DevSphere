import {useEffect,useRef,useState} from 'react';
import {clearReviewWorkspace,EMPTY_REVIEW_SLOTS,readReviewWorkspace,writeReviewWorkspace,WorkspaceConflict,type ReviewSlots} from './review-workspace';

export function useReviewWorkspace(){
  const [saved,setSaved]=useState<ReviewSlots>(EMPTY_REVIEW_SLOTS);
  const [ready,setReady]=useState(false),[enabled,setEnabled]=useState(false),[busy,setBusy]=useState(false);
  const [message,setMessage]=useState(''),[error,setError]=useState(''),[blocked,setBlocked]=useState(false),[attempt,setAttempt]=useState(0);
  const revision=useRef<string|null>(null),allowed=useRef(false),queue=useRef(Promise.resolve());
  const persisted=useRef<ReviewSlots|null>(null);
  useEffect(()=>{
    let active=true;
    void readReviewWorkspace().then(record=>{
      if(!active)return;
      if(record){revision.current=record.revision;persisted.current=record.slots;allowed.current=true;setSaved(record.slots);setEnabled(true);setMessage('브라우저 보관본을 복구했습니다. 저장된 검토를 이어갈 수 있습니다.');}
    }).catch(()=>{if(active){setBlocked(true);setError('브라우저 보관본을 읽을 수 없습니다. JSON 불러오기는 계속 사용할 수 있습니다. 손상된 보관본은 지우기로 해제하세요.');}})
      .finally(()=>{if(active)setReady(true);});
    return ()=>{active=false;};
  },[]);
  useEffect(()=>{
    if(!ready||!enabled||blocked)return;
    if(saved===persisted.current)return;
    let active=true;
    setBusy(true);setError('');setMessage('브라우저에 보관 중… 완료 표시를 확인한 뒤 새로고침하세요.');
    const timer=setTimeout(()=>{
      queue.current=queue.current.then(async()=>{
        if(!allowed.current)return;
        try{
          revision.current=await writeReviewWorkspace(saved,revision.current);
          persisted.current=saved;
          if(active)setMessage('이 브라우저에 보관 완료 · 새로고침 후 저장된 검토를 이어갈 수 있습니다.');
        }catch(e){
          if(e instanceof WorkspaceConflict){allowed.current=false;setBlocked(true);setError(e.message);setMessage('');setBusy(false);}
          else if(active){setError('브라우저 보관에 실패했습니다. JSON으로 저장하거나 다시 보관을 눌러주세요.');setMessage('');}
        }finally{if(active)setBusy(false);}
      });
    },300);
    return ()=>{active=false;clearTimeout(timer);};
  },[ready,enabled,saved,attempt,blocked]);
  function enable(){allowed.current=true;persisted.current=null;setEnabled(true);setAttempt(n=>n+1);}
  async function clear(){
    allowed.current=false;setEnabled(false);setBusy(true);setMessage('브라우저 보관본을 지우는 중…');setError('');
    queue.current=queue.current.then(async()=>{
      try{await clearReviewWorkspace();revision.current=null;persisted.current=null;setBlocked(false);setMessage('브라우저 보관본을 지웠습니다. 현재 화면의 검토는 유지됩니다.');}
      catch{setError('브라우저 보관본을 지우지 못했습니다. 지우기를 다시 눌러주세요.');setMessage('');setBlocked(true);}
      finally{setBusy(false);}
    });await queue.current;
  }
  return {saved,setSaved,ready,enabled,busy,message,error,blocked,enable,clear,retry:()=>setAttempt(n=>n+1)};
}
