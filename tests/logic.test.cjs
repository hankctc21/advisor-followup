const { test } = require("node:test");
const assert = require("node:assert/strict");
const { clauses, stats, sandbox, byKind } = require("../src/main/resources/static/logic.js");
const sample = { key: "one", caseRef: "CASE-101", kind: "서류 확인", dueDate: "2026-11-23" };
function storage(){
  const items = new Map();
  return {getItem: key => items.get(key), setItem: (key,value) => items.set(key,value)};
}
test("consultation commitments stay linked to the original clause", () => {
  const result = clauses("2026-11-23까지 서류 확인. 2026-11-24에 전화. 추가 연락은 필요 없음.");
  assert.deepEqual(result.map(x => x.kinds), [["서류 확인"],["재연락"],[]]);
  assert.deepEqual(result.slice(0,2).map(x=>x.date),["2026-11-23","2026-11-24"]);
});
test("missing, impossible and ambiguous dates require manual confirmation", () => {
  for (const text of ["다음주에 전화","2026-02-30 전화","2026-11-21 또는 2026-11-22 전화"])
    assert.equal(clauses(text)[0].date,"");
});
test("repeated confirmation returns same id, changed content is rejected", () => {
  const board = sandbox("a",storage());
  const id = board.save(sample);
  assert.equal(board.save(sample),id);
  assert.throws(()=>board.save({...sample,kind:"재연락"}));
  assert.equal(board.read().tasks.length,1);
});
test("receipt survives takeover and does not count twice", () => {
  const board = sandbox("a",storage());
  const id = board.save(sample);
  board.step(true);
  assert.deepEqual(stats(board.read().tasks),{total:1,done:0,received:1,sent:0,pending:0,unacked:1});
  board.step();
  board.done(id);
  const {tasks,events} = board.read();
  assert.equal(tasks[0].owner,"worker-b");
  assert.equal(events.filter(e=>e.action==="수신함 반영").length,1);
  assert.equal(events.filter(e=>e.action.includes("중복 생략")).length,1);
  assert.deepEqual(stats(tasks),{total:1,done:1,received:1,sent:1,pending:0,unacked:0});
  assert.deepEqual(byKind(tasks)[0],{kind:"서류 확인",total:1,done:1});
});
test("paused deliveries remain pending until resumed", () => {
  const board = sandbox("a",storage());
  board.save(sample); board.pause(true); board.step();
  assert.equal(stats(board.read().tasks).pending,1);
  board.pause(false); board.step();
  assert.equal(stats(board.read().tasks).sent,1);
});
test("demo accounts have independent lists, events and controls", () => {
  const data=storage(), a=sandbox("a",data), b=sandbox("b",data);
  const id=a.save(sample); a.pause(true);
  assert.throws(()=>b.done(id));
  assert.deepEqual(b.read(),{tasks:[],events:[],paused:false});
});
