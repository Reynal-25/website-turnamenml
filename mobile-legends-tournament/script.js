const STORAGE_KEY = 'mlbb_tournament_dynamic_v2';
const DEFAULT_LOGO = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#ffb000"/><stop offset="1" stop-color="#ff6b00"/></linearGradient></defs><rect width="100" height="100" rx="22" fill="#111722"/><path d="M24 67V31h14l12 17 12-17h14v36H62V50L50 66 38 50v17z" fill="url(#g)"/></svg>`);

const defaultTeams = Array.from({length:9}, (_,i)=>({
  id:`team-${i+1}`,
  name:`Team ${String.fromCharCode(65+i)}`,
  tag:`T${i+1}`,
  logo:DEFAULT_LOGO,
  players:[{name:`Player ${i+1}A`,role:'EXP'},{name:`Player ${i+1}B`,role:'JUNGLE'},{name:`Player ${i+1}C`,role:'MID'},{name:`Player ${i+1}D`,role:'GOLD'},{name:`Player ${i+1}E`,role:'ROAM'}],
  substitutes:[{name:`Sub ${i+1}A`,role:'FLEX'},{name:`Sub ${i+1}B`,role:'FLEX'}],
  coach:`Coach ${i+1}`
}));

let state = loadState();
let currentEditingTeam = null;

function loadState(){
  try{
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY));
    if(saved && saved.teams && saved.matches){ saved.settings=saved.settings||{name:'MLBB TOURNAMENT',logo:DEFAULT_LOGO,playoffMethod:'mpl6'}; saved.settings.name=saved.settings.name||'MLBB TOURNAMENT'; saved.settings.logo=saved.settings.logo||DEFAULT_LOGO; saved.settings.playoffMethod=saved.settings.playoffMethod||'mpl6'; return saved; }
  }catch(e){}
  const teams=structuredClone(defaultTeams);
  // Compatibility with older saved data where players were plain strings.
  teams.forEach(t=>{t.players=t.players.map((p,i)=>typeof p==='string'?{name:p,role:['EXP','JUNGLE','MID','GOLD','ROAM'][i]||'FLEX'}:p);t.substitutes=t.substitutes.map(p=>typeof p==='string'?{name:p,role:'FLEX'}:p);});
  return {teams,matches:generateSchedule(teams),playoffResults:{},settings:{name:'MLBB TOURNAMENT',logo:DEFAULT_LOGO,playoffMethod:'mpl6'}};
}
function saveState(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}
function teamById(id){return state.teams.find(t=>t.id===id);}
function teamLogo(id){return teamById(id)?.logo||DEFAULT_LOGO;}
function esc(str){return String(str??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));}

// Double round-robin generator that adapts to the current number of teams.
// Every team meets every other team twice. Odd team counts create one bye per round.
function generateSchedule(teams){
  const ids=teams.map(t=>t.id), matches=[];
  if(ids.length<2) return matches;

  const makeSingleRound=(baseIds, roundOffset, cycle)=>{
    let arr=[...baseIds];
    const hasBye=arr.length%2===1;
    if(hasBye) arr.push(null);
    const n=arr.length, rounds=n-1, perRound=n/2;
    for(let r=0;r<rounds;r++){
      for(let i=0;i<perRound;i++){
        const a=arr[i], b=arr[n-1-i];
        if(a===null||b===null) continue;
        let home=a, away=b;
        if(cycle===2) [home,away]=[away,home];
        matches.push({
          id:`m-${matches.length+1}`,
          round:roundOffset+r+1,
          cycle,
          matchNo:i+1,
          home,away,
          homeScore:null,awayScore:null
        });
      }
      // Circle-method rotation: keep the first slot fixed.
      arr=[arr[0],arr[n-1],...arr.slice(1,n-1)];
    }
  };

  makeSingleRound(ids,0,1);
  makeSingleRound(ids,Math.ceil(ids.length/2)===0?0:ids.length%2?ids.length:ids.length-1,2);

  // The second cycle starts after the first cycle's rounds.
  const firstRounds=ids.length%2?ids.length:ids.length-1;
  matches.forEach((m,i)=>{
    const roundSize=Math.floor(ids.length/2);
    m.round=Math.floor(i/roundSize)+1;
    m.matchNo=(i%roundSize)+1;
    m.day=Math.floor(i/roundSize)+1;
  });
  return matches;
}

function preserveResults(oldMatches,newMatches){
  const occurrences={};
  const keyFor=m=>[m.home,m.away].sort().join('|');
  oldMatches.forEach(m=>{
    if(m.homeScore==null||m.awayScore==null) return;
    const key=keyFor(m), occ=(occurrences[key]||0)+1;
    occurrences[key]=occ;
    m._occ=occ;
  });
  const used={};
  newMatches.forEach(m=>{
    const key=keyFor(m), occ=(used[key]||0)+1;
    used[key]=occ;
    const old=oldMatches.find(x=>x._occ===occ && keyFor(x)===key);
    if(old){m.homeScore=old.homeScore;m.awayScore=old.awayScore;}
  });
  oldMatches.forEach(m=>delete m._occ);
  return newMatches;
}

function regenerateSchedule(){
  const oldMatches=state.matches||[];
  state.matches=preserveResults(oldMatches,generateSchedule(state.teams));
}

function showPage(page){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById(page).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
  document.getElementById('mainNav').classList.remove('open');
  window.scrollTo({top:0,behavior:'smooth'});
  renderAll();
}

function calculateStandings(){
  const stats={};
  state.teams.forEach(t=>stats[t.id]={id:t.id,mp:0,mw:0,ml:0,gw:0,gl:0});
  state.matches.forEach(m=>{
    if(m.homeScore==null||m.awayScore==null)return;
    const h=stats[m.home],a=stats[m.away];
    h.gw+=m.homeScore;h.gl+=m.awayScore;a.gw+=m.awayScore;a.gl+=m.homeScore;
    if(m.homeScore>m.awayScore){h.mw++;h.mp++;a.ml++;}
    else if(m.awayScore>m.homeScore){a.mw++;a.mp++;h.ml++;}
  });
  return Object.values(stats).sort((a,b)=>(b.mp-a.mp)||(b.mw-a.mw)-0||((b.gw-b.gl)-(a.gw-a.gl))||(b.gw-a.gw));
}

function renderStandings(){
  const rows=calculateStandings();
  document.getElementById('standingsBody').innerHTML=rows.map((s,i)=>{
    const t=teamById(s.id), ngw=s.gw-s.gl, total=s.mw+s.ml, win=total?Math.round(s.mw/total*100):0;
    return `<tr><td class="rank-${i+1}">${i+1}</td><td><div class="team-cell"><img src="${t.logo}" alt=""><span>${esc(t.name)} <small style="color:#697386">${esc(t.tag)}</small></span></div></td><td>${s.mp}</td><td>${s.mw} - ${s.ml}</td><td>${ngw>0?'+':''}${ngw}</td><td>${s.gw} - ${s.gl}</td><td>${win}%</td></tr>`;
  }).join('');
  document.getElementById('miniStandings').innerHTML=rows.slice(0,5).map((s,i)=>{const t=teamById(s.id);return `<div class="mini-row"><span class="rank">${i+1}</span><div class="team-mini"><img src="${t.logo}" alt=""><div><b>${esc(t.name)}</b><small>${s.mw}-${s.ml} match</small></div></div><span class="points">${s.mp} MP</span></div>`}).join('');
}

const PLAYOFF_METHODS={
  mpl6:{label:'6 Tim — MPL Style (Double Elimination)',qualifiers:6,note:'Rank 1–2 langsung ke Upper Semifinal. Rank 3–6 bermain di Quarter/Lower Round.',rounds:['LOWER / QF','UPPER SEMIFINAL','UPPER FINAL','GRAND FINAL']},
  single8:{label:'8 Tim — Single Elimination',qualifiers:8,note:'8 tim langsung masuk bracket knockout. Setiap pertandingan adalah sistem gugur.',rounds:['QUARTERFINAL','SEMIFINAL','GRAND FINAL']},
  double8:{label:'8 Tim — Double Elimination',qualifiers:8,note:'8 tim masuk upper bracket dan memiliki kesempatan kedua melalui lower bracket.',rounds:['UPPER QUARTERFINAL','UPPER SEMIFINAL','UPPER FINAL','LOWER BRACKET','GRAND FINAL']},
  single6:{label:'6 Tim — Single Elimination',qualifiers:6,note:'Rank 1–2 mendapat bye ke semifinal. Rank 3–6 bermain di quarterfinal.',rounds:['QUARTERFINAL','SEMIFINAL','GRAND FINAL']},
  single4:{label:'4 Tim — Single Elimination',qualifiers:4,note:'Top 4 regular season masuk semifinal lalu grand final.',rounds:['SEMIFINAL','GRAND FINAL']},
  custom:{label:'Buat Sendiri — Custom Bracket',qualifiers:0,note:'Buat jumlah ronde, pertandingan, peserta, dan nama ronde sendiri secara bebas.',rounds:[]}
};
function activePlayoff(){return PLAYOFF_METHODS[state.settings?.playoffMethod]||PLAYOFF_METHODS.mpl6;}
function renderTournamentBrand(){
  const name=state.settings?.name||'MLBB TOURNAMENT', logo=state.settings?.logo||DEFAULT_LOGO, method=activePlayoff();
  document.title=name;
  document.getElementById('brandTournamentName').textContent=name;
  document.getElementById('brandSubtitle').textContent=`${state.teams.length} TEAM • REGULAR SEASON`;
  document.getElementById('brandLogo').src=logo;
  document.getElementById('heroTitle').innerHTML=`TURNAMEN <span>${esc(name.length>16?name.slice(0,16)+'…':name)}</span><br>${state.teams.length} TIM`;
  document.getElementById('heroDescription').textContent=`Kelola roster, logo, jadwal, hasil BO3, klasemen otomatis, dan ${method.label.toLowerCase()} dalam satu dashboard.`;
  document.getElementById('footerTournamentName').textContent=name;
  document.getElementById('footerTournamentEdition').textContent=`• ${method.label}`;
  document.getElementById('playoffTitle').textContent=method.label.split(' — ')[0]||'Playoff';
  document.getElementById('playoffDescription').textContent=`${method.qualifiers} tim teratas dari regular season masuk playoff.`;
  document.getElementById('playoffNote').textContent=method.note;
}
function renderSettings(){
  const st=state.settings||{}; const method=activePlayoff();
  document.getElementById('tournamentName').value=st.name||'MLBB TOURNAMENT';
  document.getElementById('playoffMethod').value=st.playoffMethod||'mpl6';
  const img=document.getElementById('tournamentLogoPreview'); img.src=st.logo||DEFAULT_LOGO; img.style.display='block'; document.getElementById('tournamentLogoPlaceholder').style.display='none';
  document.getElementById('editorBrandLogo').src=st.logo||DEFAULT_LOGO; document.getElementById('editorBrandName').textContent=st.name||'MLBB TOURNAMENT'; document.getElementById('editorBrandMethod').textContent=method.label;
  document.getElementById('playoffMethodHelp').innerHTML=`<b>${method.label}</b><br>${method.note}`;
  const custom=document.getElementById('customBracketEditor');
  if(custom) custom.style.display=(st.playoffMethod==='custom'?'block':'none');
  if(st.playoffMethod==='custom') renderCustomEditor();
}

function renderStats(){
  const played=state.matches.filter(m=>m.homeScore!=null&&m.awayScore!=null);
  const games=played.reduce((n,m)=>n+m.homeScore+m.awayScore,0);
  document.getElementById('statTeams').textContent=state.teams.length;
  document.getElementById('statMatches').textContent=state.matches.length;
  const ft=document.getElementById('formatTeams'); if(ft) ft.textContent=state.teams.length;
  const fm=document.getElementById('formatMatches'); if(fm) fm.textContent=state.matches.length;
  const fp=document.getElementById('formatPlayoff'); if(fp) fp.textContent=Math.min(6,state.teams.length);
  document.getElementById('statPlayed').textContent=played.length;
  document.getElementById('statGames').textContent=games;
}

function matchLabel(m){const h=teamById(m.home),a=teamById(m.away);return {h,a};}
function resultText(m){return m.homeScore==null?'VS':`${m.homeScore} - ${m.awayScore}`;}

function renderSchedule(){
  const roundFilter=document.getElementById('scheduleRoundFilter');
  const roundCount=state.teams.length%2?state.teams.length:state.teams.length-1;
  const maxRound=roundCount*2;
  const current=roundFilter.value;
  roundFilter.innerHTML='<option value="all">Semua Round</option>'+Array.from({length:maxRound},(_,i)=>`<option value="${i+1}">Round ${i+1}</option>`).join('');
  if([...roundFilter.options].some(o=>o.value===current)) roundFilter.value=current;
  const rf=roundFilter.value, sf=document.getElementById('scheduleStatusFilter').value;
  const filtered=state.matches.filter(m=>(rf==='all'||String(m.round)===rf)&&(sf==='all'||(sf==='played'?m.homeScore!=null:m.homeScore==null)));
  const grouped={};filtered.forEach(m=>(grouped[m.round]??=[]).push(m));
  document.getElementById('scheduleList').innerHTML=Object.entries(grouped).map(([round,ms])=>`<div class="day-card"><div class="day-head"><b>ROUND ${round}</b><span>${ms.length} match</span></div>${ms.map(m=>{const {h,a}=matchLabel(m);return `<div class="match-row"><div class="match-time">M${m.matchNo}</div><div class="match-team"><img src="${h.logo}" alt="">${esc(h.name)}</div><div class="match-score">${resultText(m)}<small>BO3</small></div><div class="match-team right">${esc(a.name)}<img src="${a.logo}" alt=""></div><div class="match-status">${m.homeScore==null?'<span style="color:#8f98aa">UPCOMING</span>':'<span style="color:#28d17c">DONE</span>'}</div></div>`}).join('')}</div>`).join('')||`<div class="info-banner">Tidak ada pertandingan sesuai filter.</div>`;
}

function renderResults(){
  document.getElementById('resultsList').innerHTML=state.matches.map((m,i)=>{const {h,a}=matchLabel(m);return `<div class="result-card"><div class="result-meta"><b>R${m.round} • M${m.matchNo}</b>${m.homeScore==null?'Belum dimainkan':'Selesai'}</div><div class="match-team"><img src="${h.logo}" alt="">${esc(h.name)}</div><div class="score-inputs"><input id="hs-${m.id}" type="number" min="0" max="2" value="${m.homeScore??''}" placeholder="0"><span>:</span><input id="as-${m.id}" type="number" min="0" max="2" value="${m.awayScore??''}" placeholder="0"></div><div class="match-team right">${esc(a.name)}<img src="${a.logo}" alt=""></div><button class="primary save-result" onclick="saveResult('${m.id}')">Simpan</button></div>`}).join('');
}
function saveResult(id){
  const m=state.matches.find(x=>x.id===id), hs=Number(document.getElementById(`hs-${id}`).value), as=Number(document.getElementById(`as-${id}`).value);
  if(!Number.isInteger(hs)||!Number.isInteger(as)||hs<0||as<0||hs>2||as>2||hs===as||Math.max(hs,as)!==2){toast('Skor BO3 harus 2-0 atau 2-1.');return}
  m.homeScore=hs;m.awayScore=as;saveState();renderAll();toast('Hasil pertandingan disimpan.');
}
function resetAllResults(){if(!confirm('Reset semua hasil pertandingan?'))return;state.matches.forEach(m=>{m.homeScore=null;m.awayScore=null});saveState();renderAll();toast('Semua hasil direset.');}

function renderTeams(){
  document.getElementById('teamsGrid').innerHTML=state.teams.map(t=>`<article class="team-card"><div class="team-card-head"><div class="team-card-title"><img src="${t.logo}" alt=""><div><h3>${esc(t.name)}</h3><small>${esc(t.tag)}</small></div></div><div class="team-card-actions"><button class="edit-btn" onclick="openTeamModal('${t.id}')">Edit</button><button class="delete-btn" onclick="deleteTeam('${t.id}')">Hapus</button></div></div><div class="roster-list">${t.players.map((p,i)=>`<div class="roster-line"><span>${i+1}. ${esc(p.name)}</span><small>${esc(p.role)}</small></div>`).join('')}${t.substitutes.map(p=>`<div class="roster-line"><span>${esc(p.name)}</span><small>SUB • ${esc(p.role)}</small></div>`).join('')}<div class="roster-line"><span>Coach</span><small>${esc(t.coach)}</small></div></div></article>`).join('');
}

function deleteTeam(id){
  const t=teamById(id);
  if(!t) return;
  if(state.teams.length<=2){toast('Minimal harus ada 2 tim.');return;}
  const played=state.matches.filter(m=>(m.home===id||m.away===id)&&m.homeScore!=null).length;
  const message=played?`Tim ${t.name} memiliki ${played} hasil pertandingan. Menghapus tim akan menghapus pertandingan tim tersebut dari jadwal dan klasemen. Lanjutkan?`:`Hapus tim ${t.name}? Jadwal akan otomatis disesuaikan.`;
  if(!confirm(message)) return;
  state.teams=state.teams.filter(x=>x.id!==id);
  regenerateSchedule();
  saveState();renderAll();toast(`Tim ${t.name} dihapus dan jadwal diperbarui.`);
}

function openTeamModal(id){
  currentEditingTeam=id;
  const t=id?teamById(id):{id:null,name:'',tag:'',logo:DEFAULT_LOGO,players:Array.from({length:5},()=>({name:'',role:'FLEX'})),substitutes:Array.from({length:2},()=>({name:'',role:'FLEX'})),coach:''};
  document.getElementById('teamModalTitle').textContent=id?'Edit Tim':'Tambah/Edit Tim';
  document.getElementById('teamId').value=t.id||'';document.getElementById('teamName').value=t.name;document.getElementById('teamTag').value=t.tag;document.getElementById('coachName').value=t.coach;
  document.getElementById('logoPreview').src=t.logo;document.getElementById('logoPreview').style.display='block';document.getElementById('logoPlaceholder').style.display='none';document.getElementById('teamLogo').value='';
  document.getElementById('mainPlayers').innerHTML=t.players.map((p,i)=>`<div class="player-row"><input class="player-input" data-index="${i}" value="${esc(p.name)}" placeholder="Pemain ${i+1}"><select class="player-role" data-index="${i}">${['EXP','JUNGLE','MID','GOLD','ROAM','FLEX'].map(r=>`<option ${p.role===r?'selected':''}>${r}</option>`).join('')}</select></div>`).join('');
  document.getElementById('subPlayers').innerHTML=t.substitutes.map((p,i)=>`<div class="player-row"><input class="sub-input" data-index="${i}" value="${esc(p.name)}" placeholder="Cadangan ${i+1}"><select class="sub-role" data-index="${i}">${['EXP','JUNGLE','MID','GOLD','ROAM','FLEX'].map(r=>`<option ${p.role===r?'selected':''}>${r}</option>`).join('')}</select></div>`).join('');
  document.getElementById('teamModal').classList.add('show');
}
function closeTeamModal(){document.getElementById('teamModal').classList.remove('show');}

document.getElementById('teamLogo').addEventListener('change',e=>{const file=e.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{document.getElementById('logoPreview').src=reader.result;document.getElementById('logoPreview').style.display='block';document.getElementById('logoPlaceholder').style.display='none';};reader.readAsDataURL(file);});
document.getElementById('teamForm').addEventListener('submit',e=>{
  e.preventDefault();
  const id=document.getElementById('teamId').value;
  let t=id?teamById(id):null;
  const isNew=!t;
  if(!t){const idx=state.teams.length;t={id:`team-${Date.now()}`,name:'Team Baru',tag:`T${idx+1}`,logo:DEFAULT_LOGO,players:Array.from({length:5},()=>({name:'',role:'FLEX'})),substitutes:Array.from({length:2},()=>({name:'',role:'FLEX'})),coach:''};state.teams.push(t)}
  t.name=document.getElementById('teamName').value.trim()||'Team Baru';t.tag=document.getElementById('teamTag').value.trim().toUpperCase()||'TEAM';t.coach=document.getElementById('coachName').value.trim()||'-';t.logo=document.getElementById('logoPreview').src||DEFAULT_LOGO;
  t.players=[...document.querySelectorAll('.player-input')].map(x=>({name:x.value.trim()||'-',role:document.querySelector(`.player-role[data-index=\"${x.dataset.index}\"]`).value}));t.substitutes=[...document.querySelectorAll('.sub-input')].map(x=>({name:x.value.trim()||'-',role:document.querySelector(`.sub-role[data-index=\"${x.dataset.index}\"]`).value}));
  if(isNew) regenerateSchedule();
  saveState();closeTeamModal();renderAll();toast(isNew?'Tim baru ditambahkan dan jadwal disesuaikan.':'Data tim berhasil diperbarui.');
});

document.getElementById('scheduleRoundFilter').addEventListener('change',renderSchedule);document.getElementById('scheduleStatusFilter').addEventListener('change',renderSchedule);document.getElementById('mobileMenuBtn').addEventListener('click',()=>document.getElementById('mainNav').classList.toggle('open'));document.querySelectorAll('.nav-btn').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.page)));
document.getElementById('teamModal').addEventListener('click',e=>{if(e.target.id==='teamModal')closeTeamModal()});


document.getElementById('tournamentLogo').addEventListener('change',e=>{const file=e.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{document.getElementById('tournamentLogoPreview').src=reader.result;document.getElementById('tournamentLogoPreview').style.display='block';document.getElementById('tournamentLogoPlaceholder').style.display='none';document.getElementById('editorBrandLogo').src=reader.result;};reader.readAsDataURL(file);});
document.getElementById('playoffMethod').addEventListener('change',e=>{const m=PLAYOFF_METHODS[e.target.value]||PLAYOFF_METHODS.mpl6;document.getElementById('playoffMethodHelp').innerHTML=`<b>${m.label}</b><br>${m.note}`;document.getElementById('editorBrandMethod').textContent=m.label;document.getElementById('customBracketEditor').style.display=e.target.value==='custom'?'block':'none';if(e.target.value==='custom'){ensureCustomBracket();renderCustomEditor();}});
document.getElementById('settingsForm').addEventListener('submit',e=>{e.preventDefault();state.settings=state.settings||{};state.settings.name=document.getElementById('tournamentName').value.trim()||'MLBB TOURNAMENT';state.settings.playoffMethod=document.getElementById('playoffMethod').value;const preview=document.getElementById('tournamentLogoPreview').src;if(preview)state.settings.logo=preview;saveState();renderAll();toast('Pengaturan turnamen berhasil disimpan.');});

function renderRecent(){
  const played=state.matches.filter(m=>m.homeScore!=null).slice(-5).reverse();
  document.getElementById('recentMatches').innerHTML=played.length?played.map(m=>{const {h,a}=matchLabel(m);return `<div class="recent-row"><div>${esc(h.name)}</div><div class="score-pill">${m.homeScore} : ${m.awayScore}</div><div class="right">${esc(a.name)}</div></div>`}).join(''):`<div style="color:#8f98aa;font-size:12px;padding:12px 0">Belum ada hasil pertandingan.</div>`;
}
function ensureCustomBracket(){
  state.customBracket=state.customBracket||{rounds:[{name:'ROUND 1',matches:[{a:'Rank 1',b:'Rank 2',sa:'',sb:''},{a:'Rank 3',b:'Rank 4',sa:'',sb:''}]}]};
  if(!Array.isArray(state.customBracket.rounds)) state.customBracket.rounds=[];
}
function customOptions(selected){
  const ranks=calculateStandings().map((x,i)=>({value:`Rank ${i+1}`,label:`Rank ${i+1} — ${teamById(x.id)?.tag||''}`}));
  const base=['TBD','Winner Match 1','Winner Match 2','Winner Match 3','Winner Match 4','Loser Match 1','Loser Match 2'];
  const all=[...base,...ranks.map(x=>x.value)];
  return [...new Set(all)].map(v=>`<option value="${esc(v)}" ${v===selected?'selected':''}>${esc(v)}</option>`).join('');
}
function renderCustomEditor(){
  ensureCustomBracket();
  const box=document.getElementById('customRoundsEditor'); if(!box)return;
  box.innerHTML='<datalist id="customParticipants">'+calculateStandings().map((x,i)=>`<option value="Rank ${i+1}">${esc(teamById(x.id)?.name||'')}</option>`).join('')+'<option value="TBD"></option><option value="Winner Match 1"></option><option value="Winner Match 2"></option><option value="Winner Match 3"></option><option value="Winner Match 4"></option><option value="Loser Match 1"></option><option value="Loser Match 2"></option></datalist>'+state.customBracket.rounds.map((r,ri)=>`<div class="custom-round"><div class="custom-round-head"><input value="${esc(r.name)}" onchange="updateCustomRoundName(${ri},this.value)"><button class="delete-btn" onclick="deleteCustomRound(${ri})">Hapus Ronde</button></div><div class="custom-matches">${r.matches.map((m,mi)=>`<div class="custom-match"><div class="custom-match-title">Match ${mi+1}<button class="delete-btn" onclick="deleteCustomMatch(${ri},${mi})">×</button></div><div class="custom-slot"><input list="customParticipants" value="${esc(m.a||'TBD')}" placeholder="Peserta / TBD" onchange="updateCustomSlot(${ri},${mi},'a',this.value)"><input class="custom-score" value="${esc(m.sa)}" placeholder="-" onchange="updateCustomSlot(${ri},${mi},'sa',this.value)"></div><div class="custom-slot"><input list="customParticipants" value="${esc(m.b||'TBD')}" placeholder="Peserta / TBD" onchange="updateCustomSlot(${ri},${mi},'b',this.value)"><input class="custom-score" value="${esc(m.sb)}" placeholder="-" onchange="updateCustomSlot(${ri},${mi},'sb',this.value)"></div></div>`).join('')}</div><button class="secondary" onclick="addCustomMatch(${ri})">＋ Tambah Match</button></div>`).join('')||'<div class="info-banner">Belum ada ronde. Tambahkan ronde untuk mulai membuat bracket.</div>';
}
function updateCustomRoundName(ri,value){ensureCustomBracket();state.customBracket.rounds[ri].name=value.trim()||`ROUND ${ri+1}`;saveState();renderPlayoffs();}
function updateCustomSlot(ri,mi,key,value){ensureCustomBracket();state.customBracket.rounds[ri].matches[mi][key]=value;saveState();renderPlayoffs();}
function addCustomRound(){ensureCustomBracket();const n=state.customBracket.rounds.length+1;state.customBracket.rounds.push({name:`ROUND ${n}`,matches:[{a:'TBD',b:'TBD',sa:'',sb:''}]});saveState();renderCustomEditor();renderPlayoffs();}
function deleteCustomRound(ri){if(!confirm('Hapus ronde ini beserta semua match di dalamnya?'))return;state.customBracket.rounds.splice(ri,1);saveState();renderCustomEditor();renderPlayoffs();}
function addCustomMatch(ri){ensureCustomBracket();state.customBracket.rounds[ri].matches.push({a:'TBD',b:'TBD',sa:'',sb:''});saveState();renderCustomEditor();renderPlayoffs();}
function deleteCustomMatch(ri,mi){state.customBracket.rounds[ri].matches.splice(mi,1);saveState();renderCustomEditor();renderPlayoffs();}
function resetCustomBracket(){if(!confirm('Reset bracket custom?'))return;state.customBracket={rounds:[]};saveState();renderCustomEditor();renderPlayoffs();}

function renderPlayoffs(){
  const method=activePlayoff(), n=method.qualifiers;
  if(state.settings?.playoffMethod==='custom'){
    ensureCustomBracket();
    document.getElementById('bracket').innerHTML=state.customBracket.rounds.map(r=>`<div class="round-col"><div class="round-title">${esc(r.name)}</div>${r.matches.map(m=>`<div class="bracket-match"><div class="b-team"><span>${esc(m.a||'TBD')}</span><span class="b-score">${esc(m.sa||'-')}</span></div><div class="b-team"><span>${esc(m.b||'TBD')}</span><span class="b-score">${esc(m.sb||'-')}</span></div></div>`).join('')}</div>`).join('')||'<div class="info-banner">Bracket custom masih kosong. Buka Editor Turnamen lalu tambahkan ronde dan match.</div>';
    return;
  }
  const s=calculateStandings().slice(0,n);
  const names=s.map((x,i)=>`#${i+1} ${teamById(x.id)?.tag||'TBD'}`);
  const fill=i=>names[i]||`Rank ${i+1}`;
  let cols=[];
  if(state.teams.length<n){
    document.getElementById('bracket').innerHTML=`<div class="info-banner">Metode <b>${method.label}</b> membutuhkan ${n} tim, tetapi saat ini hanya ada ${state.teams.length}. Tambahkan tim atau pilih metode playoff yang sesuai.</div>`;
    return;
  }
  if(state.teams.length>=n){
    if(state.settings.playoffMethod==='mpl6'){
      cols=[{title:'LOWER / QF',items:[[fill(2),'',fill(5),''],[fill(3),'',fill(4),'']]},{title:'UPPER SEMIFINAL',items:[[fill(0),'',fill(1),''],['Winner QF 1','','Winner QF 2','']]},{title:'UPPER FINAL',items:[['Winner USF 1','','Winner USF 2','']]},{title:'GRAND FINAL',items:[['Winner Upper','','Winner Lower','']]}];
    }else if(state.settings.playoffMethod==='single8'){
      cols=[{title:'QUARTERFINAL',items:[[fill(0),'',fill(7),''],[fill(3),'',fill(4),''],[fill(2),'',fill(5),''],[fill(1),'',fill(6),'']]},{title:'SEMIFINAL',items:[['Winner QF 1','','Winner QF 2',''],['Winner QF 3','','Winner QF 4','']]},{title:'GRAND FINAL',items:[['Winner SF 1','','Winner SF 2','']]}];
    }else if(state.settings.playoffMethod==='double8'){
      cols=[{title:'UPPER QUARTERFINAL',items:[[fill(0),'',fill(7),''],[fill(3),'',fill(4),''],[fill(2),'',fill(5),''],[fill(1),'',fill(6),'']]},{title:'UPPER SEMIFINAL',items:[['Winner UQF 1','','Winner UQF 2',''],['Winner UQF 3','','Winner UQF 4','']]},{title:'UPPER FINAL',items:[['Winner USF 1','','Winner USF 2','']]},{title:'LOWER BRACKET',items:[['Loser UQF 1','','Loser UQF 2',''],['Loser UQF 3','','Loser UQF 4',''],['Winner LB','','Loser UF','']]},{title:'GRAND FINAL',items:[['Winner Upper','','Winner Lower','']]}];
    }else if(state.settings.playoffMethod==='single6'){
      cols=[{title:'QUARTERFINAL',items:[[fill(2),'',fill(5),''],[fill(3),'',fill(4),'']]},{title:'SEMIFINAL',items:[[fill(0),'','Winner QF 1',''],[fill(1),'','Winner QF 2','']]},{title:'GRAND FINAL',items:[['Winner SF 1','','Winner SF 2','']]}];
    }else{
      cols=[{title:'SEMIFINAL',items:[[fill(0),'',fill(3),''],[fill(1),'',fill(2),'']]},{title:'GRAND FINAL',items:[['Winner SF 1','','Winner SF 2','']]}];
    }
  }
  document.getElementById('bracket').innerHTML=cols.map(col=>`<div class="round-col"><div class="round-title">${col.title}</div>${col.items.map(x=>`<div class="bracket-match"><div class="b-team"><span>${esc(x[0])}</span><span class="b-score">-</span></div><div class="b-team"><span>${esc(x[2])}</span><span class="b-score">-</span></div></div>`).join('')}</div>`).join('');
}
function renderAll(){renderTournamentBrand();renderSettings();renderStats();renderStandings();renderSchedule();renderResults();renderTeams();renderRecent();renderPlayoffs();}
function toast(msg){const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2200)}
renderAll();
