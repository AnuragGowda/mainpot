import { chromium, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const require=createRequire(import.meta.url);
const out=resolve('docs/audits/2026-09-08/evidence');
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({baseURL:'http://127.0.0.1:3100',viewport:{width:393,height:852},serviceWorkers:'block', reducedMotion:'reduce'});
const page=await context.newPage();
const results=[];
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
async function capture(name,full=true){
  await page.waitForTimeout(name.startsWith('game-') || name.startsWith('settlement-') || name.startsWith('payment-') ? 3200 : 100);
  await page.screenshot({path:`${out}/${name}.png`,fullPage:full});
  await page.addScriptTag({path:require.resolve('axe-core')});
  const axe=await page.evaluate(async()=>await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}}));
  const metrics=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,height:innerHeight,scrollHeight:document.documentElement.scrollHeight,headings:[...document.querySelectorAll('h1,h2,h3')].map(x=>({level:x.tagName,text:x.textContent})),smallTargets:[...document.querySelectorAll('button,a,input,summary')].filter(x=>x.getClientRects().length).map(x=>({text:x.getAttribute('aria-label')||x.textContent?.trim().slice(0,90),...Object.fromEntries(['width','height'].map(k=>[k,x.getBoundingClientRect()[k]]))})).filter(x=>x.width<24||x.height<24)}));
  const row={name,url:page.url(),title:await page.title(),...metrics,violations:axe.violations.map(v=>({id:v.id,impact:v.impact,help:v.help,helpUrl:v.helpUrl,nodes:v.nodes.map(n=>({target:n.target,html:n.html,summary:n.failureSummary}))})),incomplete:axe.incomplete.map(v=>({id:v.id,count:v.nodes.length}))};
  results.push(row);writeFileSync(`${out}/browser-review.json`,JSON.stringify({results,errors},null,2));
  writeFileSync(`${out}/${name}.txt`,await page.locator('body').innerText());
  console.log(name,JSON.stringify({overflow:metrics.scrollWidth-metrics.width,violations:row.violations.map(v=>`${v.id}:${v.nodes.length}`)}));
}
try {
 for(const [name,path] of [['landing','/'],['create','/create'],['join','/join'],['calculator','/poker-settlement-calculator'],['signin-local','/signin'],['feedback','/feedback'],['self-host','/self-host'],['privacy','/privacy'],['terms','/terms'],['not-found','/missing-audit-page'],['missing-game','/game/ABC234']]){
  for(const [size,viewport] of [['mobile',{width:393,height:852}],['desktop',{width:1440,height:900}]]){
   await page.setViewportSize(viewport);await page.goto(path);await page.waitForTimeout(350);await capture(`${name}-${size}`);
  }
 }
 await page.setViewportSize({width:320,height:568});await page.goto('/create');await page.getByRole('button',{name:'Create game',exact:true}).click();await capture('create-errors-320');
 await page.getByRole('textbox',{name:'Your name',exact:true}).fill('Casey');await page.getByRole('textbox',{name:'Game name',exact:true}).fill('Friday night UX review');await page.getByRole('textbox',{name:'Buy-in amount',exact:true}).fill('20');await page.getByRole('button',{name:'Create game',exact:true}).click();await expect(page.getByRole('heading',{name:'Friday night UX review',exact:true})).toBeVisible();
 await page.setViewportSize({width:393,height:852});await capture('game-host-initial-mobile');await page.getByRole('button',{name:'Invite players',exact:true}).click();await capture('invite-mobile',false);await page.keyboard.press('Escape');
 for(const name of ['Jordan','Taylor']){await page.getByRole('button',{name:'Add player',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Add a player'});await dialog.getByRole('textbox',{name:'Player name'}).fill(name);await dialog.getByRole('button',{name:'Add player',exact:true}).click();await expect(dialog).toHaveCount(0);}
 await capture('game-host-three-mobile');await page.setViewportSize({width:1440,height:900});await capture('game-host-three-desktop');await page.setViewportSize({width:393,height:852});
 await page.getByRole('button',{name:'Add a rebuy',exact:true}).click();await capture('rebuy-mobile',false);await page.getByRole('button',{name:'Cancel rebuy'}).click();
 await page.getByRole('button',{name:'End game',exact:true}).click();await capture('end-confirm-mobile',false);await page.getByRole('button',{name:'Start cash-outs'}).click();await capture('cashouts-empty-mobile');
 for(const [name,value] of [['Casey','0'],['Jordan','30'],['Taylor','20']]){const el=page.getByRole('spinbutton',{name:`Cash-out amount for ${name}`});await el.fill(value);await el.blur();}
 await capture('cashouts-discrepancy-mobile');
 const t=page.getByRole('spinbutton',{name:'Cash-out amount for Taylor'});await t.fill('30');await t.blur();await expect(page.getByText('Bank reconciled',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Review settlement'}).click();await capture('settlement-review-mobile');
 await page.setViewportSize({width:1440,height:900});await capture('settlement-review-desktop');await page.setViewportSize({width:393,height:852});
 await page.getByRole('button',{name:'Lock settlement',exact:true}).click();await capture('lock-confirm-mobile',false);await page.getByRole('alertdialog').getByRole('button',{name:'Lock settlement',exact:true}).click();await expect(page.getByText('Ended',{exact:true})).toBeVisible();await capture('settlement-final-mobile');
 const personal=page.locator('section[aria-labelledby="your-settlement-heading"]');await personal.getByTitle('Mark sent').first().click();await expect(personal.getByRole('heading')).toHaveText('You owe $10.00.');await capture('payment-partial-mobile');await personal.getByTitle('Mark sent').click();await expect(personal.getByRole('heading')).toHaveText('All your payments are marked sent.');await capture('payment-complete-mobile');
 if(await page.getByRole('button',{name:'Reveal your game card',exact:true}).isVisible()) await page.getByRole('button',{name:'Reveal your game card',exact:true}).click();await page.getByRole('button',{name:'Customize and share your game card'}).click();await capture('recap-dialog-mobile');
 writeFileSync(`${out}/visual-game-url.txt`,page.url());
} finally {await browser.close();}
