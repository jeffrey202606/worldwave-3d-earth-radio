(() => {
 const list=document.getElementById("stationList"),search=document.getElementById("stationSearch");
 let activeGenre="All",query="",view="explore";
 /* 收藏数据可能被其它版本或手工改坏，解析失败时退回空集合而不是让整个 UI 脚本崩溃。 */
 let favorites;
 try{const stored=JSON.parse(localStorage.getItem("ww-favorites")||"[]");favorites=new Set(Array.isArray(stored)?stored:[]);}
 catch(_){favorites=new Set();}
 let cloudAccount=false;
 const $=id=>document.getElementById(id);
 function render(){
   let data=(window.WW_STATIONS||[]).filter(s=>(activeGenre==="All"||s.genre===activeGenre||activeGenre==="World"&&s.genre==="World")&&(`${s.name} ${s.city} ${s.country} ${s.genre}`.toLowerCase().includes(query.toLowerCase())));
   if(view==="favorites")data=data.filter(s=>favorites.has(s.id));
   $("stationListTitle").textContent=view==="favorites"?"Your favorites":activeGenre==="All"?"Around the world":activeGenre+" stations";
   $("favoriteCount").textContent=favorites.size;
   if(!data.length){list.innerHTML='<div class="empty-state">No stations found. Try another search or genre.</div>';return}
   list.innerHTML=data.slice(0,300).map(s=>`<div class="station-row" data-id="${escapeHTML(s.id)}"><div class="station-thumb">${escapeHTML(s.code||"WW")}</div><div class="station-info"><strong>${escapeHTML(s.name)}</strong><span>${escapeHTML(s.city)} · ${escapeHTML(s.genre)}${s.country?" · "+escapeHTML(s.country):""}</span></div><button class="station-play" data-play="${escapeHTML(s.id)}" aria-label="Play ${escapeHTML(s.name)}">▶</button></div>`).join("");
   list.querySelectorAll(".station-row").forEach(row=>row.addEventListener("click",e=>{if(!e.target.closest("[data-play]"))window.WW.selectStation(row.dataset.id)}));
   list.querySelectorAll("[data-play]").forEach(btn=>btn.addEventListener("click",e=>{e.stopPropagation();window.WW.selectStation(btn.dataset.play)}));
 }
 function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
 function toast(message){const t=$("toast");t.textContent=message;t.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove("show"),2400)}
 function selectStation(id){const s=(window.WW_STATIONS||[]).find(x=>x.id===id);if(!s)return;localStorage.setItem("ww-last-station",id);window.WW_PLAYER.load(s);window.WW_GLOBE?.focus?.(id);if(s.uuid)window.WW_RADIO_BROWSER?.countClick?.(s.uuid);document.querySelectorAll(".station-row").forEach(r=>r.classList.toggle("selected",r.dataset.id===id));}
 async function toggleFavorite(id){const wasFavorite=favorites.has(id);wasFavorite?favorites.delete(id):favorites.add(id);localStorage.setItem("ww-favorites",JSON.stringify([...favorites]));const station=(window.WW_STATIONS||[]).find(s=>s.id===id);if(cloudAccount&&station?.uuid){try{if(wasFavorite)await window.WW_API.user.removeFavorite(station.uuid);else await window.WW_API.user.addFavorite(station.uuid);}catch(error){toast(`Cloud sync failed: ${error.message}`);}}$("favoriteCount").textContent=favorites.size;const current=window.WW_PLAYER.getCurrent();if(current&&current.id===id){$("playerFavorite").classList.toggle("active",favorites.has(id));$("playerFavorite").textContent=favorites.has(id)?"♥":"♡"}render();toast(favorites.has(id)?"Added to favorites":"Removed from favorites")}
 function nextStation(direction){const stations=Array.isArray(window.WW_STATIONS)?window.WW_STATIONS:[];if(!stations.length){toast("No stations available.");return;}const current=window.WW_PLAYER.getCurrent(),index=stations.findIndex(s=>current&&s.id===current.id);selectStation(stations[(index+direction+stations.length)%stations.length].id)}
 search.addEventListener("input",e=>{query=e.target.value;render()});
 document.querySelectorAll(".filter-chip").forEach(b=>b.addEventListener("click",()=>{activeGenre=b.dataset.genre;document.querySelectorAll(".filter-chip").forEach(x=>x.classList.toggle("active",x===b));view="explore";render()}));
 document.querySelectorAll("[data-genre-card]").forEach(b=>b.addEventListener("click",()=>{activeGenre=b.dataset.genreCard;document.querySelectorAll(".filter-chip").forEach(x=>x.classList.toggle("active",x.dataset.genre===activeGenre));view="explore";$("exploreView").scrollIntoView({behavior:"smooth"});render()}));
 document.querySelectorAll(".nav-link").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".nav-link").forEach(x=>x.classList.toggle("active",x===b));view=b.dataset.view==="favorites"?"favorites":"explore";if(view==="explore")activeGenre="All";render();if(view==="favorites")$("stationList").scrollIntoView({behavior:"smooth",block:"center"})}));
 $("shuffleButton").addEventListener("click",()=>{const choices=(window.WW_STATIONS||[]).filter(s=>activeGenre==="All"||s.genre===activeGenre);if(!choices.length){toast("No stations match this filter.");return;}selectStation(choices[Math.floor(Math.random()*choices.length)].id)});
 $("viewAllButton").addEventListener("click",()=>{activeGenre="All";query="";search.value="";view="explore";document.querySelectorAll(".filter-chip").forEach(x=>x.classList.toggle("active",x.dataset.genre==="All"));render();toast("Showing all loaded stations")});
 $("languageButton").addEventListener("click",()=>toast("More languages are planned for a future release."));
 $("soundToggle").addEventListener("click",()=>toast("Interface sound is not enabled in this prototype."));
 document.addEventListener("keydown",e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="k"){e.preventDefault();search.focus()}if(e.key==="Escape")search.blur()});
 let shouldRestoreLastStation=false;
 function restoreLastStation(){if(!shouldRestoreLastStation)return;const id=localStorage.getItem("ww-last-station");if(id&&(window.WW_STATIONS||[]).some(s=>s.id===id)){shouldRestoreLastStation=false;selectStation(id);}}
 window.WW={selectStation,toggleFavorite,isFavorite:id=>favorites.has(id),nextStation,toast,render,restoreLastStation};
 render();
 if(window.WW_API?.user){window.WW_API.user.me().then(async({data:user})=>{cloudAccount=true;shouldRestoreLastStation=!!user?.playbackPreferences?.autoplay;const result=await window.WW_API.user.favorites();favorites.clear();((result&&result.data)||[]).forEach(item=>favorites.add(`rb-${item.uuid}`));localStorage.setItem("ww-favorites",JSON.stringify([...favorites]));render();restoreLastStation();}).catch(()=>{cloudAccount=false;});}
})();
