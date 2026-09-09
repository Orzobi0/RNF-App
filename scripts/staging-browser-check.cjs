// Local-browser integration test. No credentials, tokens or Auth bodies are logged.
const fs = require('node:fs');
const {chromium} = require('../.firebase/browser-tests/node_modules/playwright-core');
const args = process.argv.slice(2);
if (args.join(' ') !== '--project fertiliapp-staging') throw Error('Explicit staging project required');
const readEnv = file => Object.fromEntries(fs.readFileSync(file,'utf8').split(/\r?\n/).filter(l=>l && !l.startsWith('#') && l.includes('=')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)]));
const testEnv = readEnv('environments/staging/.env.test.local');
const firebaseEnv = readEnv('environments/staging/.env.local');
const email = testEnv.FERTILIAPP_TEST_EMAIL;
const password = testEnv.FERTILIAPP_TEST_PASSWORD;
const uid = testEnv.FERTILIAPP_TEST_UID;
const base = 'http://localhost:5174';
if (!email?.endsWith('@fertiliapp.invalid') || !uid?.startsWith('staging-qa-') || firebaseEnv.VITE_FIREBASE_PROJECT_ID !== 'fertiliapp-staging') throw Error('Synthetic staging test identity required');
let phase = 'start';
let browser;
const result = {project:'fertiliapp-staging', productionRequests:0};
function check(value, name) {if(!value)throw Error('check: '+name);}
async function context() {
  const ctx = await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  await ctx.route('**/*', route => {
    const url = new URL(route.request().url());
    const decoded = decodeURIComponent(url.href);
    if (/rnf-app(?:-experiment)?\.(web\.app|firebaseapp\.com|appspot\.com)|experiment\.fertiliapp\.com|projects\/rnf-app(?:\/|\b)/.test(decoded) ||
        (['identitytoolkit.googleapis.com','securetoken.googleapis.com'].includes(url.hostname) && url.searchParams.has('key') && url.searchParams.get('key') !== firebaseEnv.VITE_FIREBASE_API_KEY)) {
      result.productionRequests++;
      return route.abort();
    }
    return route.continue();
  });
  return ctx;
}
(async()=>{
  browser = await chromium.launch({headless:true});
  const first = await context();
  const page = await first.newPage();
  phase='local login page';
  await page.goto(base+'/auth');
  await page.getByText('Entorno de pruebas',{exact:true}).waitFor();
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  phase='sessionLogin';
  const loginResponse = page.waitForResponse(r=>new URL(r.url()).pathname==='/api/sessionLogin' && r.request().method()==='POST');
  await page.locator('button[type="submit"]').click();
  const login = await loginResponse;
  result.sessionLogin=login.status();
  if(login.status()!==200) {
    const payload=await login.json().catch(()=>({}));
    console.log(JSON.stringify({sessionLoginStatus:login.status(),code:payload.code||'non-json'}));
  }
  check(login.status()===200,'sessionLogin HTTP 200');
  check((await login.json()).ok===true,'sessionLogin payload');
  result.sessionLogin=login.status();
  await page.waitForURL(url=>url.pathname!=='/auth');
  const cookie=(await first.cookies(base)).find(c=>c.name==='__session');
  check(cookie?.httpOnly && cookie.secure && cookie.sameSite==='Lax','secure HttpOnly session cookie');
  result.cookie={httpOnly:cookie.httpOnly,secure:cookie.secure,sameSite:cookie.sameSite};
  phase='Firestore isolation';
  result.firestore = await page.evaluate(async expectedUid => {
    const client=await import('/src/lib/firebaseClient.js');
    if(client.app.options.projectId!=='fertiliapp-staging'||client.auth.currentUser?.uid!==expectedUid)throw Error('Wrong authenticated project');
    const url=performance.getEntriesByType('resource').map(e=>e.name).find(n=>n.includes('/firebase_firestore.js'));
    if(!url)throw Error('Firestore module not found');
    const f=await import(url);
    const run='staging-validation-'+Date.now();
    const owned=f.doc(client.db,`users/${expectedUid}/metrics/${run}`);
    await f.setDoc(owned,{synthetic:true,environment:'staging',run,createdAt:f.serverTimestamp()});
    const read=await f.getDocFromServer(owned);
    const index=f.doc(client.db,`users/${expectedUid}/cycles/${run}/entries_by_iso/2099-01-01`);
    await f.setDoc(index,{synthetic:true,run});
    const legacy=f.doc(client.db,`users/${expectedUid}/records/${run}/measurements/synthetic`);
    await f.setDoc(legacy,{synthetic:true,run});
    let crossRead=false,crossWrite=false;
    const other=f.doc(client.db,`users/staging-other-synthetic/metrics/${run}`);
    try{await f.getDocFromServer(other);}catch(e){crossRead=e.code==='permission-denied';}
    try{await f.setDoc(other,{synthetic:true});}catch(e){crossWrite=e.code==='permission-denied';}
    return {ownReadWrite:read.data()?.run===run,entriesByIso:(await f.getDocFromServer(index)).exists(),legacyMeasurements:(await f.getDocFromServer(legacy)).exists(),crossReadDenied:crossRead,crossWriteDenied:crossWrite};
  },uid);
  check(Object.values(result.firestore).every(Boolean),'Firestore checks');
  await page.screenshot({path:'.firebase/staging-browser.png',fullPage:true});
  phase='cold sessionRestore';
  const second=await context();
  await second.addCookies([cookie]);
  const restored=await second.newPage();
  const restoreResponse=restored.waitForResponse(r=>new URL(r.url()).pathname==='/api/sessionRestore');
  await restored.goto(base+'/');
  const response=await restoreResponse;
  check(response.status()===200,'sessionRestore HTTP 200');
  await restored.waitForFunction(async expected=>{
    const {auth}=await import('/src/lib/firebaseClient.js');
    return auth.currentUser?.uid===expected;
  },uid);
  result.coldSessionRestore=true;
  const me=await restored.evaluate(async()=>{
    const r=await fetch('/api/sessionMe',{credentials:'include'});
    const payload=await r.json();
    return {status:r.status,uid:payload.uid};
  });
  check(me.status===200 && me.uid===uid,'restored sessionMe');
  result.sessionMe=200;
  phase='synthetic logout and revocation';
  const logout=await restored.evaluate(async()=>{
    const r=await fetch('/api/sessionLogout',{method:'POST',credentials:'include'});
    return r.status;
  });
  check(logout===200,'logout');
  const missing=await restored.evaluate(async()=>{
    const r=await fetch('/api/sessionRestore',{credentials:'include'});
    return {status:r.status,code:(await r.json()).code};
  });
  check(missing.status===401 && missing.code==='missing_session','session cleared');
  const revoked=await page.evaluate(async()=>{
    const r=await fetch('/api/sessionMe',{credentials:'include'});
    return {status:r.status,code:(await r.json()).code};
  });
  check(revoked.status===401 && revoked.code==='invalid_session','old session revoked');
  result.logoutAndRevocation=true;
  check(result.productionRequests===0,'no production traffic');
  fs.writeFileSync('.firebase/staging-browser-result.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
})().catch(e=>{
  const message=String(e.message||'').replaceAll(password,'[redacted]').replaceAll(email,'[redacted]');
  console.error(JSON.stringify({phase,error:e.name,detail:message.startsWith('check:')?message:'Browser check failed; credentials and response bodies omitted.'}));
  process.exitCode=1;
}).finally(async()=>{await browser?.close();});
