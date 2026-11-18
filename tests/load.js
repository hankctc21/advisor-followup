import http from 'k6/http';
import encoding from 'k6/encoding';
import { check, fail } from 'k6';
import exec from 'k6/execution';

export const options = {
  scenarios: { confirm: { executor: 'constant-arrival-rate', rate: Number(__ENV.RATE || 5),
    timeUnit: '1s', duration: __ENV.DURATION || '1m', preAllocatedVUs: 4, maxVUs: 30 } },
  thresholds: { checks: ['rate==1'], dropped_iterations: ['count==0'], http_req_failed: ['rate==0'] }
};
const base = 'http://127.0.0.1:8080/api/';
let token;
function requestHeaders() {
  if (!__ENV.ADVISOR_PASSWORD) fail('ADVISOR_PASSWORD is required');
  const headers={ Authorization: 'Basic '+encoding.b64encode('advisor-a:'+__ENV.ADVISOR_PASSWORD) };
  // k6 resets its cookie jar between iterations, so acquire the matching cookie and token together.
  const session=http.get(base+'session',{headers});
  if(session.status!==200) fail('Session request failed');
  token=session.json('csrf');
  return {...headers,'Content-Type':'application/json','X-XSRF-TOKEN':token};
}
export default function(){
  const headers=requestHeaders();
  const random=Array.from({length:32},()=>Math.floor(Math.random()*16).toString(16)).join('');
  const key=random.slice(0,8)+'-'+random.slice(8,12)+'-4'+random.slice(13,16)+'-a'+random.slice(17,20)+'-'+random.slice(20);
  const body=JSON.stringify({key,caseRef:'CASE-'+String(100+exec.scenario.iterationInTest%900),kind:'재연락',dueDate:'2027-01-10'});
  const first=http.post(base+'tasks',body,{headers});
  const retry=http.post(base+'tasks',body,{headers});
  check(first,{'created and retry returned same id':r=>r.status===200 && retry.status===200 && !!r.json('id') && r.json('id')===retry.json('id')});
}
