(() => {
 const total=document.getElementById("stationTotal");
 const countryTotal=document.getElementById("countryTotal");
 const sourceStatus=document.getElementById("dataSourceStatus");
 const refreshButton=document.getElementById("refreshStations");
 let loading=false;
 async function updateMetrics(){
   total.textContent=window.WW_STATIONS.length.toLocaleString();
   countryTotal.textContent=new Set(window.WW_STATIONS.map(s=>s.country).filter(Boolean)).size.toLocaleString();
   if(window.WW_API){
     try{
       const stats=await window.WW_API.getStats();
       if(Number.isFinite(Number(stats.stations)))total.textContent=Number(stats.stations).toLocaleString();
       if(Number.isFinite(Number(stats.countries)))countryTotal.textContent=Number(stats.countries).toLocaleString();
     }catch(_){ /* keep the loaded-catalogue metrics when the API is unavailable */ }
   }
 }
 function setSource(message, state="neutral"){
   sourceStatus.textContent=message;
   sourceStatus.dataset.state=state;
 }
 async function loadDirectory(force=false){
   if(loading)return; loading=true; refreshButton.disabled=true;
   setSource("CONNECTING TO RADIO DIRECTORY…", "loading");
   try{
     const result=await window.WW_RADIO_BROWSER.loadFeatured();
     window.WW_STATIONS=result.stations;
     /* 统计接口不可达时不应阻塞目录状态更新，放到后台执行即可。 */
     updateMetrics().catch(()=>{});
     window.WW.render();
     window.WW.restoreLastStation?.();
     window.WW_GLOBE?.draw?.();
     setSource(`${result.source || (result.cached?"CACHED DIRECTORY DATA":"LIVE DIRECTORY DATA")} · ${window.WW_STATIONS.length} GEOLOCATED STATIONS`, "success");
     window.WW.toast(result.cached?"Loaded recently cached station data":"Real station directory connected");
   }catch(error){
     setSource("DIRECTORY OFFLINE · DEMO DATA", "warning");
     console.warn("Radio Browser connection failed:",error);
     window.WW.toast("Could not reach the station directory. Demo stations remain available.");
   }finally{loading=false;refreshButton.disabled=false;}
 }
 refreshButton.addEventListener("click",()=>{
   try{localStorage.removeItem(window.WW_RADIO_BROWSER.cacheKey)}catch(_){}
   loadDirectory(true);
 });
 document.getElementById("stationSearch").addEventListener("keydown",async event=>{
   if(event.key!=="Enter")return;
   const query=event.currentTarget.value.trim();
   if(query.length<2)return;
   setSource("SEARCHING GLOBAL DIRECTORY…", "loading");
   try{
     const results=await window.WW_RADIO_BROWSER.search(query);
     if(results.length){
       const merged=new Map(window.WW_STATIONS.map(s=>[s.id,s]));
       results.forEach(s=>merged.set(s.id,s));
       window.WW_STATIONS=[...merged.values()];
       window.WW.render();window.WW_GLOBE?.draw?.();updateMetrics();
       setSource(`DIRECTORY SEARCH · ${results.length} MATCHES ADDED`, "success");
     }else setSource("NO DIRECTORY MATCHES · FILTERING LOADED STATIONS", "warning");
   }catch(error){setSource("DIRECTORY SEARCH UNAVAILABLE", "warning");}
 });
 updateMetrics();
 console.info("WORLDWAVE Prototype 06 ready. Connecting to Radio Browser…");
 loadDirectory();
})();
