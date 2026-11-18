"use strict";
const h=React.createElement, {useState,useEffect,useRef}=React;
const demo=location.protocol==="file:"||new URLSearchParams(location.search).has("demo");
const sample="2026-11-23까지 서류 수신 확인. 2026-11-24에 다시 전화. 추가 연락은 필요 없음.";
const button=(text,fn,cls="",disabled=false)=>h("button",{type:"button",onClick:fn,className:cls,disabled},text);
function App(){
 const [who,setWho]=useState("advisor-a"),[csrf,setCsrf]=useState(""),[board,setBoard]=useState({tasks:[],events:[],paused:false});
 const [note,setNote]=useState(sample),[ref,setRef]=useState("CASE-101"),[drafts,setDrafts]=useState([]),[tab,setTab]=useState("업무 보드"),[msg,setMsg]=useState(""),[busy,setBusy]=useState(false);
 const generation=useRef(0),guard=useRef(false),sim=()=>BoardLogic.sandbox(who);
 async function api(path,method="GET",body){const r=await fetch("api/"+path,{method,headers:{"Content-Type":"application/json","X-XSRF-TOKEN":csrf},body:body===undefined?undefined:JSON.stringify(body)});if(!r.ok)throw Error("요청 실패 ("+r.status+")");return r.status===204||r.headers.get("content-length")==="0"?null:await r.text().then(t=>t?JSON.parse(t):null);}
 async function refresh(){const g=generation.current;const next=demo?sim().read():await api("board");if(g===generation.current)setBoard(next);}
 useEffect(()=>{if(!demo)api("session").then(x=>{setWho(x.advisor);setCsrf(x.csrf)}).catch(e=>setMsg(e.message));},[]);
 useEffect(()=>{refresh().catch(e=>setMsg(e.message));if(demo)return;const timer=setInterval(()=>refresh().catch(e=>setMsg(e.message)),2000);return ()=>clearInterval(timer);},[who]);
 async function run(fn){if(guard.current)return;guard.current=true;setBusy(true);setMsg("");try{await fn();await refresh()}catch(e){setMsg(e.message)}finally{guard.current=false;setBusy(false)}}
 async function generate(){if(!/^CASE-[0-9]{3,8}$/.test(ref))throw Error("상담 번호는 CASE-101 형식으로 입력하세요.");let items=[];
 for(const part of BoardLogic.clauses(note)){if(!part.kinds.length)continue;const res=demo?{kinds:part.kinds,mode:"규칙 초안"}:await api("suggest","POST",{signals:part.signals});for(const kind of res.kinds)items.push({key:crypto.randomUUID(),caseRef:ref,kind,dueDate:part.date,source:part.source,mode:res.mode});}
 setDrafts(items);setMsg(items.length?"약속 내용과 기한을 확인한 뒤 업무를 확정하세요.":"확인된 약속이 없습니다.");}
 async function save(d){if(!d.dueDate)throw Error("기한을 확인해 주세요.");if(demo)sim().save(d);else await api("tasks","POST",{caseRef:d.caseRef,kind:d.kind,dueDate:d.dueDate,key:d.key});setDrafts(ds=>ds.filter(x=>x.key!==d.key));setMsg("업무를 저장하고 알림을 접수했습니다.");}
 const m=BoardLogic.stats(board.tasks),kpi=(label,value)=>h("div",{className:"tile",key:label},h("small",null,label),h("strong",null,value));
 function switchUser(e){generation.current++;setWho(e.target.value);setBoard({tasks:[],events:[],paused:false});setDrafts([]);setNote(sample);setMsg("");}
 const flip=()=>run(async()=>{if(demo)sim().pause(!board.paused);else await api("delivery","POST",{paused:!board.paused})});
 return h(React.Fragment,null,h("header",null,h("strong",null,"상담 후속 업무"),h("div",{className:"row"},h("span",{className:"pill"},demo?"브라우저 시연":"서버 연결"),demo?h("select",{value:who,onChange:switchUser,disabled:busy,"aria-label":"시연 계정"},["advisor-a","advisor-b"].map(x=>h("option",{key:x},x))):who)),
 h("main",null,h("div",{className:"bar"},h("h1",null,tab),h("div",{className:"row"},...["업무 보드","전달 통계"].map(t=>button(t,()=>setTab(t),t===tab?"active":"")))),
 h("div",{className:"stats"},kpi("접수한 업무",m.total),kpi("완료한 업무",m.done),kpi("수신함 반영",m.received),kpi("완료 확인 대기",m.unacked)),
 msg&&h("p",{className:"notice",role:"status"},msg),
 tab==="업무 보드"?h("div",{className:"grid"},h("section",{className:"card"},h("h2",null,"상담 메모"),h("label",null,"상담 번호",h("input",{value:ref,maxLength:13,onChange:e=>{setRef(e.target.value);setDrafts([])}})),h("textarea",{"aria-label":"상담 메모",maxLength:1600,value:note,onChange:e=>{setNote(e.target.value);setDrafts([])}}),button("후속 업무 초안 만들기",()=>run(generate),"primary",busy),h("p",{className:"hint"},"원문은 이 화면에서만 사용합니다. 날짜가 불분명하면 직접 지정하세요."),
 drafts.map(d=>h("article",{className:"draft",key:d.key},h("small",null,d.mode+" · "+d.caseRef),h("div",null,h("strong",null,d.kind)),h("blockquote",null,d.source),h("input",{type:"date","aria-label":"업무 기한",value:d.dueDate,onChange:e=>setDrafts(ds=>ds.map(x=>x.key===d.key?{...x,dueDate:e.target.value}:x))}),button("업무 확정",()=>run(()=>save(d)),"",busy||!d.dueDate)))),
 h("section",{className:"card"},h("h2",null,"내 후속 업무"),!m.total&&h("p",{className:"muted"},"확정한 업무가 여기에 표시됩니다."),[...board.tasks].sort((a,b)=>Number(a.done)-Number(b.done)||a.due_date.localeCompare(b.due_date)).map(t=>h("div",{className:"task",key:t.id},h("small",null,t.case_ref+" · "+t.due_date),h("div",{className:"row"},h("strong",null,t.kind),h("span",{className:"pill"+(t.sent?"":" amber")},t.sent?"알림 전달 완료":t.received?"수신 완료 · ACK 대기":"알림 대기")),t.done?h("small",null,"업무 완료"):button("완료 처리",()=>run(async()=>{if(demo)sim().done(t.id);else await api("tasks/"+t.id+"/done","POST")}),"",busy))))) :
 h("div",null,h("section",{className:"card"},h("h2",null,"저장과 전달 대조"),h("p",null,"접수 "+m.total+"건 = 전달 대기 "+m.pending+"건 + 수신함 반영 "+m.received+"건"),h("p",null,"수신함 반영 "+m.received+"건 = 완료 확인 "+m.sent+"건 + ACK 대기 "+m.unacked+"건"),h("p",{className:"hint"},"업무 완료율 "+(m.total?Math.round(100*m.done/m.total)+"%":"—")+" · 현재 설계사의 전체 업무 기준")),
 h("section",{className:"card"},h("h2",null,"알림 전달 제어"),h("div",{className:"row"},button(board.paused?"전달 재개":"전달 일시 중지",flip,"",busy),demo&&button("수신 직후 워커 중단",()=>run(()=>sim().step(true)),"",busy||board.paused||!m.pending),demo&&button("다음 워커 처리",()=>run(()=>sim().step(false)),"primary",busy||board.paused||m.sent===m.total)),demo&&h("p",{className:"hint"},"브라우저 시연은 인수 대기를 생략합니다. 서버에서는 PostgreSQL 임대 만료 후 인수합니다.")),
 h("section",{className:"card"},h("h2",null,"업무 유형별 진행률"),BoardLogic.byKind(board.tasks).map(x=>h("div",{className:"progress",key:x.kind},h("strong",null,x.kind),h("progress",{value:x.done,max:x.total||1,"aria-label":x.kind+" 완료율"}),h("span",null,x.done+" / "+x.total+"건 완료")))),
 h("section",{className:"card"},h("h2",null,"전달 이력"),board.events.slice(0,30).map((e,i)=>h("div",{className:"evt",key:i},h("small",null,e.case_ref),h("small",null,e.actor),h("span",null,e.action)))))));
}
ReactDOM.createRoot(document.getElementById("root")).render(h(App));
