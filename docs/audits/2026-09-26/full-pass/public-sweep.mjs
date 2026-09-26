import { chromium, webkit, devices } from '@playwright/test';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const out = new URL('./evidence/', import.meta.url).pathname;
mkdirSync(out, {recursive:true});
const rows=[];
const profiles=[
  ['desktop-chrome',chromium,{viewport:{width:1440,height:900}}],
  ['android-chrome',chromium,devices['Pixel 5']],
  ['iphone-webkit',webkit,devices['iPhone 13']],
  ['ipad-webkit',webkit,devices['iPad Mini']],
  ['desktop-webkit',webkit,{viewport:{width:1440,height:900}}],
  ['narrow-chrome',chromium,{viewport:{width:320,height:568}}],
];
const paths=['/','/create','/join','/signin','/dashboard','/friends','/poker-settlement-calculator','/feedback','/privacy','/terms','/self-host','/missing-full-audit-page'];
for(const [name,engine,options] of profiles){
  const browser=await engine.launch({headless:true});
  const context=await browser.newContext({...options,baseURL:process.env.AUDIT_BASE_URL??'https://mainpot.app',serviceWorkers:'block'});
  const page=await context.newPage();
  for(const path of paths){
    const errors=[]; const listener=e=>errors.push(e.message);page.on('pageerror',listener);
    try{
      const response=await page.goto(path,{waitUntil:'networkidle',timeout:20000});
      await page.addScriptTag({path:require.resolve('axe-core')});
      const accessibility=await page.evaluate(async()=>{
        const a=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}});
        return a.violations.map(v=>({id:v.id,impact:v.impact,help:v.help,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}));
      });
      const metrics=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,title:document.title,headings:[...document.querySelectorAll('h1')].map(e=>e.textContent),smallTargets:[...document.querySelectorAll('button,a,input,summary')].filter(e=>e.getClientRects().length).map(e=>({text:e.getAttribute('aria-label')||e.textContent.trim().slice(0,70),width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})).filter(e=>e.width<24||e.height<24)}));
      if(['/create','/join','/signin','/poker-settlement-calculator'].includes(path))await page.screenshot({path:`${out}/public-${name}-${path.slice(1)}.png`,fullPage:true});
      rows.push({profile:name,path,status:response.status(),url:page.url(),...metrics,accessibility,errors});
      console.log(name,path,response.status(),'overflow',metrics.scrollWidth-metrics.width,'axe',accessibility.map(v=>v.id).join(','));
    }catch(e){rows.push({profile:name,path,harnessError:e.message,errors});console.log(name,path,e.message);}
    finally{page.off('pageerror',listener);writeFileSync(`${out}/public-sweep.json`,JSON.stringify(rows,null,2));}
  }
  await browser.close();
}
