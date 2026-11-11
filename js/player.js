(() => {
 const audio=document.getElementById("audioElement"),play=document.getElementById("playButton");
 const status=document.getElementById("playerStatus"),eq=document.getElementById("equalizer");
 let current=null,playing=false,historyRecordedFor=null,autoplayPreference=false;
 function setStatus(text){status.textContent=text}
 const volumeControl=document.getElementById("volumeControl");
 if(window.WW_API?.user){window.WW_API.user.me().then(({data})=>{const pref=data.playbackPreferences||{};if(Number.isFinite(Number(pref.volume))){audio.volume=Number(pref.volume);volumeControl.value=String(pref.volume);}autoplayPreference=!!pref.autoplay;window.WW_PLAYER_PREFERENCES={autoplay:autoplayPreference,quality:pref.quality||"auto"};}).catch(()=>{});}
 function paint(){
   play.textContent=playing?"Ⅱ":"▶";play.setAttribute("aria-label",playing?"Pause":"Play");
   eq.classList.toggle("active",playing);
 }
 async function load(station){
   if(!station)return;current=station;historyRecordedFor=null;
   document.getElementById("nowStation").textContent=station.name;
   document.getElementById("nowLocation").textContent=station.city+" · "+station.genre;
   document.getElementById("playerArt").textContent=station.code||"WW";
   document.getElementById("playerFavorite").classList.toggle("active",window.WW.isFavorite(station.id));
   document.getElementById("playerFavorite").textContent=window.WW.isFavorite(station.id)?"♥":"♡";
   audio.src=station.stream;audio.load();playing=false;paint();setStatus("CONNECTING…");
   try{await audio.play();playing=true;setStatus("LIVE · NOW PLAYING");paint()}
   catch(err){playing=false;paint();setStatus("STREAM UNAVAILABLE");window.WW.toast("This stream could not start. Try another station.");}
 }
 play.addEventListener("click",async()=>{
   if(!current){window.WW.toast("Choose a station to begin listening.");return}
   if(playing){audio.pause();playing=false;setStatus("PAUSED");paint()}
   else{try{await audio.play();playing=true;setStatus("LIVE · NOW PLAYING");paint()}catch(e){setStatus("STREAM UNAVAILABLE");window.WW.toast("Unable to play this stream right now.")}}
 });
 audio.addEventListener("playing",()=>{playing=true;setStatus("LIVE · NOW PLAYING");paint();if(current?.uuid&&historyRecordedFor!==current.uuid&&window.WW_API?.user){const stationUuid=current.uuid;historyRecordedFor=stationUuid;window.WW_API.user.me().then(()=>window.WW_API.user.recordHistory({stationUuid})).catch(()=>{});}});
 audio.addEventListener("waiting",()=>setStatus("BUFFERING…"));
 audio.addEventListener("stalled",()=>setStatus("RECONNECTING…"));
 audio.addEventListener("error",()=>{playing=false;paint();setStatus("STREAM UNAVAILABLE")});
 volumeControl.addEventListener("input",e=>audio.volume=Number(e.target.value));
 document.getElementById("playerFavorite").addEventListener("click",()=>{if(current)window.WW.toggleFavorite(current.id)});
 document.getElementById("nextButton").addEventListener("click",()=>window.WW.nextStation(1));
 document.getElementById("previousButton").addEventListener("click",()=>window.WW.nextStation(-1));
 window.WW_PLAYER={load,getCurrent:()=>current,isPlaying:()=>playing};
})();