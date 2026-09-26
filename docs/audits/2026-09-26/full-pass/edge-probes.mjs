import {chromium,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const out=new URL('./evidence/',import.meta.url).pathname;
const browser=await chromium.launch({headless:true});
const rows=[];
const context=await browser.newContext({baseURL:'http://127.0.0.1:3120',viewport:{width:390,height:844},serviceWorkers:'block'});
const page=await context.newPage();
page.setDefaultTimeout(10000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));
async function capture(name){await page.screenshot({path:`${out}/${name}.png`,fullPage:true});writeFileSync(`${out}/${name}.txt`,await page.locator('body').innerText());}
async function axe(){await page.addScriptTag({path:require.resolve('axe-core')});return page.evaluate(async()=>{const r=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}});return r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}));});}
try{
 await page.goto('/create');await page.locator('#create-name').fill('Casey');await page.locator('#create-game-name').fill('Audit controlled table');await page.locator('#create-buy-in').fill('20');await page.getByRole('button',{name:'Create game',exact:true}).click();await expect(page).toHaveURL(/\/game\//);await expect(page.getByRole('heading',{name:'Audit controlled table'})).toBeVisible();
 const gameUrl=page.url();await capture('local-host-mobile');rows.push({probe:'local host accessibility',violations:await axe()});
 await page.getByRole('button',{name:'Invite players'}).click();await capture('local-invite-misleading');rows.push({probe:'local invite copy',text:await page.getByRole('dialog').innerText()});await page.keyboard.press('Escape');
 await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='ante_local_store')throw new DOMException('Audit quota simulation','QuotaExceededError');return original.call(this,key,value);};});
 rows.push({probe:'local storage keys',keys:await page.evaluate(()=>Object.keys(localStorage))});
 // Patch the actual ledger key, leaving identity and recovery keys usable.
 await page.evaluate(()=>{const key=Object.keys(localStorage).find(k=>{try{return Array.isArray(JSON.parse(localStorage.getItem(k)).games);}catch{return false;}});const previous=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===key)throw new DOMException('Audit quota simulation','QuotaExceededError');return previous.call(this,k,v);};});
 await page.getByRole('button',{name:'Add a rebuy',exact:true}).click();rows.push({probe:'rebuy editor',text:await page.locator('body').innerText()});
 const amount=page.getByLabel('Rebuy amount',{exact:true});await amount.fill('7');
 const confirm=page.getByRole('button',{name:/Confirm.*rebuy|Add rebuy|Record rebuy/i}).last();await confirm.click();await page.waitForTimeout(500);await capture('quota-write-before-reload');const before=await page.locator('body').innerText();await page.reload();await expect(page.getByRole('heading',{name:'Audit controlled table'})).toBeVisible();await capture('quota-write-after-reload');rows.push({probe:'quota ledger write',before,after:await page.locator('body').innerText()});
 await page.evaluate(()=>localStorage.setItem('ante_session_id',crypto.randomUUID()));await page.setViewportSize({width:320,height:300});await page.goto(gameUrl);await expect(page.getByRole('dialog')).toBeVisible();await capture('join-short-viewport');rows.push({probe:'join short viewport',geometry:await page.getByRole('dialog').evaluate(e=>({top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom,viewport:innerHeight,documentHeight:document.documentElement.scrollHeight,text:e.innerText})),violations:await axe()});
 await page.keyboard.press('Escape');rows.push({probe:'join escape',stillOpen:await page.getByRole('dialog').count(),navigation:await page.getByRole('dialog').getByRole('link').count()});
 await page.setViewportSize({width:568,height:320});await capture('join-landscape-viewport');rows.push({probe:'join landscape viewport',geometry:await page.getByRole('dialog').evaluate(e=>({top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom,viewport:innerHeight,documentHeight:document.documentElement.scrollHeight}))});
 const live=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});const p=await live.newPage();await p.goto('https://mainpot.app/poker-settlement-calculator');await p.getByRole('button',{name:'Clear example'}).click();await p.getByLabel('Money in for player 1',{exact:true}).fill('20');await p.getByLabel('Final stack for player 1',{exact:true}).fill('40');await p.getByLabel('Money in for player 2',{exact:true}).fill('20');await p.screenshot({path:out+'production-blank-stack.png',fullPage:true});rows.push({probe:'live missing stack',result:await p.locator('#calculator-results').innerText()});await live.close();
}catch(e){rows.push({harnessError:e.message});console.error(e);process.exitCode=1;}
finally{writeFileSync(`${out}/edge-probes.json`,JSON.stringify({rows,errors},null,2));await browser.close();}
