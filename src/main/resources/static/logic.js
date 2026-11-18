"use strict";
const BoardLogic = (() => {
 const definitions=[["서류",/서류|증빙/,"서류 확인"],["연락",/연락|전화|콜백/,"재연락"],["검토",/검토/,"상담 검토"]];
 function clauses(note){
   return note.split(/[.;。\n]+|(?:하고|한 뒤)\s*/).map(s=>s.trim()).filter(Boolean).map(source=>{
     const neg=/하지\s*않|하지\s*말|불필요|취소|필요\s*없|하지\s*마/.test(source);
     const signals=definitions.filter(([,pattern])=>pattern.test(source)).map(([tag])=>tag);
     if(neg)signals.push("부정");
     if(/면|경우/.test(source))signals.push("조건");
     const dates=[...new Set(source.match(/\b\d{4}-\d{2}-\d{2}\b/g)||[])];
     const valid=dates.length===1&&!isNaN(Date.parse(dates[0]))&&new Date(dates[0]).toISOString().slice(0,10)===dates[0];
     return {source,signals,date:valid?dates[0]:"",kinds:neg?[]:definitions.filter(([tag])=>signals.includes(tag)).map(d=>d[2])};
   });
 }
 function stats(tasks){
   return {total:tasks.length,done:tasks.filter(t=>t.done).length,received:tasks.filter(t=>t.received).length,
    sent:tasks.filter(t=>t.sent).length,pending:tasks.filter(t=>!t.received).length,
    unacked:tasks.filter(t=>t.received&&!t.sent).length};
 }
 function sandbox(advisor,storage=localStorage){
   const key="advisor-followup-v1/"+advisor;
   const read=()=>JSON.parse(storage.getItem(key)||'{"tasks":[],"events":[],"paused":false}');
   function edit(fn){const board=read();const result=fn(board);storage.setItem(key,JSON.stringify(board));return result;}
   function log(b,t,actor,action){b.events.unshift({case_ref:t.case_ref,actor,action,at:new Date().toISOString()});}
   return {read,save(input){return edit(b=>{
     const prior=b.tasks.find(t=>t.key===input.key);
     if(prior){if(prior.case_ref!==input.caseRef||prior.kind!==input.kind||prior.due_date!==input.dueDate)throw Error("같은 요청의 내용이 달라졌습니다.");return prior.id;}
     const t={id:crypto.randomUUID(),key:input.key,case_ref:input.caseRef,kind:input.kind,due_date:input.dueDate,done:false,sent:false,received:false,fence:0};
     b.tasks.push(t);log(b,t,advisor,"업무 확정 · 알림 접수");return t.id;});},
     pause(value){edit(b=>{b.paused=value;});},done(id){edit(b=>{let t=b.tasks.find(t=>t.id===id);if(!t)throw Error("업무를 찾을 수 없습니다.");t.done=true;});},
     step(crash=false){edit(b=>{if(b.paused)return; const t=b.tasks.find(t=>!t.sent&&(!crash||!t.received));if(!t)return;
       const worker=t.fence%2===0?"worker-a":"worker-b";t.fence++;t.owner=worker;log(b,t,worker,"알림 인수 #"+t.fence);
       log(b,t,worker,t.received?"기존 수신 확인 · 중복 생략":"수신함 반영");t.received=true;
       if(crash){log(b,t,worker,"ACK 전 중단 · 데모");return;}t.sent=true;log(b,t,worker,"발송 완료 확인");});}
   };
 }
 function byKind(tasks){
   return definitions.map(([, ,kind])=>{
     const matching=tasks.filter(task=>task.kind===kind);
     return {kind,total:matching.length,done:matching.filter(task=>task.done).length};
   });
 }
 return {clauses,stats,sandbox,byKind};
})();
if(typeof module!=="undefined")module.exports=BoardLogic;
