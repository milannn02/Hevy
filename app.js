"use strict";

/* ---------------- state ---------------- */
let raw = [];            // alle sets
let sessions = [];       // per workout-sessie
let maxDate = null;
let period = 'all';
let currentEx = '';
let currentMeta = {name:'', demo:false};
let prSort = {k:'e1rm', dir:-1};
let exTypes = new Map();   // exercise_title -> 'weight' | 'reps' | 'time' | 'dist'
let plan = null;           // gegenereerd trainingsplan
let planWeek = 1;
let muscleMode = 'all';    // 'all' | 'hard' (RPE≥7) voor de spiergroep-weergaven
const charts = {};

const PLATE = {red:'#E03B3B', blue:'#2D6FD2', yellow:'#F0B429', green:'#2FA36B', white:'#D8DDE6', grey:'#5A6170'};
const MUSCLE_COLORS = {
  'Borst':PLATE.red,'Rug':PLATE.blue,'Schouders':PLATE.yellow,'Quads':PLATE.green,
  'Hamstrings/Glutes':'#9C6ADE','Biceps':'#E580B0','Triceps':'#5BC8D8','Kuiten':'#C0C8D6','Core':'#8B93A5','Cardio':'#E8975A','Overig':'#4A5160'
};

if (window.Chart) {
  Chart.defaults.color = '#8B93A5';
  Chart.defaults.borderColor = '#2C313C';
  Chart.defaults.font.family = "'IBM Plex Mono', monospace";
  Chart.defaults.font.size = 11;
  Chart.defaults.animation = false;          // sneller + stabieler bij grote datasets
  Chart.defaults.plugins.tooltip.animation = false;
}

/* ---------------- helpers ---------------- */
const MONTHS = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
function parseDate(s){ // "25 May 2026, 10:53"
  if(!s) return null;
  const m = String(s).match(/(\d{1,2})\s+(\w{3})\w*\s+(\d{4}),?\s+(\d{1,2}):(\d{2})/);
  if(!m) { const d = new Date(s); return isNaN(d)?null:d; }
  return new Date(+m[3], MONTHS[m[2]] ?? 0, +m[1], +m[4], +m[5]);
}
const fmtD = d => d.toLocaleDateString('nl-NL',{day:'numeric',month:'short',year:'numeric'});
const fmtKg = n => n>=10000 ? (n/1000).toLocaleString('nl-NL',{maximumFractionDigits:1})+'k kg' : Math.round(n).toLocaleString('nl-NL')+' kg';
const e1rm = (w,r) => r>1 ? w*(1+r/30) : w;
function weekStart(d){ const t=new Date(d); t.setHours(0,0,0,0); t.setDate(t.getDate()-(t.getDay()+6)%7); return t; }
const isWork = s => s.set_type !== 'warmup';

/* spiergroep-mapping op naam — generiek, werkt ook voor onbekende oefeningen */
function muscleOf(name){
  const n = ' ' + String(name).toLowerCase() + ' ';
  // cardio / conditioning eerst (zodat "Rowing Machine" niet als rug telt)
  if(/(treadmill|elliptical|cross[- ]?trainer|cycling|spin bike|stationary bike|air ?bike|assault bike|\bbike\b|stair ?master|stair machine|stepmill|\bstepper\b|rowing machine|\brower\b|ski[- ]?erg|\berg\b|swim|hiking|\bhike\b|walking|\bwalk\b|jogging|\bjog\b|running|\brun\b|sprint|jump rope|skipping|jumping jack|\bcardio\b)/.test(n)) return 'Cardio';
  if(/\btricep/.test(n)) return 'Triceps';                                  // "Triceps Dip" => triceps, niet borst
  if(/(rear delt|reverse fly|face pull|pull ?apart|pullapart)/.test(n)) return 'Schouders';
  if(/(bench|chest|\bpec\b|pec deck|\bfly\b|\bdip\b|push ?up|press ?up|floor press|crossover|svend)/.test(n)) return 'Borst';
  if(/(lateral raise|side raise|shoulder press|overhead press|military|arnold|front raise|upright|\bdelt\b|rotator cuff|scaption|cuban)/.test(n)) return 'Schouders';
  if(/(\brow\b|row\b|pulldown|pull ?down|pull[- ]?up|chin[- ]?up|lat |\blats\b|pullover|shrug|muscle up|dead hang|scapular|inverted row|rack pull|seal row|high pull|straight arm)/.test(n)) return 'Rug';
  if(/curl/.test(n) && /(leg|nordic|hamstring|ham )/.test(n)) return 'Hamstrings/Glutes';
  if(/(curl|bicep|preacher|hammer|bayesian|brachial)/.test(n)) return 'Biceps';
  if(/(pushdown|push ?down|skull ?crush|close grip|kickback.*tricep|overhead extension|french press)/.test(n)) return 'Triceps';
  if(/(deadlift|\brdl\b|romanian|hip thrust|glute|good morning|back extension|hyperextension|hip ab|hip ad|pull through|stiff leg|leg curl)/.test(n)) return 'Hamstrings/Glutes';
  if(/(squat|leg press|leg extension|leg ext|lunge|split squat|\bhack\b|step up|wall sit|sissy|pendulum|goblet|curtsy)/.test(n)) return 'Quads';
  if(/(calf|calves|calve|soleus|heel raise|tibialis)/.test(n)) return 'Kuiten';
  if(/(crunch|plank|\babs?\b|sit ?up|leg raise|knee raise|russian|pallof|woodchop|mountain climber|shoulder taps|heel taps|hollow|dead bug|toes to bar|oblique|windshield)/.test(n)) return 'Core';
  return 'Overig';
}
const PUSH = new Set(['Borst','Triceps']); const PULL = new Set(['Rug','Biceps']);
const isRearDelt = name => /(rear delt|reverse fly|face pull|\brear\b|pull ?apart|pullapart)/i.test(name);

// C16 — secundaire spieren: een set telt vol mee voor de primaire spier en half (0,5) voor betrokken hulpspieren
const SECONDARY = [
  [/(bench|chest press|incline press|floor press|push ?up|crossover|\bfly\b|\bpec\b)/, ['Triceps','Schouders']],
  [/\bdip\b/, ['Borst','Triceps']],
  [/(overhead press|shoulder press|military|arnold|lateral raise|front raise|upright)/, ['Triceps']],
  [/(\brow\b|pulldown|pull ?up|chin ?up|\blat )/, ['Biceps']],
  [/(deadlift|romanian|\brdl\b|good morning|back extension|hyperextension)/, ['Rug','Hamstrings/Glutes']],
  [/(squat|leg press|lunge|\bhack\b|split squat|step up)/, ['Hamstrings/Glutes']],
  [/(hip thrust|glute)/, ['Hamstrings/Glutes']]
];
function muscleContribs(name){
  const prim = muscleOf(name);
  const out = [{m:prim, w:1}];
  if(prim==='Cardio' || prim==='Overig') return out;
  const n = ' ' + String(name).toLowerCase() + ' ';
  SECONDARY.forEach(([rx,ms])=>{ if(rx.test(n)) ms.forEach(m=>{ if(m!==prim && !out.some(o=>o.m===m)) out.push({m, w:0.5}); }); });
  return out;
}
// C5/C13 — "harde set": dicht bij falen (RPE≥7) of failure/dropset
const isHardSet = r => isWork(r) && r.reps>0 && (r.rpe>=7 || r.set_type==='failure' || r.set_type==='dropset');
// heatmap-kleur: licht (weinig) → donkerblauw (veel)
function heatColor(x){
  x = Math.max(0, Math.min(1, x||0));
  const lo=[176,199,232], hi=[16,52,104];
  const c = lo.map((v,i)=>Math.round(v + (hi[i]-v)*x));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
// gewogen werksets per spiergroep over een rij-lijst (secundair telt 0,5 mee)
function muscleSetCounts(rows){
  const m = new Map();
  rows.forEach(r=>muscleContribs(r.exercise_title).forEach(c=>{
    if(c.m==='Cardio'||c.m==='Overig') return;
    m.set(c.m, (m.get(c.m)||0)+c.w);
  }));
  return m;
}
// C11 — DOTS: lichaamsgewicht-eerlijke krachtscore (verving Wilks in 2019)
const DOTS_C = {
  m:[-307.75076, 24.0900756, -0.1918759221, 0.0007391293, -0.000001093],
  f:[-57.96288, 13.6175032, -0.1126655495, 0.0005158568, -0.0000010706]
};
function dotsCoef(bw, sex){
  const c = DOTS_C[sex] || DOTS_C.m;
  const x = Math.max(40, Math.min(sex==='f'?150:210, bw));
  const d = c[0] + c[1]*x + c[2]*x*x + c[3]*x*x*x + c[4]*x*x*x*x;
  return d ? 500/d : 0;
}

/* ---------------- metriek-model (gewicht / reps / tijd / afstand) ---------------- */
function fmtDur(sec){
  sec = Math.round(sec||0);
  if(sec>=3600){ const h=Math.floor(sec/3600), m=Math.round((sec%3600)/60); return `${h}u ${m}m`; }
  const m=Math.floor(sec/60), s=sec%60; return m? `${m}m ${s}s` : `${s}s`;
}
const fmtKm = v => (Math.round(v*100)/100).toLocaleString('nl-NL') + ' km';
const exType = name => exTypes.get(name) || 'weight';
// geldige (uitgevoerde) set voor een gegeven metriek
function validForType(r,t){
  if(t==='weight') return r.weight_kg>0 && r.reps>0;
  if(t==='reps')   return r.reps>0;
  if(t==='time')   return r.dur>0;
  if(t==='dist')   return r.dist>0;
  return false;
}
function setScore(r,t){ // "prestatie" van één set (hoger = beter)
  if(t==='weight') return (r.weight_kg>0&&r.reps>0)? e1rm(r.weight_kg,r.reps) : 0;
  if(t==='reps')   return r.reps;
  if(t==='time')   return r.dur;
  if(t==='dist')   return r.dist;
  return 0;
}
function setMag(r,t){ // grootheid voor "topset" (zwaarste/meeste/langste/verste)
  if(t==='weight') return r.weight_kg;
  if(t==='reps')   return r.reps;
  if(t==='time')   return r.dur;
  if(t==='dist')   return r.dist;
  return 0;
}
function setVolT(r,t){ // sessievolume per metriek
  if(t==='weight') return (r.weight_kg>0&&r.reps>0)? r.weight_kg*r.reps : 0;
  if(t==='reps')   return r.reps;
  if(t==='time')   return r.dur;
  if(t==='dist')   return r.dist;
  return 0;
}
function fmtScore(v,t){
  if(!v) return '–';
  if(t==='weight') return Math.round(v)+' kg';
  if(t==='reps')   return Math.round(v)+' reps';
  if(t==='time')   return fmtDur(v);
  if(t==='dist')   return fmtKm(v);
  return String(v);
}
function fmtVolT(v,t){
  if(t==='weight') return fmtKg(v);
  if(t==='reps')   return Math.round(v).toLocaleString('nl-NL')+' reps';
  if(t==='time')   return fmtDur(v);
  if(t==='dist')   return fmtKm(v);
  return String(v);
}
function fmtSet(r,t){
  if(t==='weight') return `${r.weight_kg}kg × ${r.reps}`;
  if(t==='reps')   return `${r.reps} reps`;
  if(t==='time')   return fmtDur(r.dur);
  if(t==='dist')   return fmtKm(r.dist) + (r.dur? ` · ${fmtDur(r.dur)}` : '');
  return '';
}
function typeLabels(t){
  if(t==='reps') return {top:'Beste set', best:'Totaal reps'};
  if(t==='time') return {top:'Langste set', best:'Totale tijd'};
  if(t==='dist') return {top:'Verste set', best:'Totale afstand'};
  return {top:'Zwaarste set', best:'Beste e1RM'};
}
// bepaal per oefening het meettype op basis van alle (werk)sets
function computeExTypes(){
  const agg = new Map();
  raw.forEach(r=>{
    if(!isWork(r)) return;
    let a = agg.get(r.exercise_title) || {w:0,reps:0,dur:0,dist:0};
    if(r.weight_kg>0 && r.reps>0) a.w++;
    else if(r.reps>0) a.reps++;
    else if(r.dur>0) a.dur++;
    else if(r.dist>0) a.dist++;
    agg.set(r.exercise_title, a);
  });
  exTypes = new Map();
  agg.forEach((a,name)=>{
    let t = 'weight';
    if(a.w>0) t='weight'; else if(a.reps>0) t='reps'; else if(a.dur>0) t='time'; else if(a.dist>0) t='dist';
    exTypes.set(name, t);
  });
}
function setKpiLabel(id,text){ const b=document.getElementById(id); const s=b&&b.parentElement.querySelector('span'); if(s) s.textContent=text; }

// Ruis-robuuste trend: lineaire regressie over (tijd, score) i.p.v. een 2-punts vergelijking.
// (1RM-schattingen hebben ~4% meetruis; een 0,2%-drempel gaf valse plateaus — zie Wetenschap.)
function trendInfo(points){
  if(!points || points.length<3) return null;
  const t0=points[0].t;
  const xs=points.map(p=>(p.t-t0)/(7*864e5));   // weken sinds eerste punt
  const ys=points.map(p=>p.v);
  const n=xs.length;
  const sx=xs.reduce((a,b)=>a+b,0), sy=ys.reduce((a,b)=>a+b,0);
  const sxx=xs.reduce((a,x)=>a+x*x,0), sxy=xs.reduce((a,x,i)=>a+x*ys[i],0);
  const denom=n*sxx-sx*sx; if(denom===0) return null;
  const slope=(n*sxy-sx*sy)/denom;              // score per week
  const intercept=(sy-slope*sx)/n;
  const base = intercept>0 ? intercept : sy/n;
  const pct = base>0 ? (slope*xs[n-1])/base*100 : 0;   // gemodelleerde verandering over de periode, in %
  return {slope, pct, n};
}
function sessionBests(sets, t){
  const m=new Map();
  sets.forEach(r=>{ const v=setScore(r,t); if(v>0){ const k=r.date.getTime(); m.set(k, Math.max(m.get(k)||0, v)); } });
  return [...m.entries()].sort((a,b)=>a[0]-b[0]).map(([tt,v])=>({t:tt,v}));
}

/* ---------------- persistentie (IndexedDB) ---------------- */
const DB_NAME='hevylog', STORE='kv', KEY='dataset';
function idb(){
  return new Promise((res,rej)=>{
    const r = indexedDB.open(DB_NAME,1);
    r.onupgradeneeded = ()=>r.result.createObjectStore(STORE);
    r.onsuccess = ()=>res(r.result);
    r.onerror = ()=>rej(r.error);
  });
}
async function idbSet(k,v){ const db=await idb(); return new Promise((res,rej)=>{const t=db.transaction(STORE,'readwrite');t.objectStore(STORE).put(v,k);t.oncomplete=()=>res();t.onerror=()=>rej(t.error);}); }
async function idbGet(k){ const db=await idb(); return new Promise((res,rej)=>{const t=db.transaction(STORE,'readonly');const q=t.objectStore(STORE).get(k);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);}); }
async function idbDel(k){ const db=await idb(); return new Promise((res,rej)=>{const t=db.transaction(STORE,'readwrite');t.objectStore(STORE).delete(k);t.oncomplete=()=>res();t.onerror=()=>rej(t.error);}); }
async function saveData(name,csv,demo){ try{ await idbSet(KEY,{name,csv,demo,ts:Date.now()}); }catch(e){ /* opslag niet beschikbaar */ } }

/* ---------------- toast ---------------- */
let toastT;
function toast(msg){
  const t=document.getElementById('toast'); if(!t) return;
  t.textContent=msg; t.classList.add('show');
  clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('show'),2800);
}

/* ---------------- DOM refs ---------------- */
const hero = document.getElementById('uploadHero');
const dataBar = document.getElementById('dataBar');
const appEl = document.getElementById('app');
const periodsEl = document.getElementById('periods');
const fileInput = document.getElementById('fileInput');

/* ---------------- file / demo / persistentie laden ---------------- */
document.getElementById('pickBtn').addEventListener('click', ()=>fileInput.click());
document.getElementById('newBtn').addEventListener('click', ()=>fileInput.click());
document.getElementById('demoBtn').addEventListener('click', loadDemo);
document.getElementById('demoBtn2').addEventListener('click', loadDemo);
document.getElementById('clearBtn').addEventListener('click', ()=>{
  if(window.confirm('Weet je zeker dat je de geladen data wilt wissen? Je kunt je CSV-bestand daarna opnieuw inladen.')) clearAll();
});
document.getElementById('dataToggle').addEventListener('click', ()=>{
  const acts=document.getElementById('dataActs');
  const open=acts.hasAttribute('hidden');           // momenteel ingeklapt → openen
  acts.toggleAttribute('hidden', !open);
  document.getElementById('dataToggle').setAttribute('aria-expanded', open?'true':'false');
});
// wetenschappelijke onderbouwing: inklapbaar onderaan de pagina
const sciToggleBtn=document.getElementById('sciToggle');
if(sciToggleBtn) sciToggleBtn.addEventListener('click', ()=>{
  const sec=document.getElementById('tab-wetenschap');
  const open=sec.hasAttribute('hidden');
  sec.toggleAttribute('hidden', !open);
  if(open) requestAnimationFrame(()=>sec.scrollIntoView({behavior:'smooth', block:'start'}));
});
fileInput.addEventListener('change', e => e.target.files[0] && loadFile(e.target.files[0]));

['dragover','dragenter'].forEach(ev=>hero.addEventListener(ev,e=>{e.preventDefault();hero.classList.add('drag')}));
['dragleave','drop'].forEach(ev=>hero.addEventListener(ev,e=>{e.preventDefault();hero.classList.remove('drag')}));
hero.addEventListener('drop', e => e.dataTransfer.files[0] && loadFile(e.dataTransfer.files[0]));

function loadFile(file){
  document.getElementById('fileMeta').textContent = 'Bezig met laden…';
  const reader = new FileReader();
  reader.onload = ()=>ingest(String(reader.result), file.name, {persist:true, demo:false});
  reader.onerror = ()=>{ document.getElementById('fileMeta').textContent='Kon bestand niet lezen.'; toast('Kon bestand niet lezen'); };
  reader.readAsText(file);
}

function loadDemo(){
  const csv = generateDemoCSV();
  if(ingest(csv, 'Voorbeelddata', {persist:true, demo:true})) toast('Voorbeelddata geladen — verken gerust alles');
}

function ingest(text, name, {persist=true, demo=false}={}){
  if(typeof Papa === 'undefined'){ toast('CSV-bibliotheek nog niet geladen, probeer opnieuw'); return false; }
  const res = Papa.parse(text, {header:true, dynamicTyping:true, skipEmptyLines:true});
  const rows = res.data.filter(r => r.exercise_title && r.start_time);
  if(!rows.length){ document.getElementById('fileMeta').textContent = 'Geen geldige Hevy-data gevonden in dit bestand.'; toast('Geen geldige Hevy-data gevonden'); return false; }
  raw = rows.map(r => ({
    ...r,
    date: parseDate(r.start_time),
    end: parseDate(r.end_time),
    weight_kg: typeof r.weight_kg === 'number' ? r.weight_kg : (parseFloat(r.weight_kg)||0),
    reps: typeof r.reps === 'number' ? r.reps : (parseInt(r.reps)||0),
    dur: typeof r.duration_seconds === 'number' ? r.duration_seconds : (parseFloat(r.duration_seconds)||0),
    dist: typeof r.distance_km === 'number' ? r.distance_km : (parseFloat(r.distance_km)||0),
    rpe: typeof r.rpe === 'number' ? r.rpe : (parseFloat(r.rpe)||0),
    muscle: muscleOf(r.exercise_title)
  })).filter(r => r.date);
  if(!raw.length){ document.getElementById('fileMeta').textContent = 'Geen bruikbare sets met datum gevonden.'; toast('Geen bruikbare sets gevonden'); return false; }

  buildSessions();
  computeExTypes();
  currentMeta = {name, demo};
  if(persist) saveData(name, text, demo);
  setPeriod('all');
  showLoaded();
  initAfterLoad();
  return true;
}

async function clearAll(){
  await idbDel(KEY).catch(()=>{});
  raw = []; sessions = []; maxDate = null; currentEx = ''; exTypes = new Map();
  Object.keys(charts).forEach(k=>{ charts[k].destroy(); delete charts[k]; });
  fileInput.value = '';
  document.getElementById('fileMeta').textContent = 'Nog geen bestand geladen';
  showEmpty();
  toast('Data gewist');
}

function showLoaded(){
  hero.style.display='none';
  appEl.style.display='block';
  periodsEl.style.display='flex';
  dataBar.style.display='flex';
  document.getElementById('dataActs').setAttribute('hidden','');   // standaard ingeklapt zodra data geladen is
  document.getElementById('dataToggle').setAttribute('aria-expanded','false');
  document.getElementById('dbName').textContent = currentMeta.name + (currentMeta.demo ? '  ·  voorbeeld' : '');
  const range = sessions.length ? `${fmtD(sessions[0].date)} – ${fmtD(maxDate)}` : '';
  document.getElementById('dbMeta').textContent = `${sessions.length} workouts · ${raw.length.toLocaleString('nl-NL')} sets · ${range}`;
}
function showEmpty(){
  hero.style.display='block';
  dataBar.style.display='none';
  appEl.style.display='none';
  periodsEl.style.display='none';
}

function buildSessions(){
  const map = new Map();
  raw.forEach(r => {
    const key = r.start_time + '|' + r.title;
    if(!map.has(key)) map.set(key, {title:r.title, date:r.date, end:r.end, sets:[]});
    map.get(key).sets.push(r);
  });
  sessions = [...map.values()].sort((a,b)=>a.date-b.date);
  maxDate = sessions.length ? sessions[sessions.length-1].date : new Date();
}

/* ---------------- periode-filter ---------------- */
function periodStart(){
  if(period==='all') return new Date(0);
  const d = new Date(maxDate);
  if(period==='1m') d.setMonth(d.getMonth()-1);
  if(period==='3m') d.setMonth(d.getMonth()-3);
  if(period==='6m') d.setMonth(d.getMonth()-6);
  if(period==='1y') d.setFullYear(d.getFullYear()-1);
  if(period==='2y') d.setFullYear(d.getFullYear()-2);
  return d;
}
const fRaw = () => raw.filter(r => r.date >= periodStart());
const fSessions = () => sessions.filter(s => s.date >= periodStart());

function setPeriod(p){
  period = p;
  document.querySelectorAll('#periods button').forEach(x=>x.classList.toggle('active', x.dataset.p===p));
}
document.querySelectorAll('#periods button').forEach(b=>{
  b.addEventListener('click', ()=>{ setPeriod(b.dataset.p); renderAll(); });
});

/* ---------------- tabs / navigatie ---------------- */
const tabsEl = document.getElementById('tabs');
tabsEl.setAttribute('role','tablist');
function updateTabFades(){
  const maxL = tabsEl.scrollWidth - tabsEl.clientWidth;
  tabsEl.classList.toggle('fade-left', tabsEl.scrollLeft > 4);
  tabsEl.classList.toggle('fade-right', maxL > 4 && tabsEl.scrollLeft < maxL - 4);
}
function activateTab(name, {push=true, scroll=true}={}){
  const btn = document.querySelector(`#tabs button[data-tab="${name}"]`);
  const sec = document.getElementById('tab-'+name);
  if(!btn || !sec) return;
  document.querySelectorAll('#tabs button').forEach(x=>{ const on=x===btn; x.classList.toggle('active',on); x.setAttribute('aria-selected', on?'true':'false'); });
  document.querySelectorAll('section.tab').forEach(s=>s.classList.remove('show'));
  sec.classList.add('show');
  btn.scrollIntoView({inline:'center', block:'nearest'});            // gekozen tab altijd in beeld
  if(scroll){                                                        // begin bovenaan de nieuwe tab
    const top = tabsEl.getBoundingClientRect().top + window.scrollY;
    if(window.scrollY > top) window.scrollTo({top, behavior:'instant'});
  }
  if(push && location.hash !== '#'+name) history.pushState({tab:name}, '', '#'+name);
  requestAnimationFrame(()=>{ updateTabFades(); Object.values(charts).forEach(c=>{ try{c.resize();}catch(e){} }); });
}
document.querySelectorAll('#tabs button').forEach(b=>{
  b.setAttribute('role','tab');
  b.setAttribute('aria-selected', b.classList.contains('active')?'true':'false');
  b.addEventListener('click', ()=>activateTab(b.dataset.tab, {push:true}));
});
tabsEl.addEventListener('scroll', updateTabFades, {passive:true});
window.addEventListener('resize', updateTabFades);
// Android/desktop terug-knop navigeert tussen tabs i.p.v. de app te sluiten
window.addEventListener('popstate', ()=>{
  const name=(location.hash||'').replace('#','')||'overzicht';
  if(document.getElementById('tab-'+name)) activateTab(name, {push:false});
});
// logo = terug naar boven
const brandEl=document.querySelector('header .brand');
if(brandEl){ brandEl.style.cursor='pointer'; brandEl.title='Naar boven'; brandEl.addEventListener('click', ()=>window.scrollTo({top:0, behavior:'smooth'})); }
// spiergroep-modus: alle werksets vs. harde sets
document.querySelectorAll('#muscleModeChips .chip').forEach(c=>c.addEventListener('click', ()=>{
  muscleMode = c.dataset.mode;
  document.querySelectorAll('#muscleModeChips .chip').forEach(x=>x.classList.toggle('active', x===c));
  renderSpieren();
}));

/* ---------------- init na laden ---------------- */
function initAfterLoad(){
  const counts = new Map(), lastUsed = new Map();
  raw.forEach(r => {
    counts.set(r.exercise_title, (counts.get(r.exercise_title)||0)+1);
    const t=r.date.getTime(); if(t > (lastUsed.get(r.exercise_title)||0)) lastUsed.set(r.exercise_title, t);
  });
  const recent = [...lastUsed.entries()].sort((a,b)=>b[1]-a[1]).map(e=>e[0]);   // laatst gebruikte eerst
  const dl = document.getElementById('exList'); dl.innerHTML='';
  [...counts.keys()].sort().forEach(n=>{ const o=document.createElement('option'); o.value=n; dl.appendChild(o); });
  const chips = document.getElementById('exChips'); chips.innerHTML='';
  recent.slice(0,8).forEach(n=>{
    const c=document.createElement('button'); c.className='chip'; c.textContent=n;
    c.addEventListener('click',()=>{ currentEx=n; document.getElementById('exInput').value=n; renderProgressie(); markChip(); });
    chips.appendChild(c);
  });
  currentEx = recent[0] || [...counts.keys()][0] || '';
  document.getElementById('exInput').value = currentEx;
  markChip();
  renderAll();
  genPlan();
  updateTabFades();
  // tab herstellen uit de URL (#tab) zodat herladen/terug-knop op dezelfde tab blijft
  const startTab=(location.hash||'').replace('#','');
  if(startTab && document.getElementById('tab-'+startTab)) activateTab(startTab, {push:false, scroll:false});
}
function markChip(){
  document.querySelectorAll('#exChips .chip').forEach(c=>c.classList.toggle('active', c.textContent===currentEx));
}
document.getElementById('exInput').addEventListener('change', e=>{
  if([...document.getElementById('exList').options].some(o=>o.value===e.target.value)){
    currentEx = e.target.value; renderProgressie(); markChip();
  }
});
document.getElementById('prSearch').addEventListener('input', renderPRs);
document.getElementById('bwInput').addEventListener('input', renderBenchmark);
document.getElementById('ageInput').addEventListener('input', renderBenchmark);
document.getElementById('sexInput').addEventListener('change', renderBenchmark);
document.querySelectorAll('#tab-prs th.sortable').forEach(th=>{
  th.addEventListener('click', ()=>{
    const k = th.dataset.k;
    prSort = prSort.k===k ? {k, dir:-prSort.dir} : {k, dir:k==='name'?1:-1};
    renderPRs();
  });
});

function renderAll(){
  renderOverzicht();
  renderProgressie();
  renderPRs();
  renderSpieren();
  renderSuggesties();
  renderBenchmark();
}

/* ---------------- chart helper ---------------- */
function makeChart(id, cfg){
  if(charts[id]) charts[id].destroy();
  charts[id] = new Chart(document.getElementById(id), cfg);
}
const gridOpts = {grid:{color:'#262B35'}, ticks:{maxRotation:0}};

/* ---------------- OVERZICHT ---------------- */
function renderOverzicht(){
  const S = fSessions(), R = fRaw();
  const work = R.filter(isWork).filter(r=>r.weight_kg>0&&r.reps>0);
  const vol = work.reduce((a,r)=>a+r.weight_kg*r.reps,0);
  const workSets = R.filter(r=>isWork(r)&&r.reps>0).length;   // incl. lichaamsgewicht-oefeningen
  let mins = 0;
  S.forEach(s=>{ if(s.end&&s.date){ const m=(s.end-s.date)/6e4; if(m>0&&m<360) mins+=m; }});
  const startRef = S.length ? S[0].date : maxDate;
  const weeks = Math.max(1,(maxDate - startRef)/(7*864e5));
  document.getElementById('kWorkouts').textContent = S.length;
  document.getElementById('kVolume').textContent = vol>=1e6 ? (vol/1e6).toLocaleString('nl-NL',{maximumFractionDigits:2})+'M kg' : fmtKg(vol);
  document.getElementById('kSets').textContent = workSets.toLocaleString('nl-NL');
  document.getElementById('kHours').textContent = Math.round(mins/60)+' u';
  document.getElementById('kFreq').textContent = (S.length/weeks).toLocaleString('nl-NL',{maximumFractionDigits:1});

  // weekaggregatie
  const byWeek = new Map();
  S.forEach(s=>{
    const k = weekStart(s.date).getTime();
    if(!byWeek.has(k)) byWeek.set(k,{n:0,vol:0});
    const o = byWeek.get(k); o.n++;
    s.sets.forEach(r=>{ if(isWork(r)&&r.weight_kg>0&&r.reps>0) o.vol += r.weight_kg*r.reps; });
  });
  const keys=[...byWeek.keys()].sort((a,b)=>a-b);
  const labels=[], freq=[], wvol=[];
  if(keys.length){
    // per week ophogen via setDate (DST-veilig: vaste ms-stappen lopen mis bij zomertijd)
    const d=new Date(keys[0]); const endT=keys[keys.length-1];
    for(let guard=0; d.getTime()<=endT && guard<1040; guard++){
      const o=byWeek.get(d.getTime())||{n:0,vol:0};
      labels.push(d.toLocaleDateString('nl-NL',{day:'numeric',month:'short'}));
      freq.push(o.n); wvol.push(Math.round(o.vol));
      d.setDate(d.getDate()+7);
    }
  }
  const thin = labels.length>40;
  const maxFreq = Math.max(0,...freq);
  const freqYmax = maxFreq>=7 ? maxFreq : Math.min(maxFreq+1, 7);   // altijd +1 boven de hoogste staaf, max 7
  makeChart('chFreq',{type:'bar',data:{labels,datasets:[{data:freq,backgroundColor:PLATE.blue,borderRadius:3}]},
    options:{maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{...gridOpts,ticks:{maxRotation:0,autoSkip:true,maxTicksLimit:thin?10:20}},y:{...gridOpts,beginAtZero:true,max:freqYmax,ticks:{stepSize:1}}}}});
  makeChart('chWeekVol',{type:'line',data:{labels,datasets:[{data:wvol,borderColor:PLATE.yellow,backgroundColor:'rgba(240,180,41,.12)',fill:true,pointRadius:0,tension:.3,borderWidth:2}]},
    options:{maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{...gridOpts,ticks:{autoSkip:true,maxTicksLimit:thin?10:20}},y:{...gridOpts,beginAtZero:true}}}});

  // dag vd week
  const dows=[0,0,0,0,0,0,0];
  S.forEach(s=>dows[(s.date.getDay()+6)%7]++);
  makeChart('chDow',{type:'bar',data:{labels:['ma','di','wo','do','vr','za','zo'],datasets:[{data:dows,backgroundColor:[PLATE.red,PLATE.blue,PLATE.yellow,PLATE.green,'#9C6ADE','#5BC8D8',PLATE.white],borderRadius:4}]},
    options:{maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:gridOpts,y:{...gridOpts,beginAtZero:true}}}});

  // duur per maand
  const byMonth=new Map();
  S.forEach(s=>{ if(s.end){ const m=(s.end-s.date)/6e4; if(m>0&&m<360){ const k=s.date.getFullYear()+'-'+String(s.date.getMonth()+1).padStart(2,'0'); if(!byMonth.has(k))byMonth.set(k,[]); byMonth.get(k).push(m);}}});
  const mk=[...byMonth.keys()].sort();
  makeChart('chDur',{type:'line',data:{labels:mk.map(k=>{const[y,m]=k.split('-');return new Date(y,m-1).toLocaleDateString('nl-NL',{month:'short',year:'2-digit'})}),
    datasets:[{data:mk.map(k=>Math.round(byMonth.get(k).reduce((a,b)=>a+b,0)/byMonth.get(k).length)),borderColor:PLATE.green,pointRadius:2,tension:.3,borderWidth:2}]},
    options:{maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{...gridOpts,ticks:{autoSkip:true,maxTicksLimit:14}},y:{...gridOpts,beginAtZero:true}}}});

  // recente PR's (laatste 30 dagen vd data, t.o.v. hele historie) — werkt voor elk meettype
  const prEvents=[];
  const bestSoFar=new Map();
  const cutoff=new Date(maxDate); cutoff.setDate(cutoff.getDate()-30);
  raw.slice().sort((a,b)=>a.date-b.date).forEach(r=>{
    if(!isWork(r))return;
    const t=exType(r.exercise_title);
    const sc=setScore(r,t); if(!(sc>0))return;
    const prev=bestSoFar.get(r.exercise_title)||0;
    if(sc>prev){ bestSoFar.set(r.exercise_title,sc);
      if(r.date>=cutoff && prev>0) prEvents.push({date:r.date,ex:r.exercise_title,setStr:fmtSet(r,t),badge:fmtScore(sc,t)});
    }
  });
  const prB=document.getElementById('recentPrBody');
  prB.innerHTML = prEvents.length ? prEvents.sort((a,b)=>b.date-a.date).slice(0,10).map(p=>
    `<tr><td>${fmtD(p.date)}</td><td>${p.ex}</td><td class="num">${p.setStr}</td><td class="num"><span class="badge pr">${p.badge}</span></td></tr>`
  ).join('') : '<tr><td colspan="4" class="empty">Geen nieuwe records in de laatste 30 dagen.</td></tr>';

  // recente workouts
  const woB=document.getElementById('recentWoBody');
  woB.innerHTML = S.slice(-8).reverse().map(s=>{
    const ws=s.sets.filter(r=>isWork(r)&&r.reps>0);
    const v=s.sets.reduce((a,r)=>a+(isWork(r)&&r.weight_kg>0&&r.reps>0? r.weight_kg*r.reps : 0),0);
    const dur=s.end?Math.round((s.end-s.date)/6e4):null;
    return `<tr><td>${fmtD(s.date)}</td><td>${s.title}</td><td class="num">${ws.length}</td><td class="num">${fmtKg(v)}</td><td class="num">${dur&&dur>0&&dur<360?dur+' min':'–'}</td></tr>`;
  }).join('') || '<tr><td colspan="5" class="empty">Geen workouts in deze periode.</td></tr>';
}

/* ---------------- PROGRESSIE ---------------- */
function renderProgressie(){
  if(!currentEx) return;
  const t = exType(currentEx);
  const lab = typeLabels(t);
  const R = fRaw().filter(r=>r.exercise_title===currentEx);
  const work = R.filter(r=>isWork(r)&&validForType(r,t));

  // per sessie aggregeren
  const byS=new Map();
  work.forEach(r=>{
    const k=r.date.getTime();
    if(!byS.has(k)) byS.set(k,{date:r.date,mag:-1,topR:null,score:0,vol:0,sets:0});
    const o=byS.get(k);
    const mg=setMag(r,t);
    if(mg>o.mag || (mg===o.mag && t==='weight' && r.reps>(o.topR?o.topR.reps:0))){ o.mag=mg; o.topR=r; }
    o.score=Math.max(o.score,setScore(r,t));
    o.vol+=setVolT(r,t); o.sets++;
  });
  const sess=[...byS.values()].sort((a,b)=>a.date-b.date);

  const maxMag=Math.max(0,...work.map(r=>setMag(r,t)));
  const best=Math.max(0,...work.map(r=>setScore(r,t)));
  const total=work.reduce((a,r)=>a+setVolT(r,t),0);
  setKpiLabel('eMaxW', lab.top); setKpiLabel('e1RM', lab.best);
  document.getElementById('eMaxW').textContent = maxMag ? (t==='weight'? maxMag+' kg' : fmtScore(maxMag,t)) : '–';
  document.getElementById('e1RM').textContent  = t==='weight' ? (best? Math.round(best)+' kg':'–') : (total? fmtVolT(total,t):'–');
  document.getElementById('eSets').textContent = work.length;

  const t6=new Date(maxDate); t6.setDate(t6.getDate()-42);
  const trPts=sess.filter(s=>s.date>=t6&&s.score>0).map(s=>({t:s.date.getTime(),v:s.score}));
  const tr=trendInfo(trPts);
  const tEl=document.getElementById('eTrend');
  if(tr){ const d=tr.pct;
    tEl.textContent=(d>=0?'+':'')+d.toFixed(1)+'%';
    tEl.style.color=d>1?'#5FD49B':(d<-1?'#FF8C8C':'#F0C75E');   // brede dode zone i.v.m. meetruis
  } else { tEl.textContent='–'; tEl.style.color=''; }

  const labels=sess.map(s=>fmtD(s.date));
  const progDatasets = t==='weight'
    ? [ {label:'Topgewicht',data:sess.map(s=>s.mag),borderColor:PLATE.red,pointRadius:2,tension:.25,borderWidth:2},
        {label:'e1RM',data:sess.map(s=>Math.round(s.score*10)/10),borderColor:PLATE.blue,borderDash:[5,4],pointRadius:0,tension:.25,borderWidth:2} ]
    : [ {label:lab.top,data:sess.map(s=>Math.round(s.mag*100)/100),borderColor:PLATE.red,pointRadius:2,tension:.25,borderWidth:2} ];
  makeChart('chProg',{type:'line',data:{labels,datasets:progDatasets},
    options:{maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{display:t==='weight',labels:{boxWidth:18,font:{family:"'Archivo'",size:12}}},
        tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${fmtScore(c.parsed.y,t)}`}}},
      scales:{x:{...gridOpts,ticks:{autoSkip:true,maxTicksLimit:12}},y:{...gridOpts}}}});

  makeChart('chExVol',{type:'bar',data:{labels,datasets:[{data:sess.map(s=>Math.round(s.vol*100)/100),backgroundColor:PLATE.green,borderRadius:3}]},
    options:{maintainAspectRatio:false,plugins:{legend:{display:false},
      tooltip:{callbacks:{label:c=>fmtVolT(c.parsed.y,t)}}},
      scales:{x:{...gridOpts,ticks:{autoSkip:true,maxTicksLimit:12}},y:{...gridOpts,beginAtZero:true}}}});

  // rep-tabel (alleen zinvol voor gewicht-oefeningen)
  const rt=document.getElementById('repTable');
  if(t!=='weight'){
    rt.innerHTML='<tr><td colspan="4" class="empty">Rep-doelen gelden alleen voor gewicht-oefeningen.</td></tr>';
  } else if(best>=15){
    const zones=p=>p>=90?['Kracht','pr']:(p>=75?['Hypertrofie','up']:['Volume/techniek','flat']);
    const step=best>100?10:5;
    let rows='';
    for(let w=Math.floor(best/step)*step; w>=best*0.55; w-=step){
      const p=w/best*100;
      const reps=Math.max(1,Math.round(30*(best/w-1)));
      const [z,cls]=zones(p);
      rows+=`<tr><td class="num">${w} kg</td><td class="num">${Math.round(p)}%</td><td class="num">${p>=97?'1':reps}</td><td><span class="badge ${cls}">${z}</span></td></tr>`;
    }
    rt.innerHTML=rows;
  } else rt.innerHTML='<tr><td colspan="4" class="empty">Te weinig data voor rep-doelen.</td></tr>';

  // geschiedenis
  document.getElementById('histBody').innerHTML = sess.slice(-12).reverse().map((s,i,arr)=>{
    const prevS=arr[i+1];
    let badge='';
    if(prevS){ const d=s.score-prevS.score, tol=Math.max(0.4,prevS.score*0.004);
      if(d>tol) badge='<span class="badge up">▲</span>'; else if(d<-tol) badge='<span class="badge pr">▼</span>'; else badge='<span class="badge flat">＝</span>'; }
    return `<tr><td>${fmtD(s.date)}</td><td class="num">${s.topR?fmtSet(s.topR,t):'–'}</td><td class="num">${fmtScore(s.score,t)}</td><td class="num">${s.sets}</td><td class="num">${fmtVolT(s.vol,t)}</td><td>${badge}</td></tr>`;
  }).join('') || '<tr><td colspan="6" class="empty">Geen sessies in deze periode.</td></tr>';
}

/* ---------------- PR'S ---------------- */
function renderPRs(){
  const q=document.getElementById('prSearch').value.toLowerCase();
  const map=new Map();
  fRaw().forEach(r=>{
    if(!isWork(r))return;
    const t=exType(r.exercise_title);
    if(!validForType(r,t))return;
    if(!map.has(r.exercise_title)) map.set(r.exercise_title,{name:r.exercise_title,type:t,mag:0,magR:null,score:0,scoreR:null,date:null,sets:0,sessDates:new Set()});
    const o=map.get(r.exercise_title);
    o.sets++; o.sessDates.add(r.date.getTime());
    const mg=setMag(r,t); if(mg>o.mag || (mg===o.mag && t==='weight' && r.reps>(o.magR?o.magR.reps:0))){o.mag=mg;o.magR=r;}
    const sc=setScore(r,t); if(sc>o.score){o.score=sc;o.scoreR=r;o.date=r.date;}
  });
  let rows=[...map.values()].map(o=>({...o,sessions:o.sessDates.size,maxW:o.mag,e1rm:o.score}));
  if(q) rows=rows.filter(o=>o.name.toLowerCase().includes(q));
  rows.sort((a,b)=>{
    const k=prSort.k;
    if(k==='name') return prSort.dir*a.name.localeCompare(b.name);
    if(k==='date') return prSort.dir*((a.date?.getTime()||0)-(b.date?.getTime()||0));
    return prSort.dir*((a[k]||0)-(b[k]||0));
  });
  document.querySelectorAll('#tab-prs th.sortable').forEach(th=>th.classList.toggle('sorted', th.dataset.k===prSort.k));
  document.getElementById('prBody').innerHTML = rows.map(o=>{
    const magLabel = o.magR ? fmtSet(o.magR,o.type) : '–';
    const lowConf = o.type==='weight' && o.scoreR && o.scoreR.reps>12;   // e1RM uit >12 reps = minder betrouwbaar
    const scoreLabel = fmtScore(o.score,o.type) + (lowConf?'<span style="color:var(--plate-yellow);cursor:help" title="Geschat uit meer dan 12 reps — minder betrouwbaar">*</span>':'');
    const extra = (o.type==='weight' && o.scoreR) ? ` <span style="color:var(--muted)">(${fmtSet(o.scoreR,o.type)})</span>` : '';
    return `<tr><td>${o.name}</td><td class="num">${magLabel}</td><td class="num"><b>${scoreLabel}</b>${extra}</td><td>${o.date?fmtD(o.date):'–'}</td><td class="num">${o.sessions}</td><td class="num">${o.sets}</td></tr>`;
  }).join('') || '<tr><td colspan="6" class="empty">Niets gevonden.</td></tr>';
}

/* ---------------- SPIERGROEPEN ---------------- */
const BODY_SVG = `<svg viewBox="0 0 340 400" class="bodyfig" aria-label="Spier-heatmap">
<defs>
<!-- rechter-helft spiervormen (gespiegeld voor links) -->
<path id="m-delt" d="M15 1 C6 0 -1 7 0 17 C1 26 10 31 19 28 C27 24 28 12 24 4 C22 1 18 1 15 1 Z"/>
<path id="m-pec" d="M0 1 C15 -2 31 1 33 12 C34 23 28 33 16 33 C8 27 2 17 0 5 Z"/>
<path id="m-bi" d="M7 0 C14 3 15 16 13 30 C12 38 6 42 4 39 C-1 28 -1 9 3 2 C4 0 6 0 7 0 Z"/>
<path id="m-obl" d="M0 0 C7 1 11 10 9 22 C7 29 1 31 -2 26 C-3 14 -3 3 0 0 Z"/>
<path id="m-quad" d="M12 0 C23 4 26 28 24 58 C23 80 14 98 7 98 C1 90 -1 54 0 30 C1 12 6 3 12 0 Z"/>
<path id="m-vm" d="M2 0 C9 2 11 11 8 18 C5 23 0 21 -1 14 C-1 6 0 1 2 0 Z"/>
<path id="m-trap" d="M2 0 C13 -3 29 -3 39 0 C34 14 25 26 19 34 C13 26 5 14 2 0 Z"/>
<path id="m-lat" d="M2 0 C20 3 30 22 27 48 C25 62 12 68 3 62 C0 40 -1 18 2 0 Z"/>
<path id="m-teres" d="M3 0 C10 0 13 6 11 13 C9 18 2 18 0 13 C-1 6 0 1 3 0 Z"/>
<path id="m-lowb" d="M2 0 C9 -1 14 3 14 11 C14 21 9 27 5 25 C1 17 -1 8 2 0 Z"/>
<path id="m-glute" d="M2 3 C16 -2 32 3 32 18 C32 32 20 39 10 34 C1 25 -2 14 2 3 Z"/>
<path id="m-ham" d="M10 0 C19 3 21 24 20 50 C19 68 11 80 7 80 C1 74 -1 44 1 22 C2 10 6 2 10 0 Z"/>
<path id="m-calf" d="M10 1 C18 7 19 26 15 46 C13 57 7 61 5 57 C-1 42 -1 18 4 5 C6 2 9 0 10 1 Z"/>
<!-- neutrale delen -->
<path id="n-arm" d="M11 0 C25 1 30 12 27 28 C25 56 20 94 16 124 C15 134 21 140 16 148 C6 150 0 142 1 130 C2 94 -2 42 3 18 C3 6 6 0 11 0 Z"/>
<path id="n-leg" d="M12 0 C27 0 33 9 30 22 C29 80 23 144 17 200 C16 212 21 220 15 224 C5 226 1 214 2 200 C2 144 -2 80 3 20 C2 6 6 0 12 0 Z"/>
<path id="n-torso" d="M54 54 C72 44 98 44 116 54 C125 72 118 116 113 138 C110 154 99 164 85 164 C71 164 60 154 57 138 C52 116 45 72 54 54 Z"/>
</defs>
<g class="fig">
 <!-- VOORKANT -->
 <ellipse cx="85" cy="25" rx="14" ry="17" class="body"/>
 <path d="M78 41 h14 v11 q-7 5 -14 0 Z" class="body"/>
 <use href="#n-arm" transform="translate(120,58)" class="body"/>
 <use href="#n-arm" transform="matrix(-1 0 0 1 50 58)" class="body"/>
 <use href="#n-torso" class="body"/>
 <use href="#n-leg" transform="translate(86,162)" class="body"/>
 <use href="#n-leg" transform="matrix(-1 0 0 1 84 162)" class="body"/>
 <use href="#m-delt" transform="translate(104,50)" class="mh" data-m="Schouders"/>
 <use href="#m-delt" transform="matrix(-1 0 0 1 66 50)" class="mh" data-m="Schouders"/>
 <use href="#m-pec" transform="translate(85,62)" class="mh" data-m="Borst"/>
 <use href="#m-pec" transform="matrix(-1 0 0 1 85 62)" class="mh" data-m="Borst"/>
 <use href="#m-bi" transform="translate(127,88)" class="mh" data-m="Biceps"/>
 <use href="#m-bi" transform="matrix(-1 0 0 1 43 88)" class="mh" data-m="Biceps"/>
 <use href="#m-obl" transform="translate(97,104)" class="mh" data-m="Core"/>
 <use href="#m-obl" transform="matrix(-1 0 0 1 73 104)" class="mh" data-m="Core"/>
 <rect x="74" y="96" width="22" height="62" rx="7" class="mh" data-m="Core"/>
 <path d="M85 98 V156 M74 112 H96 M74 128 H96 M74 144 H96" class="seam" fill="none"/>
 <use href="#m-quad" transform="translate(87,166)" class="mh" data-m="Quads"/>
 <use href="#m-quad" transform="matrix(-1 0 0 1 83 166)" class="mh" data-m="Quads"/>
 <use href="#m-vm" transform="translate(89,248)" class="mh" data-m="Quads"/>
 <use href="#m-vm" transform="matrix(-1 0 0 1 81 248)" class="mh" data-m="Quads"/>
 <path class="seam" fill="none" d="M85 64 V94 M78 76 q7 3 14 0 M100 172 V256 M70 172 V256"/>
 <text x="85" y="394" text-anchor="middle" class="figlabel">Voorkant</text>
</g>
<g class="fig" transform="translate(170,0)">
 <!-- ACHTERKANT -->
 <ellipse cx="85" cy="25" rx="14" ry="17" class="body"/>
 <path d="M78 41 h14 v11 q-7 5 -14 0 Z" class="body"/>
 <use href="#n-arm" transform="translate(120,58)" class="body"/>
 <use href="#n-arm" transform="matrix(-1 0 0 1 50 58)" class="body"/>
 <use href="#n-torso" class="body"/>
 <use href="#n-leg" transform="translate(86,162)" class="body"/>
 <use href="#n-leg" transform="matrix(-1 0 0 1 84 162)" class="body"/>
 <use href="#m-delt" transform="translate(104,50)" class="mh" data-m="Schouders"/>
 <use href="#m-delt" transform="matrix(-1 0 0 1 66 50)" class="mh" data-m="Schouders"/>
 <use href="#m-trap" transform="translate(66,52)" class="mh" data-m="Rug"/>
 <use href="#m-teres" transform="translate(106,74)" class="mh" data-m="Rug"/>
 <use href="#m-teres" transform="matrix(-1 0 0 1 64 74)" class="mh" data-m="Rug"/>
 <use href="#m-lat" transform="translate(87,80)" class="mh" data-m="Rug"/>
 <use href="#m-lat" transform="matrix(-1 0 0 1 83 80)" class="mh" data-m="Rug"/>
 <use href="#m-lowb" transform="translate(87,124)" class="mh" data-m="Rug"/>
 <use href="#m-lowb" transform="matrix(-1 0 0 1 83 124)" class="mh" data-m="Rug"/>
 <use href="#m-bi" transform="translate(127,88)" class="mh" data-m="Triceps"/>
 <use href="#m-bi" transform="matrix(-1 0 0 1 43 88)" class="mh" data-m="Triceps"/>
 <use href="#m-glute" transform="translate(87,152)" class="mh" data-m="Hamstrings/Glutes"/>
 <use href="#m-glute" transform="matrix(-1 0 0 1 83 152)" class="mh" data-m="Hamstrings/Glutes"/>
 <use href="#m-ham" transform="translate(88,186)" class="mh" data-m="Hamstrings/Glutes"/>
 <use href="#m-ham" transform="matrix(-1 0 0 1 82 186)" class="mh" data-m="Hamstrings/Glutes"/>
 <use href="#m-calf" transform="translate(90,266)" class="mh" data-m="Kuiten"/>
 <use href="#m-calf" transform="matrix(-1 0 0 1 80 266)" class="mh" data-m="Kuiten"/>
 <path class="seam" fill="none" d="M85 54 V134 M100 270 V326 M70 270 V326"/>
 <text x="85" y="394" text-anchor="middle" class="figlabel">Achterkant</text>
</g>
</svg>`;
function renderSpieren(){
  const useHard = muscleMode==='hard';
  const ok = r => isWork(r) && r.reps>0 && (!useHard || isHardSet(r));
  const R = fRaw().filter(ok);
  const workAll = fRaw().filter(r=>isWork(r)&&r.reps>0);
  const rpeShare = workAll.length ? workAll.filter(r=>r.rpe>0).length/workAll.length : 0;

  // ---- lichaam-heatmap (periode, secundaire spieren tellen 0,5 mee) ----
  const totals = muscleSetCounts(R);
  const maxT = Math.max(1, ...totals.values());
  const heat = document.getElementById('bodyHeat');
  heat.innerHTML = BODY_SVG
    + `<div class="heatleg"><span>weinig</span><span class="bar"></span><span>veel</span></div>`
    + `<div class="mtotals">${[...totals.entries()].filter(([m])=>m!=='Cardio'&&m!=='Overig').sort((a,b)=>b[1]-a[1]).map(([m,v])=>`<span>${m} <b>${Math.round(v)}</b></span>`).join('')||'<span>Geen sets</span>'}</div>`;
  heat.querySelectorAll('.mh').forEach(el=>{
    const m=el.getAttribute('data-m'), v=totals.get(m)||0;
    el.style.fill=heatColor(v/maxT);
    el.setAttribute('title', `${m}: ${Math.round(v)} sets`);
  });

  // ---- weekraster (laatste 8 weken × spiergroep) ----
  const wkKeys=[];
  for(let i=7;i>=0;i--){ const d=new Date(weekStart(maxDate)); d.setDate(d.getDate()-7*i); wkKeys.push(d.getTime()); }
  const order=Object.keys(MUSCLE_COLORS).filter(g=>g!=='Overig'&&g!=='Cardio');
  const cellMap={}; order.forEach(g=>cellMap[g]=wkKeys.map(()=>0));
  raw.filter(ok).forEach(r=>{
    const idx=wkKeys.indexOf(weekStart(r.date).getTime()); if(idx<0) return;
    muscleContribs(r.exercise_title).forEach(c=>{ if(cellMap[c.m]) cellMap[c.m][idx]+=c.w; });
  });
  const present=order.filter(g=>cellMap[g].some(v=>v>0));
  const maxCell=Math.max(1, ...present.flatMap(g=>cellMap[g]));
  const colHead=wkKeys.map(t=>`<div class="h">${new Date(t).toLocaleDateString('nl-NL',{day:'numeric',month:'short'})}</div>`).join('');
  const bodyRows=present.map(g=>{
    const cells=cellMap[g].map(v=>{ const n=Math.round(v);
      return `<div class="cell${v?'':' z'}" style="background:${v?heatColor(v/maxCell):'#20242C'}" title="${g}: ${n} sets">${n||''}</div>`; }).join('');
    return `<div class="lbl"><span class="dot" style="background:${MUSCLE_COLORS[g]}"></span>${g}</div>${cells}`;
  }).join('');
  document.getElementById('muscleWeekGrid').innerHTML = present.length
    ? `<div class="mgrid" style="grid-template-columns:minmax(96px,auto) repeat(${wkKeys.length},minmax(30px,1fr))"><div class="lbl"></div>${colHead}${bodyRows}</div>`
      + (useHard&&rpeShare<0.5?`<p class="sub" style="margin:10px 0 0">Let op: maar ${Math.round(rpeShare*100)}% van je sets heeft een RPE genoteerd — "harde sets" is dan onvolledig.</p>`:'')
    : '<p class="empty">Geen sets in deze weergave.</p>';

  // ---- verdeling donut (gewogen) ----
  const entries=[...totals.entries()].filter(([m])=>m!=='Cardio'&&m!=='Overig').sort((a,b)=>b[1]-a[1]);
  makeChart('chMuscleShare',{type:'doughnut',
    data:{labels:entries.map(e=>e[0]),datasets:[{data:entries.map(e=>Math.round(e[1])),backgroundColor:entries.map(e=>MUSCLE_COLORS[e[0]]||'#4A5160'),borderColor:'#1C1F26',borderWidth:2}]},
    options:{maintainAspectRatio:false,cutout:'55%',plugins:{legend:{position:'right',labels:{boxWidth:12,font:{family:"'Archivo'",size:11.5}}}}}});

  // push/pull (schouders meegerekend: voorkant = push, achterkant = pull)
  let push=0,pull=0;
  R.forEach(r=>{
    if(PUSH.has(r.muscle)) push++;
    else if(PULL.has(r.muscle)) pull++;
    else if(r.muscle==='Schouders'){ isRearDelt(r.exercise_title) ? pull++ : push++; }
  });
  const ratio=pull?push/pull:0;
  let verdict='Redelijk in balans. Let op: dit is een vuistregel — er is geen bewijs voor één "juiste" ratio.';
  if(ratio>1.25) verdict='Relatief veel duwwerk — extra trekvolume kan geen kwaad (veel coaches mikken zelfs op ~2× meer trekken dan duwen).';
  else if(ratio<0.8) verdict='Relatief veel trekwerk — voor de meeste doelen prima; vul duwen aan naar smaak.';
  const pPct=push+pull?Math.round(push/(push+pull)*100):50;
  document.getElementById('ppBalance').innerHTML=`
    <div style="display:flex;gap:18px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
      <div><span style="font-family:var(--mono);font-size:22px;color:${PLATE.red}">${push}</span> <span style="color:var(--muted);font-size:12px">PUSH-SETS</span></div>
      <div><span style="font-family:var(--mono);font-size:22px;color:${PLATE.blue}">${pull}</span> <span style="color:var(--muted);font-size:12px">PULL-SETS</span></div>
      <div><span style="font-family:var(--mono);font-size:22px">${ratio.toFixed(2)}</span> <span style="color:var(--muted);font-size:12px">RATIO</span></div>
    </div>
    <div class="meter" style="background:${PLATE.blue}"><i style="width:${pPct}%;background:${PLATE.red}"></i></div>
    <p style="color:var(--muted);font-size:13px;margin:10px 0 0">${verdict}</p>`;
}

/* ---------------- SUGGESTIES ---------------- */
function plateHtml(target){
  const per=(target-20)/2;
  if(per<=0||target<30) return '';
  const sizes=[[25,PLATE.red,30],[20,PLATE.blue,27],[15,PLATE.yellow,24],[10,PLATE.green,20],[5,PLATE.white,16],[2.5,'#9C6ADE',13],[1.25,'#8B93A5',11]];
  let rest=per, out=[];
  sizes.forEach(([w,c,h])=>{ while(rest>=w-0.001){ out.push(`<i style="width:7px;height:${h}px;background:${c}" title="${w} kg"></i>`); rest-=w; } });
  if(out.length===0||rest>0.6) return '';
  return `<div class="plates"><span class="bar"></span>${out.join('')}<span class="lab">${per.toLocaleString('nl-NL')} kg per kant (20 kg stang)</span></div>`;
}

function renderSuggesties(){
  const box=document.getElementById('suggList');
  const since=new Date(maxDate); since.setDate(since.getDate()-60);
  const byEx=new Map();
  raw.forEach(r=>{
    if(r.date<since||!isWork(r)||!(r.reps>0))return;   // rep-gebaseerde oefeningen (gewicht én lichaamsgewicht)
    if(!byEx.has(r.exercise_title)) byEx.set(r.exercise_title,[]);
    byEx.get(r.exercise_title).push(r);
  });
  const cards=[];
  byEx.forEach((sets,name)=>{
    const t=exType(name);
    if(t!=='weight'&&t!=='reps') return;
    const dates=[...new Set(sets.map(r=>r.date.getTime()))].sort((a,b)=>a-b);
    if(dates.length<3) return;
    // baseer op de laatste ~3 weken (beste prestatie), niet op één (mogelijk slechte) sessie
    const rc=new Date(maxDate); rc.setDate(rc.getDate()-21);
    const recentSrc = sets.filter(r=>r.date>=rc);
    const src = recentSrc.length ? recentSrc : sets.filter(r=>r.date.getTime()===dates[dates.length-1]);
    const isCompound=/(bench|squat|deadlift|\brow\b|press|pull[- ]?up|pulldown|rdl|romanian|hip thrust|lunge|\bdip\b)/i.test(name);

    // plateau o.b.v. score van het meettype
    // plateau = vlakke regressie-trend over ~6 weken (min. 4 sessies), i.p.v. brittle 0,2%-drempel
    const t6=new Date(maxDate);t6.setDate(t6.getDate()-42);
    const trend=trendInfo(sessionBests(sets.filter(r=>r.date>=t6), t));
    const plateau=trend && trend.n>=4 && trend.pct<1.5;

    let metaStr, targetStr, advice, platesStr='';
    if(t==='weight'){
      let top=0,reps=0;
      src.forEach(r=>{ if(r.weight_kg>0&&(r.weight_kg>top||(r.weight_kg===top&&r.reps>reps))){top=r.weight_kg;reps=r.reps;} });
      if(!top) return;
      const repCap=isCompound?8:12;
      const inc=top>=40?2.5:(top>=15?1:0.5);
      let tw=top,tr=reps;
      if(reps>=repCap){ tw=Math.round((top+inc)*2)/2; tr=Math.max(isCompound?5:8,reps-2); advice='Rep-doel gehaald → gewicht omhoog.'; }
      else { tr=reps+1; advice='Zelfde gewicht, mik op +1 rep per set.'; }
      metaStr=`Recent beste (21 dgn): ${top} kg × ${reps} · ${dates.length} sessies in 60 dagen`;
      targetStr=`${tw} kg × ${tr}`;
      if(/barbell/i.test(name)&&!/smith/i.test(name)) platesStr=plateHtml(tw);
    } else {  // lichaamsgewicht / reps
      let reps=0; src.forEach(r=>{ if(r.reps>reps)reps=r.reps; });
      if(!reps) return;
      const repCap=isCompound?15:20;
      if(reps>=repCap){ advice='Sterk! Voeg externe weerstand toe (bijv. +2,5 kg) en bouw reps weer op.'; targetStr=`${name} + gewicht`; }
      else { advice='+1 rep per set t.o.v. je beste recente set.'; targetStr=`${reps+1} reps`; }
      metaStr=`Recent beste (21 dgn): ${reps} reps (lichaamsgewicht) · ${dates.length} sessies in 60 dagen`;
    }
    cards.push({name,n:sets.length,html:`
      <div class="sugg">
        <div class="exname">${name} ${plateau?'<span class="badge flat">plateau?</span>':''}</div>
        <div class="meta">${metaStr}</div>
        <div class="target">Volgende keer: <b>${targetStr}</b> <span style="color:var(--muted)">— ${advice}</span></div>
        ${plateau?'<div class="meta" style="margin-top:6px">Stagneert 3+ weken. Overweeg een lichte deload of een variatie.</div>':''}
        ${platesStr}
      </div>`});
  });
  cards.sort((a,b)=>b.n-a.n);
  box.innerHTML = cards.length ? cards.slice(0,14).map(c=>c.html).join('') :
    '<p class="empty">Te weinig recente data — minimaal 3 sessies per oefening in de laatste 60 dagen nodig.</p>';
}

/* ---------------- BENCHMARK ---------------- */
const STD={
  m:{ 'Bench Press':[0.75,1.0,1.5,2.0], 'Squat':[1.0,1.5,2.0,2.5], 'Deadlift':[1.25,1.75,2.5,3.0] },
  f:{ 'Bench Press':[0.4,0.6,0.9,1.2],  'Squat':[0.7,1.0,1.5,1.9], 'Deadlift':[0.9,1.25,1.75,2.25] }
};
const CLASSES=['Beginner','Novice','Intermediate','Advanced','Elite'];
function renderBenchmark(){
  if(!raw.length)return;
  const bw=parseFloat(document.getElementById('bwInput').value)||80;
  const sex=document.getElementById('sexInput').value;
  const age=parseFloat(document.getElementById('ageInput').value)||30;
  const finds={'Bench Press':/bench press \(barbell\)/i,'Squat':/^squat \(barbell\)/i,'Deadlift':/^deadlift \(barbell\)/i};
  const grid=document.getElementById('benchGrid'); grid.innerHTML='';
  let totalE1=0, found=0;
  Object.entries(finds).forEach(([lift,rx])=>{
    let best=0;
    raw.forEach(r=>{ if(rx.test(r.exercise_title)&&isWork(r)&&r.weight_kg>0&&r.reps>0) best=Math.max(best,e1rm(r.weight_kg,r.reps)); });
    const card=document.createElement('div'); card.className='benchcard';
    if(!best){ card.innerHTML=`<div class="lift">${lift}</div><div class="val" style="color:var(--muted)">–</div><div class="cls">Geen data gevonden</div>`; grid.appendChild(card); return; }
    totalE1+=best; found++;
    const ratio=best/bw, th=STD[sex][lift];
    let ci=0; th.forEach(t=>{ if(ratio>=t)ci++; });
    const next=ci<th.length?th[ci]:null;
    const pct=Math.min(100, ratio/th[th.length-1]*100);
    card.innerHTML=`
      <div class="lift">${lift}</div>
      <div class="val">${Math.round(best)} kg <span style="font-size:13px;color:var(--muted)">(${ratio.toFixed(2)}× bw)</span></div>
      <div class="cls"><b style="color:var(--ink)">${CLASSES[ci]}</b>${next?` · volgende niveau bij ${Math.ceil(next*bw)} kg`:' · maximaal niveau 🏆'}</div>
      <div class="meter"><i style="width:${pct}%"></i></div>`;
    grid.appendChild(card);
  });
  // C11/C12 — DOTS (lichaamsgewicht-eerlijk) + ruwe leeftijdscorrectie
  const box=document.getElementById('dotsBox');
  if(found===3){
    const dots=totalE1*dotsCoef(bw,sex);
    const band = dots<200?'Beginner':dots<300?'Gemiddeld':dots<380?'Gevorderd':dots<460?'Vergevorderd':'Elite';
    const ageMult = age>=40 ? 1 + (age-40)*0.01 : 1;   // ruwe masters-benadering (~1%/jaar na 40)
    const ageLine = age>=40 ? ` · leeftijdsgecorrigeerd ≈ <b>${Math.round(dots*ageMult)}</b> <span style="color:var(--muted)">(benadering)</span>` : '';
    box.innerHTML = `<div class="dotsc">
      <div class="lab">DOTS-score — lichaamsgewicht-eerlijk · totaal ${Math.round(totalE1)} kg @ ${Math.round(bw)} kg</div>
      <div class="val">${Math.round(dots)} <span style="font-size:14px;color:var(--muted)">· ${band}</span>${ageLine}</div>
      <div class="lab" style="margin-top:6px">DOTS corrigeert voor lichaamsgewicht (verving Wilks in 2019) en vergelijkt daardoor eerlijker tussen gewichtsklassen dan de kg/kg-ratio's hierboven. Banden zijn indicatief.</div>
    </div>`;
  } else {
    box.innerHTML = `<div class="dotsc"><div class="lab">DOTS-score verschijnt zodra je bench, squat én deadlift (barbell) in je data hebt.</div></div>`;
  }
}

/* ---------------- TRAININGSPLAN ---------------- */
// split -> volgorde van dagtypes die herhaald wordt over de week
const PLAN_SPLITS = { ppl:['push','pull','legs'], ul:['upper','lower'], ap:['anterior','posterior'], fb:['full'] };
const SPLIT_LABEL = { ppl:'Push / Pull / Legs', ul:'Upper / Lower', ap:'Anterior / Posterior', fb:'Full body' };
// per dagtype: label, kleur en de "slots" [spiergroep, compound|isolatie]
// Schouders-f = voorkant/zijkant (push), Schouders-r = achterkant/rear delt (pull)
const DAY_DEF = {
  push:      {label:'Push',      color:PLATE.red,    picks:[['Borst','comp'],['Borst','iso'],['Schouders-f','comp'],['Schouders-f','iso'],['Triceps','iso'],['Triceps','iso']]},
  pull:      {label:'Pull',      color:PLATE.blue,   picks:[['Rug','comp'],['Rug','comp'],['Rug','iso'],['Biceps','iso'],['Biceps','iso'],['Schouders-r','iso']]},
  legs:      {label:'Legs',      color:PLATE.green,  picks:[['Quads','comp'],['Quads','iso'],['Hamstrings/Glutes','comp'],['Hamstrings/Glutes','iso'],['Kuiten','iso'],['Core','iso']]},
  upper:     {label:'Upper',     color:PLATE.blue,   picks:[['Borst','comp'],['Rug','comp'],['Schouders-f','iso'],['Rug','iso'],['Biceps','iso'],['Triceps','iso']]},
  lower:     {label:'Lower',     color:PLATE.green,  picks:[['Quads','comp'],['Hamstrings/Glutes','comp'],['Quads','iso'],['Hamstrings/Glutes','iso'],['Kuiten','iso'],['Core','iso']]},
  // anterior = quads + push (borst, voorkant schouders, triceps)
  anterior:  {label:'Anterior',  color:PLATE.yellow, picks:[['Quads','comp'],['Quads','iso'],['Borst','comp'],['Borst','iso'],['Schouders-f','iso'],['Triceps','iso']]},
  // posterior = pull (rug, biceps, rear delts) + hamstrings/glutes + kuiten
  posterior: {label:'Posterior', color:'#9C6ADE',    picks:[['Rug','comp'],['Rug','iso'],['Hamstrings/Glutes','comp'],['Hamstrings/Glutes','iso'],['Schouders-r','iso'],['Biceps','iso'],['Kuiten','iso']]},
  full:      {label:'Full body', color:PLATE.yellow, picks:[['Quads','comp'],['Borst','comp'],['Rug','comp'],['Schouders-f','iso'],['Hamstrings/Glutes','iso'],['Biceps','iso'],['Triceps','iso']]}
};
// terugval-oefeningen als je (nog) geen eigen oefening voor een groep hebt
const PLAN_DEFAULTS = {
  'Borst':{comp:['Bench Press (Barbell)','Incline Bench Press (Dumbbell)','Push Up'],iso:['Chest Fly (Machine)','Cable Fly Crossovers']},
  'Rug':{comp:['Pull Up','Bent Over Row (Barbell)','Lat Pulldown (Cable)'],iso:['Seated Cable Row','Straight Arm Lat Pulldown (Cable)']},
  'Schouders-f':{comp:['Overhead Press (Barbell)','Shoulder Press (Dumbbell)'],iso:['Lateral Raise (Dumbbell)','Front Raise (Cable)']},
  'Schouders-r':{comp:[],iso:['Rear Delt Reverse Fly (Cable)','Face Pull']},
  'Quads':{comp:['Squat (Barbell)','Leg Press (Machine)','Hack Squat (Machine)'],iso:['Leg Extension (Machine)','Bulgarian Split Squat']},
  'Hamstrings/Glutes':{comp:['Romanian Deadlift (Barbell)','Hip Thrust (Barbell)'],iso:['Seated Leg Curl (Machine)','Back Extension (Hyperextension)']},
  'Biceps':{comp:[],iso:['Bicep Curl (Dumbbell)','Hammer Curl (Dumbbell)','Preacher Curl (Machine)']},
  'Triceps':{comp:[],iso:['Triceps Pushdown','Tricep Extension Overhead (Cable)','Skullcrusher (Barbell)']},
  'Kuiten':{comp:[],iso:['Standing Calf Raise (Machine)','Seated Calf Raise']},
  'Core':{comp:[],iso:['Hanging Leg Raise','Plank','Cable Crunch']}
};
const isCompoundName = n => /(bench|squat|deadlift|\brow\b|press|pull[- ]?up|chin[- ]?up|pulldown|\brdl\b|romanian|hip thrust|lunge|\bdip\b|\bhack\b)/i.test(n);
function inGroup(name, group){
  if(group==='Schouders-f') return muscleOf(name)==='Schouders' && !isRearDelt(name);
  if(group==='Schouders-r') return muscleOf(name)==='Schouders' && isRearDelt(name);
  return muscleOf(name)===group;
}
function planCandidates(){
  const freq=new Map(), best=new Map();
  raw.forEach(r=>{
    if(!isWork(r)||!(r.reps>0)) return;
    freq.set(r.exercise_title,(freq.get(r.exercise_title)||0)+1);
    if(r.weight_kg>0){ const m=e1rm(r.weight_kg,r.reps); if(m>(best.get(r.exercise_title)||0)) best.set(r.exercise_title,m); }
  });
  return {freq,best};
}
function pickExercise(group, kind, freq, used){
  let cands=[...freq.entries()].filter(([n])=>inGroup(n,group))
    .filter(([n])=>{const t=exType(n);return t==='weight'||t==='reps';})
    .sort((a,b)=>b[1]-a[1]).map(([n])=>n);
  const comp=cands.filter(isCompoundName), iso=cands.filter(n=>!isCompoundName(n));
  const pool = kind==='comp' ? comp.concat(iso) : iso.concat(comp);
  for(const n of pool){ if(!used.has(n)){ used.add(n); return n; } }
  const defs=PLAN_DEFAULTS[group]||{comp:[],iso:[]};
  const dpool = kind==='comp' ? (defs.comp||[]).concat(defs.iso||[]) : (defs.iso||[]).concat(defs.comp||[]);
  for(const n of dpool){ if(!used.has(n)){ used.add(n); return n; } }
  return null;
}
function scheme(goal, kind){
  if(goal==='str') return kind==='comp' ? {sets:4,lo:4,hi:6} : {sets:3,lo:6,hi:10};
  return kind==='comp' ? {sets:4,lo:6,hi:10} : {sets:3,lo:10,hi:15};
}
function buildPlan(cfg){
  const {freq,best}=planCandidates();
  let split=cfg.split;
  if(split==='auto') split = cfg.days<=2?'fb' : cfg.days===3?'ppl' : cfg.days===4?'ul' : 'ppl';
  const pattern=PLAN_SPLITS[split]||PLAN_SPLITS.ppl;
  const days=[];
  for(let i=0;i<cfg.days;i++){
    const dt=pattern[i%pattern.length], def=DAY_DEF[dt], used=new Set(), exs=[];
    def.picks.forEach(([group,kind])=>{
      const name=pickExercise(group,kind,freq,used);
      if(!name) return;
      const sc=scheme(cfg.goal,kind);
      exs.push({name,kind,t:exType(name),sets:sc.sets,lo:sc.lo,hi:sc.hi,e1:best.get(name)||0});
    });
    days.push({type:dt,label:def.label,color:def.color,exs});
  }
  return {split,days,cfg};
}
function planTarget(e, week, level, rir){
  // gevorderd: elke 2 weken ophogen (wekelijkse lineaire progressie is alleen realistisch voor beginners)
  const steps = level==='adv' ? Math.floor((week-1)/2) : (week-1);
  const buffer = (typeof rir==='number' && rir>=0) ? rir : 2;
  if(e.t==='reps' || !e.e1){
    const reps = e.lo + steps;
    return {main:`${e.sets} × ${reps}`, sub: e.t==='reps'?'lichaamsgewicht':''};
  }
  const inc = e.kind==='comp' ? 2.5 : 1.25;
  // C8 — werkgewicht via RIR i.p.v. vaste 0,88: het gewicht waarbij (lo + RIR) reps zou lukken → laat 'rir' reps in reserve
  let w = Math.round((e.e1/(1+(e.lo+buffer)/30))/2.5)*2.5 + steps*inc;
  w = Math.round(w/1.25)*1.25;
  return {main:`${e.sets} × ${e.lo}–${e.hi}`, sub:`≈ ${w.toLocaleString('nl-NL')} kg`};
}
function renderPlan(){
  const out=document.getElementById('planOut');
  if(!plan){ out.innerHTML='<p class="empty">Nog geen plan — klik op “Genereer plan”.</p>'; return; }
  const goalLabel = plan.cfg.goal==='str'?'Kracht':'Spiergroei';
  let weeks=''; for(let w=1;w<=plan.cfg.weeks;w++) weeks+=`<button class="chip${w===planWeek?' active':''}" data-w="${w}">Week ${w}</button>`;
  const mtot=new Map();
  plan.days.forEach(d=>d.exs.forEach(e=>{ const m=muscleOf(e.name); mtot.set(m,(mtot.get(m)||0)+e.sets); }));
  const msum=[...mtot.entries()].sort((a,b)=>b[1]-a[1]).map(([m,n])=>{
    const cls=n<10?'low':(n<=20?'ok':'high');
    return `<div class="row"><span class="dot" style="background:${MUSCLE_COLORS[m]||'#4A5160'}"></span>${m}<span class="n ${cls}">${n} sets</span></div>`;
  }).join('');
  const cards=plan.days.map((d,i)=>{
    const groups=[...new Set(d.exs.map(e=>muscleOf(e.name)))].join(' · ');
    const rows=d.exs.map(e=>{
      const tg=planTarget(e,planWeek,plan.cfg.level,plan.cfg.rir);
      return `<div class="exrow"><div><span class="nm">${e.name}</span><span class="grp">${muscleOf(e.name)} · ${e.kind==='comp'?'compound':'isolatie'}</span></div>`+
             `<div class="scheme"><b>${tg.main}</b>${tg.sub?`<small>${tg.sub}</small>`:''}</div></div>`;
    }).join('');
    return `<div class="dayc" style="--dc:${d.color}"><h4>Dag ${i+1} — ${d.label}</h4><div class="focus">${groups}</div>${rows}</div>`;
  }).join('');
  out.innerHTML=`
    <div class="card">
      <h3>${plan.cfg.weeks}-weken plan · ${SPLIT_LABEL[plan.split]||plan.split}</h3>
      <p class="sub">${plan.cfg.days} dagen/week · ${goalLabel} · ${plan.cfg.level==='adv'?'gevorderd — om de week zwaarder':'beginner — wekelijks zwaarder'} · richtgewichten op ~${plan.cfg.rir} reps in reserve (jouw 1RM)</p>
      <div class="chips plan-weeks">${weeks}</div>
      <div class="musc-sum">${msum}</div>
    </div>
    <div class="card">
      <h3>Schema — Week ${planWeek}</h3>
      <p class="sub">Dubbele progressie (bovenkant bereik bij alle sets → gewicht/reps omhoog) is een praktische conventie, geen bewezen "beste" methode. Richtgewichten zijn een <b>startpunt</b>: stuur bij op gevoel (±2–3 reps in reserve). Spiergroei werkt over een breed rep-bereik mits dicht bij falen — zie <b>Wetenschap</b>.</p>
      <div class="daygrid">${cards}</div>
    </div>`;
  out.querySelectorAll('.plan-weeks .chip').forEach(c=>c.addEventListener('click',()=>{ planWeek=+c.dataset.w; renderPlan(); }));
}
function genPlan(){
  plan = buildPlan({
    days:+document.getElementById('planDays').value,
    split:document.getElementById('planSplit').value,
    goal:document.getElementById('planGoal').value,
    level:document.getElementById('planLevel').value,
    rir:+document.getElementById('planRIR').value,
    weeks:+document.getElementById('planWeeks').value
  });
  planWeek=1; renderPlan();
}
document.getElementById('planGen').addEventListener('click', genPlan);

/* ---------------- VOORBEELDDATA-GENERATOR ---------------- */
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function generateDemoCSV(){
  const rng=mulberry32(424242);
  const rnd=(a,b)=>a+(b-a)*rng();
  const round=(x,s)=>Math.round(x/s)*s;
  const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fmt=d=>`${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  const q=s=>'"'+String(s).replace(/"/g,'""')+'"';

  const PUSH=[
    {name:'Bench Press (Barbell)',w:62,inc:.55,reps:7,sets:3,step:2.5,warm:2,noise:2},
    {name:'Overhead Press (Barbell)',w:40,inc:.35,reps:7,sets:3,step:2.5,warm:1,noise:1.5},
    {name:'Incline Bench Press (Dumbbell)',w:22,inc:.25,reps:9,sets:3,step:2,warm:0,noise:1},
    {name:'Lateral Raise (Dumbbell)',w:9,inc:.12,reps:13,sets:3,step:1,warm:0,noise:.6},
    {name:'Triceps Pushdown (Cable)',w:25,inc:.3,reps:11,sets:3,step:2.5,warm:0,noise:1.5},
  ];
  const PULL=[
    {name:'Deadlift (Barbell)',w:100,inc:1.1,reps:5,sets:2,step:5,warm:2,noise:3,alt:true},
    {name:'Bent Over Row (Barbell)',w:55,inc:.5,reps:8,sets:3,step:2.5,warm:1,noise:2},
    {name:'Lat Pulldown (Cable)',w:50,inc:.5,reps:10,sets:3,step:2.5,warm:0,noise:2},
    {name:'Seated Cable Row (Cable)',w:52,inc:.45,reps:10,sets:3,step:2.5,warm:0,noise:2},
    {name:'Bicep Curl (Dumbbell)',w:12,inc:.15,reps:11,sets:3,step:1,warm:0,noise:.8},
    {name:'Face Pull (Cable)',w:22,inc:.25,reps:14,sets:3,step:2.5,warm:0,noise:1},
  ];
  const LEGS=[
    {name:'Squat (Barbell)',w:82,inc:.9,reps:6,sets:3,step:2.5,warm:2,noise:3},
    {name:'Romanian Deadlift (Barbell)',w:70,inc:.7,reps:8,sets:3,step:2.5,warm:1,noise:2},
    {name:'Leg Press',w:140,inc:1.6,reps:11,sets:3,step:5,warm:0,noise:5},
    {name:'Leg Extension (Machine)',w:45,inc:.5,reps:13,sets:3,step:2.5,warm:0,noise:2},
    {name:'Seated Leg Curl (Machine)',w:40,inc:.45,reps:12,sets:3,step:2.5,warm:0,noise:2},
    {name:'Standing Calf Raise (Machine)',w:60,inc:.6,reps:14,sets:4,step:5,warm:0,noise:3},
  ];
  const DAYS=[{t:'Push Day',ex:PUSH},{t:'Pull Day',ex:PULL},{t:'Leg Day',ex:LEGS}];

  const lines=['"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_kg","reps","distance_km","duration_seconds","rpe"'];
  const today=new Date(); today.setHours(0,0,0,0); today.setDate(today.getDate()-2);
  const start=new Date(today); start.setDate(start.getDate()-7*30);
  let rot=0, pullCount=0;
  for(let d=new Date(start); d<=today; d.setDate(d.getDate()+1)){
    const dow=d.getDay();
    if(![1,2,4,5].includes(dow)) continue;       // train ma/di/do/vr
    if(rng()<0.08){ rot++; continue; }           // ~8% gemiste sessies
    const day=DAYS[rot%3]; rot++;
    const week=Math.floor((d-start)/(7*864e5));
    const sd=new Date(d); sd.setHours(17+Math.floor(rng()*3), Math.floor(rng()*60),0,0);
    const isPull=day.t==='Pull Day'; if(isPull) pullCount++;
    const rows=[]; let totalMin=0;
    day.ex.forEach(L=>{
      if(L.alt && isPull && (pullCount%2===0)) return; // deadlift om de andere pull-dag
      let idx=0;
      const base=round(Math.max(L.step, L.w + L.inc*week + rnd(-L.noise,L.noise)), L.step);
      for(let i=0;i<(L.warm||0);i++){
        const frac=(L.warm===2)?(i===0?0.5:0.75):0.6;
        rows.push({ex:L.name,type:'warmup',w:round(base*frac,L.step),reps:Math.min(10,L.reps+3),idx:idx++,rpe:''});
        totalMin+=2;
      }
      for(let s=0;s<L.sets;s++){
        const reps=Math.max(1,Math.round(L.reps+rnd(-1,1.3)));
        rows.push({ex:L.name,type:'normal',w:base,reps,idx:idx++,rpe:Math.round((7+rnd(0,2))*2)/2});
        totalMin+=3;
      }
    });
    totalMin+=8+Math.floor(rng()*10);
    const ed=new Date(sd.getTime()+totalMin*60000);
    const st=fmt(sd), et=fmt(ed);
    rows.forEach(r=>{
      lines.push([q(day.t),q(st),q(et),'',q(r.ex),'','',r.idx,q(r.type),r.w,r.reps,'','',r.rpe].join(','));
    });
  }
  return lines.join('\n');
}

/* ---------------- PWA: installeren + service worker ---------------- */
let deferredPrompt=null;
const installBtn=document.getElementById('installBtn');
window.addEventListener('beforeinstallprompt', e=>{ e.preventDefault(); deferredPrompt=e; if(installBtn) installBtn.style.display='inline-flex'; });
if(installBtn) installBtn.addEventListener('click', async ()=>{
  if(!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt=null; installBtn.style.display='none';
});
window.addEventListener('appinstalled', ()=>{ if(installBtn) installBtn.style.display='none'; toast('App geïnstalleerd ✓'); });

if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
}

/* ---------------- boot ---------------- */
(async function boot(){
  try{
    const d = await idbGet(KEY);
    if(d && d.csv){ ingest(d.csv, d.name, {persist:false, demo:!!d.demo}); return; }
  }catch(e){ /* geen opgeslagen data */ }
  showEmpty();
})();
