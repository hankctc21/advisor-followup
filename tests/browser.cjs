// Run with Node, playwright and an installed Chrome browser.
const {chromium} = require("playwright");
const {resolve} = require("node:path");
const {pathToFileURL} = require("node:url");
const {mkdirSync} = require("node:fs");
const assert = require("node:assert/strict");
(async()=>{
  const browser=await chromium.launch({channel:"chrome",headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1210,height:920},deviceScaleFactor:1});
    const errors=[];
    page.on("pageerror",e=>errors.push(e.message));
    const target=resolve(__dirname,"../docs/screens");
    mkdirSync(target,{recursive:true});
    const shot=name=>page.screenshot({path:resolve(target,name+".png"),fullPage:true});
    const click=name=>page.getByRole("button",{name,exact:true}).first().click();
    await page.goto(pathToFileURL(resolve(__dirname,"../src/main/resources/static/index.html")).href);
    await click("후속 업무 초안 만들기");
    assert.equal(await page.getByRole("button",{name:"업무 확정"}).count(),2);
    await click("업무 확정");
    await shot("01-confirm");
    await click("업무 확정"); await click("완료 처리"); await click("전달 통계");
    await click("전달 일시 중지");
    assert.equal(await page.getByRole("button",{name:"다음 워커 처리"}).isDisabled(),true);
    await click("전달 재개"); await click("수신 직후 워커 중단");
    await page.getByText("수신함 반영 1건 = 완료 확인 0건 + ACK 대기 1건").waitFor();
    await shot("02-interrupted");
    await click("다음 워커 처리"); await click("다음 워커 처리");
    await page.getByText("수신함 반영 2건 = 완료 확인 2건 + ACK 대기 0건").waitFor();
    await page.getByText("기존 수신 확인 · 중복 생략").waitFor();
    await shot("03-recovered");
    await page.getByLabel("시연 계정").selectOption("advisor-b");
    await page.getByText("접수 0건 = 전달 대기 0건 + 수신함 반영 0건").waitFor();
    await page.reload();
    await page.getByText("알림 전달 완료").first().waitFor();
    assert.deepEqual(errors,[]);
    console.log("PASS: 2 drafts, manual confirmation, pause/resume, crash, takeover, reconciliation, account switch, reload");
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
