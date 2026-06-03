#!/usr/bin/env node
/**
 * Grant a user PROJECT ADMIN on a list of ACC projects, via a 2-legged app token
 * (account:write) + the `User-Id` header (acts on behalf of an authorized user).
 *
 * Requires the APS client to be an authorized account integration with account:write.
 *
 * Env:
 *   DC_GRANT_IDS_FILE  (required) newline/comma-separated project IDs.
 *   DC_GRANT_EMAIL     user to add (default luis.cortes@hermosillo.com)
 *   DC_GRANT_DRY_RUN=1 resolve token + actor, print plan, write nothing.
 *   DC_GRANT_DELAY_MS  delay between calls (default 400ms).
 *
 * Result codes per project: granted(201) | already(409) | failed(other, logged).
 */
require("tsx/cjs");
const fs = require("node:fs");
const d=(()=>{try{return require("dotenv")}catch{return null}})();if(d)d.config();

const TOK="https://developer.api.autodesk.com/authentication/v2/token";
const ADM="https://developer.api.autodesk.com/construction/admin";
const HQ="https://developer.api.autodesk.com/hq";
const USERINFO="https://api.userprofile.autodesk.com/userinfo";
const ACCOUNT=(process.env.APS_HUB_ID||"").replace(/^b\./,"");
const EMAIL=process.env.DC_GRANT_EMAIL||"luis.cortes@hermosillo.com";
const IDS_FILE=process.env.DC_GRANT_IDS_FILE?.trim();
const DRY=process.env.DC_GRANT_DRY_RUN==="1";
const DELAY=Number.parseInt(process.env.DC_GRANT_DELAY_MS||"400",10);

function ts(){return new Date().toISOString();}
function log(...a){console.log(`[grant ${ts()}]`,...a);}
function P(){const{PrismaClient}=require("@prisma/client");const{PrismaPg}=require("@prisma/adapter-pg");const url=process.env.DIRECT_URL?.trim()||process.env.DATABASE_URL?.trim();return new PrismaClient({adapter:new PrismaPg({connectionString:url,max:2}),log:["error"]});}
async function twoLeg(){const b=new URLSearchParams({grant_type:"client_credentials",client_id:process.env.APS_CLIENT_ID,client_secret:process.env.APS_CLIENT_SECRET,scope:"account:read account:write data:read data:write"});const r=await fetch(TOK,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:b});const j=await r.json();if(!j.access_token)throw new Error("no 2-legged token: "+JSON.stringify(j));return j.access_token;}
async function call(method,url,t,body,headers){const r=await fetch(url,{method,headers:{Authorization:`Bearer ${t}`,"Content-Type":"application/json",...(headers||{})},...(body?{body:JSON.stringify(body)}:{})});const txt=await r.text();let j;try{j=txt?JSON.parse(txt):{}}catch{j=txt}return{status:r.status,j};}
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));

async function main(){
  if(!IDS_FILE)throw new Error("DC_GRANT_IDS_FILE is required");
  const ids=[...new Set(fs.readFileSync(IDS_FILE,"utf8").split(/[\s,]+/).map(s=>s.trim()).filter(Boolean))];
  const p=P();
  try{
    const acct=await p.account.findFirst({where:{provider:"autodesk",user:{email:EMAIL}},select:{providerAccountId:true,access_token:true}});
    let autodeskId=acct?.providerAccountId||null;
    if(!autodeskId&&acct?.access_token){const ui=await call("GET",USERINFO,acct.access_token);autodeskId=ui.j?.sub||null;}
    if(!autodeskId)throw new Error(`could not resolve Autodesk ID for ${EMAIL}`);
    // names for reporting
    const projs=await p.accProject.findMany({where:{id:{in:ids}},select:{id:true,name:true}});
    const nameById=new Map(projs.map(r=>[r.id,r.name]));

    log(`grantee=${EMAIL} autodeskId=${autodeskId} projects=${ids.length} dryRun=${DRY}`);
    if(DRY){ids.forEach((id,i)=>log(`  ${i+1}. ${id} "${(nameById.get(id)||"?").trim()}"`));log("DRY RUN — nothing written.");return;}

    const token=await twoLeg();
    // resolve BIM360 id (needed as x-user-id for BIM360-platform projects)
    let bim360Id=null;
    const us=await call("GET",`${HQ}/v1/accounts/${ACCOUNT}/users/search?email=${encodeURIComponent(EMAIL)}&limit=5`,token);
    if(Array.isArray(us.j)){const me=us.j.find(u=>(u.email||"").toLowerCase()===EMAIL)||us.j[0];bim360Id=me?.id||null;}
    log(`bim360Id=${bim360Id||"(unresolved)"}`);

    const accBody={email:EMAIL,products:[{key:"projectAdministration",access:"administrator"},{key:"docs",access:"administrator"}],suppressAdministrativeEmails:true};
    const bimBody=[{email:EMAIL,services:{project_administration:{access_level:"admin"},document_management:{access_level:"admin"}},industry_roles:[]}];
    const res={granted:[],already:[],failed:[]};
    for(let i=0;i<ids.length;i++){
      const id=ids[i];const nm=(nameById.get(id)||"?").trim();
      // try ACC endpoint first
      let r=await call("POST",`${ADM}/v1/projects/${id}/users`,token,accBody,{"User-Id":autodeskId});
      let platform="ACC";
      const needsBim=r.status===400 && /ACC/i.test((r.j&&(r.j.detail||r.j.title))||"");
      if(needsBim && bim360Id){
        platform="BIM360";
        r=await call("POST",`${HQ}/v2/accounts/${ACCOUNT}/projects/${id}/users/import`,token,bimBody,{"x-user-id":bim360Id});
      }
      const okAcc=r.status===201;
      const okBim=platform==="BIM360" && (r.status===200||r.status===201) && r.j && r.j.failure===0 && r.j.success>=1;
      // BIM360 returns failure code 2000 "User already exists in project" — treat as already-granted.
      const bimAlready=platform==="BIM360" && r.j && Array.isArray(r.j.failure_items) && r.j.failure_items.some(fi=>Array.isArray(fi.errors)&&fi.errors.some(e=>e.code===2000||/already exists/i.test(e.message||"")));
      if(okAcc||okBim){res.granted.push({id,nm,platform});log(`✓ [${i+1}/${ids.length}] GRANTED (${platform}) "${nm}"`);}
      else if(r.status===409||bimAlready){res.already.push({id,nm,platform});log(`= [${i+1}/${ids.length}] already (${platform}) "${nm}"`);}
      else{const detail=(r.j&&(r.j.detail||r.j.title))||(r.j&&r.j.failure_items&&JSON.stringify(r.j.failure_items[0]?.errors).slice(0,140))||JSON.stringify(r.j).slice(0,160);res.failed.push({id,nm,platform,status:r.status,detail});log(`✗ [${i+1}/${ids.length}] FAIL ${r.status} (${platform}) "${nm}" :: ${detail}`);}
      await sleep(DELAY);
    }
    log("=== GRANT SUMMARY ===");
    console.log(JSON.stringify({granted:res.granted.length,already:res.already.length,failed:res.failed.length,grantedDetail:res.granted,failedDetail:res.failed},null,2));
  }finally{await p.$disconnect().catch(()=>{});}
}
main().catch(e=>{console.error("Fatal:",e?.message||e);process.exit(1);});
