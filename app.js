'use strict';

const STORAGE_KEY = 'ikMultiEnterprises.v1';
const GEO_CACHE_KEY = 'ikMultiEnterprises.geoCache.v1';
const APP_VERSION = '0.1.0';

const IK_2026 = {
  thermal: {
    '3': {a:0.529,b:0.316,c:1065,d:0.370},
    '4': {a:0.606,b:0.340,c:1330,d:0.407},
    '5': {a:0.636,b:0.357,c:1395,d:0.427},
    '6': {a:0.665,b:0.374,c:1457,d:0.447},
    '7': {a:0.697,b:0.394,c:1515,d:0.470}
  },
  electric: {
    '3': {a:0.635,b:0.379,c:1278,d:0.444},
    '4': {a:0.727,b:0.408,c:1596,d:0.488},
    '5': {a:0.763,b:0.428,c:1674,d:0.512},
    '6': {a:0.798,b:0.449,c:1748,d:0.536},
    '7': {a:0.836,b:0.473,c:1818,d:0.564}
  }
};

// Dernier barème officiel disponible au 17/08/2026 : dépenses 2025, publié le 18/02/2026.
const BIC_FUEL_2025 = {
  '3-4': {diesel:0.089, petrol:0.113, lpg:0.072},
  '5-7': {diesel:0.110, petrol:0.139, lpg:0.089},
  '8-9': {diesel:0.131, petrol:0.165, lpg:0.106},
  '10-11': {diesel:0.148, petrol:0.187, lpg:0.120},
  '12+': {diesel:0.165, petrol:0.208, lpg:0.133}
};

let state = loadState();
let currentReport = [];
let deferredInstallPrompt = null;

const $ = id => document.getElementById(id);
const qsa = sel => Array.from(document.querySelectorAll(sel));

function uid(prefix='id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
}

function defaultState() {
  return {version:APP_VERSION, companies:[], vehicles:[], trips:[]};
}

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if(parsed && Array.isArray(parsed.companies) && Array.isArray(parsed.vehicles) && Array.isArray(parsed.trips)) return parsed;
  } catch(e) { console.warn(e); }
  return defaultState();
}

function saveState() {
  state.version = APP_VERSION;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  refreshAll();
}

function fmtKm(n){ return `${Number(n||0).toLocaleString('fr-FR',{maximumFractionDigits:1})} km`; }
function fmtMoney(n){ return Number(n||0).toLocaleString('fr-FR',{style:'currency',currency:'EUR'}); }
function fmtDate(iso){
  if(!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('fr-FR');
}
function esc(s=''){ return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

function getCompany(id){ return state.companies.find(x=>x.id===id); }
function getVehicle(id){ return state.vehicles.find(x=>x.id===id); }

function cvKey(cv){
  cv = Number(cv);
  if(cv <= 3) return '3';
  if(cv >= 7) return '7';
  return String(cv);
}

function bicCvGroup(cv){
  cv = Number(cv);
  if(cv <= 4) return '3-4';
  if(cv <= 7) return '5-7';
  if(cv <= 9) return '8-9';
  if(cv <= 11) return '10-11';
  return '12+';
}

function annualIkAmount(km, vehicle){
  km = Math.max(0, Number(km)||0);
  if(!vehicle) return 0;
  const group = vehicle.electric ? IK_2026.electric : IK_2026.thermal;
  const r = group[cvKey(vehicle.cv)];
  if(km <= 5000) return km * r.a;
  if(km <= 20000) return km * r.b + r.c;
  return km * r.d;
}

function bicRate(vehicle){
  if(!vehicle) return 0;
  const group = BIC_FUEL_2025[bicCvGroup(vehicle.cv)];
  return group?.[vehicle.fuel] ?? 0;
}

function schemeLabel(company, vehicle){
  if(!company) return '';
  if(company.scheme==='ik2026') return 'Barème IK France 2026';
  if(company.scheme==='bic2025') return `Carburant BIC 2025 (${fmtMoney(bicRate(vehicle))}/km)`;
  if(company.scheme==='fixed') return `Taux fixe ${fmtMoney(company.fixedRate||0)}/km`;
  return 'Aucun remboursement';
}

function computedTripAmounts(){
  const sorted = [...state.trips].sort((a,b)=> (a.date.localeCompare(b.date) || (a.createdAt||'').localeCompare(b.createdAt||'')));
  const accum = new Map();
  const result = new Map();
  for(const trip of sorted){
    const company = getCompany(trip.companyId);
    const vehicle = getVehicle(trip.vehicleId);
    const km = Number(trip.km)||0;
    const year = trip.date?.slice(0,4) || '';
    const key = `${trip.companyId}|${trip.vehicleId}|${year}`;
    const before = accum.get(key) || 0;
    const after = before + km;
    let amount = 0;
    let rateInfo = '';
    if(company?.scheme === 'ik2026') {
      amount = annualIkAmount(after, vehicle) - annualIkAmount(before, vehicle);
      rateInfo = 'IK 2026 cumul annuel';
    } else if(company?.scheme === 'bic2025') {
      const rate = bicRate(vehicle);
      amount = km * rate;
      rateInfo = `${rate.toFixed(3)} €/km`;
    } else if(company?.scheme === 'fixed') {
      const rate = Number(company.fixedRate)||0;
      amount = km * rate;
      rateInfo = `${rate.toFixed(3)} €/km`;
    }
    accum.set(key, after);
    result.set(trip.id,{amount, beforeKm:before, afterKm:after, rateInfo});
  }
  return result;
}

function setToday(){
  if(!$('tripDate').value) $('tripDate').value = new Date().toISOString().slice(0,10);
}

function populateSelect(select, items, labelFn, selected, leading=null){
  const opts=[];
  if(leading) opts.push(`<option value="${esc(leading.value)}">${esc(leading.label)}</option>`);
  for(const item of items) opts.push(`<option value="${esc(item.id)}">${esc(labelFn(item))}</option>`);
  select.innerHTML = opts.join('');
  if(selected && items.some(x=>x.id===selected)) select.value=selected;
}

function refreshSelectors(){
  const oldCompany=$('tripCompany').value, oldVehicle=$('tripVehicle').value;
  populateSelect($('tripCompany'),state.companies,x=>x.name,oldCompany);
  populateSelect($('tripVehicle'),state.vehicles,x=>x.name,oldVehicle);

  const hc=$('historyCompany').value;
  populateSelect($('historyCompany'),state.companies,x=>x.name,hc,{value:'',label:'Toutes'});

  const rc=$('reportCompany').value;
  populateSelect($('reportCompany'),state.companies,x=>x.name,rc);
  const rv=$('reportVehicle').value;
  populateSelect($('reportVehicle'),state.vehicles,x=>x.name,rv,{value:'',label:'Tous les véhicules'});
}

function refreshSetupBanner(){
  $('setupBanner').classList.toggle('hidden', state.companies.length>0 && state.vehicles.length>0);
  $('saveTripBtn').disabled = !(state.companies.length && state.vehicles.length);
  $('calcDistanceBtn').disabled = !(state.companies.length && state.vehicles.length);
}

function refreshLastTrip(){
  const trip=[...state.trips].sort((a,b)=>(b.date.localeCompare(a.date)||String(b.createdAt).localeCompare(String(a.createdAt))))[0];
  if(!trip){ $('lastTrip').textContent='Aucun trajet enregistré.'; return; }
  const company=getCompany(trip.companyId), vehicle=getVehicle(trip.vehicleId);
  const computed=computedTripAmounts().get(trip.id);
  $('lastTrip').innerHTML=`<strong>${esc(trip.from)} → ${esc(trip.to)}</strong><div class="meta">${fmtDate(trip.date)} · ${esc(company?.name||'?')} · ${esc(vehicle?.name||'?')} · ${fmtKm(trip.km)} · ${fmtMoney(computed?.amount||0)}</div>`;
}

function refreshHistoryYears(){
  const years=[...new Set(state.trips.map(t=>t.date?.slice(0,4)).filter(Boolean))].sort().reverse();
  const current=String(new Date().getFullYear());
  if(!years.includes(current)) years.unshift(current);
  const old=$('historyYear').value;
  $('historyYear').innerHTML=years.map(y=>`<option value="${y}">${y}</option>`).join('');
  $('historyYear').value=years.includes(old)?old:current;
}

function refreshHistory(){
  const companyFilter=$('historyCompany').value;
  const year=$('historyYear').value;
  const calc=computedTripAmounts();
  const trips=[...state.trips]
    .filter(t=>(!companyFilter||t.companyId===companyFilter) && (!year||t.date.startsWith(year)))
    .sort((a,b)=>(b.date.localeCompare(a.date)||String(b.createdAt).localeCompare(String(a.createdAt))));
  if(!trips.length){ $('historyList').innerHTML='<p class="hint">Aucun trajet pour ce filtre.</p>'; return; }
  $('historyList').innerHTML=trips.map(t=>{
    const c=getCompany(t.companyId), v=getVehicle(t.vehicleId), x=calc.get(t.id);
    return `<div class="trip-item"><div><strong>${esc(t.from)} → ${esc(t.to)}</strong><div class="meta">${fmtDate(t.date)} · ${esc(c?.name||'?')} · ${esc(v?.name||'?')}<br>${fmtKm(t.km)} · ${fmtMoney(x?.amount||0)}${t.purpose?` · ${esc(t.purpose)}`:''}</div></div><div class="trip-actions"><button data-edit-trip="${t.id}">Modifier</button><button class="danger" data-delete-trip="${t.id}">Suppr.</button></div></div>`;
  }).join('');
}

function refreshSettings(){
  $('companiesList').innerHTML = state.companies.length ? state.companies.map(c=>`<div class="settings-item"><div><strong>${esc(c.name)}</strong><div class="meta">${esc(schemeLabel(c, state.vehicles[0]))}</div></div><div class="item-actions"><button data-edit-company="${c.id}">Modifier</button><button class="danger" data-delete-company="${c.id}">Suppr.</button></div></div>`).join('') : '<p class="hint">Aucune structure.</p>';
  $('vehiclesList').innerHTML = state.vehicles.length ? state.vehicles.map(v=>`<div class="settings-item"><div><strong>${esc(v.name)}</strong><div class="meta">${v.cv} CV · ${v.electric?'100 % électrique':'thermique/hybride'} · ${v.fuel==='petrol'?'essence':v.fuel==='diesel'?'gazole':'GPL'}</div></div><div class="item-actions"><button data-edit-vehicle="${v.id}">Modifier</button><button class="danger" data-delete-vehicle="${v.id}">Suppr.</button></div></div>`).join('') : '<p class="hint">Aucun véhicule.</p>';
}

function refreshReportDates(){
  const y=new Date().getFullYear();
  if(!$('reportFrom').value) $('reportFrom').value=`${y}-01-01`;
  if(!$('reportTo').value) $('reportTo').value=`${y}-12-31`;
}

function refreshAll(){
  refreshSelectors();
  refreshSetupBanner();
  refreshLastTrip();
  refreshHistoryYears();
  refreshHistory();
  refreshSettings();
  refreshReportDates();
}

function switchTab(name){
  qsa('.tab-panel').forEach(x=>x.classList.toggle('active',x.id===`tab-${name}`));
  qsa('.bottom-nav [data-tab]').forEach(x=>x.classList.toggle('active',x.dataset.tab===name));
  window.scrollTo({top:0,behavior:'smooth'});
}

function sleep(ms){ return new Promise(resolve=>setTimeout(resolve,ms)); }
function readGeoCache(){ try{return JSON.parse(localStorage.getItem(GEO_CACHE_KEY))||{};}catch{return {};} }
function writeGeoCache(cache){
  const entries=Object.entries(cache).slice(-100);
  localStorage.setItem(GEO_CACHE_KEY,JSON.stringify(Object.fromEntries(entries)));
}
async function geocode(address){
  if(location.protocol==='file:') throw new Error('Le calcul automatique nécessite que l’application soit publiée en HTTPS (ex. GitHub Pages)');
  const key=address.trim().toLowerCase();
  const cache=readGeoCache();
  if(cache[key]) return cache[key];
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=0&accept-language=fr&q=${encodeURIComponent(address)}`;
  const r = await fetch(url,{headers:{'Accept':'application/json'}});
  if(!r.ok) throw new Error('Service de recherche d’adresse indisponible');
  const data=await r.json();
  if(!data.length) throw new Error(`Adresse introuvable : ${address}`);
  const result={lat:Number(data[0].lat),lon:Number(data[0].lon),display:data[0].display_name};
  cache[key]=result; writeGeoCache(cache);
  return result;
}

async function routeKm(a,b){
  const url=`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false&alternatives=false&steps=false`;
  const r=await fetch(url,{headers:{'Accept':'application/json'}});
  if(!r.ok) throw new Error('Service d’itinéraire indisponible');
  const data=await r.json();
  if(data.code!=='Ok'||!data.routes?.length) throw new Error('Aucun itinéraire routier trouvé');
  return data.routes[0].distance/1000;
}

async function calculateDistance(){
  const from=$('tripFrom').value.trim(), to=$('tripTo').value.trim();
  if(!from||!to){ showRouteStatus('Saisis le départ et la destination.','bad'); return; }
  const btn=$('calcDistanceBtn');
  btn.disabled=true; btn.textContent='Calcul en cours…';
  showRouteStatus('Recherche des adresses et de l’itinéraire…');
  try{
    const cacheBefore=readGeoCache();
    const fromCached=!!cacheBefore[from.trim().toLowerCase()];
    const a=await geocode(from);
    const cacheMid=readGeoCache();
    const toCached=!!cacheMid[to.trim().toLowerCase()];
    if(!fromCached && !toCached) await sleep(1100); // politique Nominatim : max. 1 requête/seconde
    const b=await geocode(to);
    let km=await routeKm(a,b);
    if($('roundTrip').checked) km*=2;
    km=Math.round(km*10)/10;
    $('tripKm').value=km.toFixed(1);
    showRouteStatus(`${$ ('roundTrip').checked?'Aller-retour':'Aller simple'} : ${fmtKm(km)} · calcul routier OpenStreetMap/OSRM`,'good');
  }catch(e){
    showRouteStatus(`${e.message}. Tu peux saisir les km manuellement.`,'bad');
  }finally{
    btn.disabled=!(state.companies.length&&state.vehicles.length); btn.textContent='Calculer les kilomètres';
  }
}

function showRouteStatus(msg,cls=''){
  const el=$('routeStatus'); el.textContent=msg; el.className=`status ${cls}`;
}

function saveTrip(editId=null){
  const trip={
    id:editId||uid('trip'),
    date:$('tripDate').value,
    companyId:$('tripCompany').value,
    vehicleId:$('tripVehicle').value,
    from:$('tripFrom').value.trim(),
    to:$('tripTo').value.trim(),
    km:Number($('tripKm').value),
    purpose:$('tripPurpose').value.trim(),
    roundTrip:$('roundTrip').checked,
    createdAt:new Date().toISOString()
  };
  if(!trip.date||!trip.companyId||!trip.vehicleId||!trip.from||!trip.to||!(trip.km>=0)){
    alert('Complète la date, la structure, le véhicule, le départ, la destination et la distance.'); return;
  }
  if(editId){
    const idx=state.trips.findIndex(t=>t.id===editId);
    if(idx>=0){ trip.createdAt=state.trips[idx].createdAt||trip.createdAt; state.trips[idx]=trip; }
  } else state.trips.push(trip);
  saveState();
  resetTripForm();
  alert(editId?'Trajet modifié.':'Trajet enregistré.');
}

function resetTripForm(){
  $('tripFrom').value=''; $('tripTo').value=''; $('tripKm').value=''; $('tripPurpose').value=''; $('roundTrip').checked=false; showRouteStatus('');
  $('saveTripBtn').dataset.editId=''; $('saveTripBtn').textContent='Enregistrer le trajet';
  setToday();
}

function editTrip(id){
  const t=state.trips.find(x=>x.id===id); if(!t) return;
  switchTab('trip');
  $('tripDate').value=t.date; $('tripCompany').value=t.companyId; $('tripVehicle').value=t.vehicleId;
  $('tripFrom').value=t.from; $('tripTo').value=t.to; $('tripKm').value=t.km; $('tripPurpose').value=t.purpose||''; $('roundTrip').checked=!!t.roundTrip;
  $('saveTripBtn').dataset.editId=id; $('saveTripBtn').textContent='Enregistrer les modifications';
}

function openCompanyDialog(id=null){
  const c=id?getCompany(id):null;
  $('companyDialogTitle').textContent=c?'Modifier la structure':'Ajouter une structure';
  $('companyId').value=c?.id||''; $('companyName').value=c?.name||''; $('companyScheme').value=c?.scheme||'ik2026'; $('companyFixedRate').value=c?.fixedRate??'';
  toggleFixedRate(); $('companyDialog').showModal();
}
function toggleFixedRate(){ $('fixedRateWrap').classList.toggle('hidden',$('companyScheme').value!=='fixed'); }
function persistCompany(){
  const name=$('companyName').value.trim(), scheme=$('companyScheme').value, fixedRate=Number($('companyFixedRate').value||0), id=$('companyId').value;
  if(!name){ alert('Indique un nom.'); return; }
  if(scheme==='fixed' && fixedRate<0){ alert('Taux invalide.'); return; }
  const obj={id:id||uid('company'),name,scheme,fixedRate};
  if(id){ const i=state.companies.findIndex(x=>x.id===id); state.companies[i]=obj; } else state.companies.push(obj);
  $('companyDialog').close(); saveState();
}

function openVehicleDialog(id=null){
  const v=id?getVehicle(id):null;
  $('vehicleDialogTitle').textContent=v?'Modifier le véhicule':'Ajouter un véhicule';
  $('vehicleId').value=v?.id||''; $('vehicleName').value=v?.name||''; $('vehicleCv').value=v?.cv||''; $('vehicleElectric').value=String(v?.electric||false); $('vehicleFuel').value=v?.fuel||'petrol';
  $('vehicleDialog').showModal();
}
function persistVehicle(){
  const name=$('vehicleName').value.trim(), cv=Number($('vehicleCv').value), electric=$('vehicleElectric').value==='true', fuel=$('vehicleFuel').value, id=$('vehicleId').value;
  if(!name||!(cv>=1)){ alert('Indique le nom et la puissance fiscale.'); return; }
  const obj={id:id||uid('vehicle'),name,cv,electric,fuel};
  if(id){ const i=state.vehicles.findIndex(x=>x.id===id); state.vehicles[i]=obj; } else state.vehicles.push(obj);
  $('vehicleDialog').close(); saveState();
}

function deleteCompany(id){
  if(state.trips.some(t=>t.companyId===id)){ alert('Impossible : cette structure est utilisée par des trajets. Supprime ou réaffecte d’abord ces trajets.'); return; }
  if(confirm('Supprimer cette structure ?')){ state.companies=state.companies.filter(x=>x.id!==id); saveState(); }
}
function deleteVehicle(id){
  if(state.trips.some(t=>t.vehicleId===id)){ alert('Impossible : ce véhicule est utilisé par des trajets. Supprime ou réaffecte d’abord ces trajets.'); return; }
  if(confirm('Supprimer ce véhicule ?')){ state.vehicles=state.vehicles.filter(x=>x.id!==id); saveState(); }
}
function deleteTrip(id){ if(confirm('Supprimer ce trajet ?')){ state.trips=state.trips.filter(x=>x.id!==id); saveState(); } }

function generateReport(){
  const companyId=$('reportCompany').value, vehicleId=$('reportVehicle').value, from=$('reportFrom').value, to=$('reportTo').value;
  if(!companyId){ alert('Choisis une structure.'); return; }
  const calc=computedTripAmounts();
  currentReport=[...state.trips].filter(t=>t.companyId===companyId && (!vehicleId||t.vehicleId===vehicleId) && (!from||t.date>=from) && (!to||t.date<=to)).sort((a,b)=>a.date.localeCompare(b.date)).map(t=>({...t,computed:calc.get(t.id)}));
  const company=getCompany(companyId);
  const totalKm=currentReport.reduce((s,t)=>s+Number(t.km||0),0);
  const totalAmount=currentReport.reduce((s,t)=>s+Number(t.computed?.amount||0),0);
  $('reportTitle').textContent=`Rapport — ${company?.name||''}`;
  $('reportSummary').innerHTML=`<div class="summary"><span>Trajets</span><strong>${currentReport.length}</strong></div><div class="summary"><span>Kilomètres</span><strong>${fmtKm(totalKm)}</strong></div><div class="summary"><span>Montant</span><strong>${fmtMoney(totalAmount)}</strong></div>`;
  $('reportRows').innerHTML=currentReport.length?currentReport.map(t=>`<tr><td>${fmtDate(t.date)}</td><td>${esc(t.from)} → ${esc(t.to)}<div class="meta">${esc(getVehicle(t.vehicleId)?.name||'')}</div></td><td>${esc(t.purpose||'')}</td><td>${Number(t.km).toLocaleString('fr-FR',{maximumFractionDigits:1})}</td><td>${fmtMoney(t.computed?.amount||0)}<div class="meta">${esc(t.computed?.rateInfo||'')}</div></td></tr>`).join(''):'<tr><td colspan="5">Aucun trajet.</td></tr>';
  $('reportCard').classList.remove('hidden');
  buildPrintReport(company,from,to,totalKm,totalAmount);
}

function buildPrintReport(company,from,to,totalKm,totalAmount){
  const rows=currentReport.map(t=>`<tr><td>${fmtDate(t.date)}</td><td>${esc(t.from)} → ${esc(t.to)}</td><td>${esc(t.purpose||'')}</td><td>${Number(t.km).toLocaleString('fr-FR',{maximumFractionDigits:1})}</td><td>${fmtMoney(t.computed?.amount||0)}</td></tr>`).join('');
  $('print-report').innerHTML=`<h1>Rapport kilométrique — ${esc(company?.name||'')}</h1><p>Période : ${fmtDate(from)} au ${fmtDate(to)}</p><div class="print-summary"><div><b>${currentReport.length}</b><br>trajets</div><div><b>${fmtKm(totalKm)}</b><br>kilomètres</div><div><b>${fmtMoney(totalAmount)}</b><br>montant</div></div><table><thead><tr><th>Date</th><th>Trajet</th><th>Motif</th><th>Km</th><th>Montant</th></tr></thead><tbody>${rows||'<tr><td colspan="5">Aucun trajet</td></tr>'}</tbody></table><footer>Généré par IK Multi-Entreprises ${APP_VERSION}. Vérifier la conformité du régime fiscal utilisé avec votre professionnel du chiffre.</footer>`;
}

function exportCsv(){
  if(!currentReport.length){ alert('Génère d’abord un rapport contenant des trajets.'); return; }
  const header=['Date','Structure','Véhicule','Départ','Destination','Motif','Kilomètres','Montant EUR','Calcul'];
  const rows=currentReport.map(t=>[t.date,getCompany(t.companyId)?.name||'',getVehicle(t.vehicleId)?.name||'',t.from,t.to,t.purpose||'',Number(t.km).toFixed(1),Number(t.computed?.amount||0).toFixed(2),t.computed?.rateInfo||'']);
  const csv='\ufeff'+[header,...rows].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(';')).join('\r\n');
  downloadBlob(csv,'text/csv;charset=utf-8',`rapport-kilometrique-${new Date().toISOString().slice(0,10)}.csv`);
}

function downloadBlob(content,type,name){
  const blob=new Blob([content],{type}), url=URL.createObjectURL(blob), a=document.createElement('a');
  a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function exportBackup(){ downloadBlob(JSON.stringify(state,null,2),'application/json',`ik-multi-sauvegarde-${new Date().toISOString().slice(0,10)}.json`); }

async function importBackup(file){
  try{
    const data=JSON.parse(await file.text());
    if(!Array.isArray(data.companies)||!Array.isArray(data.vehicles)||!Array.isArray(data.trips)) throw new Error('Format non reconnu');
    if(!confirm('Remplacer toutes les données actuelles par cette sauvegarde ?')) return;
    state=data; saveState(); alert('Sauvegarde importée.');
  }catch(e){ alert(`Import impossible : ${e.message}`); }
}

function wireEvents(){
  qsa('[data-tab]').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));
  $('calcDistanceBtn').addEventListener('click',calculateDistance);
  $('saveTripBtn').addEventListener('click',()=>saveTrip($('saveTripBtn').dataset.editId||null));
  $('historyCompany').addEventListener('change',refreshHistory); $('historyYear').addEventListener('change',refreshHistory);
  $('generateReportBtn').addEventListener('click',generateReport); $('csvBtn').addEventListener('click',exportCsv); $('printBtn').addEventListener('click',()=>window.print());
  $('addCompanyBtn').addEventListener('click',()=>openCompanyDialog()); $('companyScheme').addEventListener('change',toggleFixedRate); $('saveCompanyDialogBtn').addEventListener('click',e=>{e.preventDefault();persistCompany();});
  $('addVehicleBtn').addEventListener('click',()=>openVehicleDialog()); $('saveVehicleDialogBtn').addEventListener('click',e=>{e.preventDefault();persistVehicle();});
  $('exportBackupBtn').addEventListener('click',exportBackup); $('importBackupInput').addEventListener('change',e=>{if(e.target.files[0]) importBackup(e.target.files[0]);e.target.value='';});
  $('clearTripsBtn').addEventListener('click',()=>{if(state.trips.length&&confirm('Supprimer TOUS les trajets ? Cette action est irréversible sans sauvegarde.')){state.trips=[];saveState();}});
  document.body.addEventListener('click',e=>{
    const t=e.target;
    if(t.dataset.editTrip) editTrip(t.dataset.editTrip);
    if(t.dataset.deleteTrip) deleteTrip(t.dataset.deleteTrip);
    if(t.dataset.editCompany) openCompanyDialog(t.dataset.editCompany);
    if(t.dataset.deleteCompany) deleteCompany(t.dataset.deleteCompany);
    if(t.dataset.editVehicle) openVehicleDialog(t.dataset.editVehicle);
    if(t.dataset.deleteVehicle) deleteVehicle(t.dataset.deleteVehicle);
  });

  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e;$('installBtn').classList.remove('hidden');});
  $('installBtn').addEventListener('click',async()=>{if(!deferredInstallPrompt)return;deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;$('installBtn').classList.add('hidden');});
}

function registerServiceWorker(){ if('serviceWorker' in navigator && location.protocol!=='file:') navigator.serviceWorker.register('./sw.js').catch(console.warn); }

setToday();
wireEvents();
refreshAll();
registerServiceWorker();
