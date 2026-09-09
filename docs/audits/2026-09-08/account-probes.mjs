import {createClient} from '@supabase/supabase-js';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const w=readFileSync('/tmp/mainpot-ux-review-workdir','utf8');
const s=JSON.parse(execFileSync('./node_modules/.bin/supabase',['--workdir',w,'status','--output','json'],{stdio:['ignore','pipe','ignore'],encoding:'utf8'}));
if(s.API_URL!=='http://127.0.0.1:55321')throw Error('Refuse non-audit database');
const clients=[],ids=[],gameIds=[];const result={};
const admin=createClient(s.API_URL,s.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
async function actor(label){const c=createClient(s.API_URL,s.PUBLISHABLE_KEY??s.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});const r=await c.auth.signUp({email:`audit-${label}-${randomUUID()}@example.com`,password:randomUUID()});if(r.error)throw r.error;clients.push(c);ids.push(r.data.user.id);return {c,id:r.data.user.id};}
try{
const a=await actor('a'),b=await actor('b');
let r=await a.c.from('profiles').update({venmo_handle:'audit-only',zelle_handle:'audit-only@example.com'}).eq('id',a.id);if(r.error)throw r.error;
r=await b.c.from('profiles').select('id,venmo_handle,zelle_handle').eq('id',a.id);result.unrelatedPaymentContactRead={rejected:!!r.error,error:r.error?.message};
r=await a.c.from('friendships').insert({requester_id:a.id,addressee_id:b.id,status:'pending'}).select().single();if(r.error)throw r.error;
const id=r.data.id;r=await a.c.from('friendships').update({status:'accepted',responded_at:new Date().toISOString()}).eq('id',id).select('status').single();result.senderSelfAccept={allowed:!r.error,status:r.data?.status,error:r.error?.message};
async function game(actor,code){const r=await actor.c.rpc('create_game_guarded',{input_code:code,input_game_name:'Synthetic API audit',input_host_name:'Audit',input_buy_in:20,input_session_id:randomUUID()});if(r.error)throw r.error;const row=Array.isArray(r.data)?r.data[0]:r.data;gameIds.push(row.game_id);return row;}
const ag=await game(a,'AXRT42'),bg=await game(b,'BXRT42');
r=await a.c.from('game_events').insert({game_id:bg.game_id,actor_player_id:ag.player_id,event_type:'game_finalized',metadata:{}});result.crossGameAuditInsert={allowed:!r.error,error:r.error?.message};
const check=await admin.from('game_events').select('event_type').eq('game_id',bg.game_id).eq('actor_player_id',ag.player_id);result.crossGameAuditInsert.persisted=!!check.data?.length;
r=await a.c.rpc('join_game_guarded',{input_code:'AXRT42',input_player_name:'Audit',input_session_id:randomUUID()});result.sameAccountNewSessionJoin={error:r.error?.message,dataReturned:!!r.data};
writeFileSync('docs/audits/2026-09-08/evidence/account-probes.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{for(const id of gameIds)await admin.from('games').delete().eq('id',id);for(const id of ids)await admin.auth.admin.deleteUser(id);for(const c of clients)await c.auth.signOut();}
