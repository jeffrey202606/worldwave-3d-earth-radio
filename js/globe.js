/* WORLDWAVE Prototype 06 — Three.js WebGL globe: detailed Earth, place labels, zoom. */
import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
(() => {
 const host=document.getElementById('globeCanvas'); if(!host)return;
 const scene=new THREE.Scene(); scene.background=null;
 const camera=new THREE.PerspectiveCamera(34,1,.1,200);camera.position.set(0,0,8.2);
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.04;host.appendChild(renderer.domElement);
 const maxAniso=renderer.capabilities.getMaxAnisotropy();
 const controls=new OrbitControls(camera,renderer.domElement);
 controls.enableDamping=true;controls.dampingFactor=.045;controls.enablePan=false;
 controls.minDistance=2.9;controls.maxDistance=16;controls.rotateSpeed=.55;controls.zoomSpeed=.9;
 controls.autoRotate=true;controls.autoRotateSpeed=.30;
 scene.add(new THREE.AmbientLight(0x9bb8d2,.72));
 const sun=new THREE.DirectionalLight(0xffe9cf,2.75);sun.position.set(-5,2.5,5);scene.add(sun);
 const fill=new THREE.DirectionalLight(0x4c82c5,.55);fill.position.set(4,-2,-4);scene.add(fill);

 const loader=new THREE.TextureLoader();loader.setCrossOrigin('anonymous');
 const tune=(t,srgb=true)=>{t.anisotropy=maxAniso;if(srgb)t.colorSpace=THREE.SRGBColorSpace;t.needsUpdate=true;return t;};
 const earthGroup=new THREE.Group();scene.add(earthGroup);
 /* 高细分球体 + 4K 卫星影像 / 地形凹凸 / 海洋高光 / 夜间灯光，强化地表细节。 */
 const earthGeo=new THREE.SphereGeometry(2.35,160,160);
 const earthMat=new THREE.MeshPhongMaterial({color:0xffffff,specular:new THREE.Color(0x3b5c72),shininess:22,
   bumpScale:.042,emissive:new THREE.Color(0x000000),emissiveIntensity:0});
 const earth=new THREE.Mesh(earthGeo,earthMat);earthGroup.add(earth);
 loader.load('./vendor/earth-blue-marble.jpg',t=>{earthMat.map=tune(t);earthMat.needsUpdate=true;},undefined,()=>{earthMat.color.set(0x31536a)});
 loader.load('./vendor/earth-topology.png',t=>{earthMat.bumpMap=tune(t,false);earthMat.needsUpdate=true;});
 loader.load('./vendor/earth-water.png',t=>{earthMat.specularMap=tune(t,false);earthMat.needsUpdate=true;});
 loader.load('./vendor/earth-night.jpg',t=>{earthMat.emissiveMap=tune(t);earthMat.emissive.set(0x4a6a96);earthMat.emissiveIntensity=.32;earthMat.needsUpdate=true;});
 const cloudMat=new THREE.MeshPhongMaterial({transparent:true,opacity:.12,depthWrite:false});
 const clouds=new THREE.Mesh(new THREE.SphereGeometry(2.372,96,96),cloudMat);earthGroup.add(clouds);
 loader.load('./vendor/clouds.png',t=>{cloudMat.map=tune(t);cloudMat.needsUpdate=true;},undefined,()=>{});
 /* 大气层已按需求移除。 */
 // Background star field.
 const starGeo=new THREE.BufferGeometry(),starPos=[];for(let i=0;i<2600;i++){const r=18+Math.random()*26,a=Math.random()*Math.PI*2,z=Math.random()*2-1,q=Math.sqrt(1-z*z);starPos.push(r*q*Math.cos(a),r*z,r*q*Math.sin(a));}starGeo.setAttribute('position',new THREE.Float32BufferAttribute(starPos,3));scene.add(new THREE.Points(starGeo,new THREE.PointsMaterial({color:0x9eb9c8,size:.03,transparent:true,opacity:.8,sizeAttenuation:true})));

 function coords(lat,lon,r=2.39){const phi=(90-lat)*Math.PI/180,theta=(lon+180)*Math.PI/180;return new THREE.Vector3(-r*Math.sin(phi)*Math.cos(theta),r*Math.cos(phi),r*Math.sin(phi)*Math.sin(theta));}
 const markerCanvas=document.createElement('canvas');markerCanvas.width=64;markerCanvas.height=64;const mc=markerCanvas.getContext('2d');const grad=mc.createRadialGradient(32,32,1,32,32,31);grad.addColorStop(0,'rgba(150,255,214,1)');grad.addColorStop(.18,'rgba(40,255,168,.98)');grad.addColorStop(.42,'rgba(18,225,143,.35)');grad.addColorStop(1,'rgba(18,225,143,0)');mc.fillStyle=grad;mc.fillRect(0,0,64,64);const markerTexture=new THREE.CanvasTexture(markerCanvas);
 let markerPoints=null,stationRefs=[],selectedRing=null;
 const ringMat=new THREE.MeshBasicMaterial({color:0x27ffad,transparent:true,opacity:.95,side:THREE.DoubleSide});
 function setStations(stations){if(markerPoints){earthGroup.remove(markerPoints);markerPoints.geometry.dispose();markerPoints.material.dispose();}
  stationRefs=stations.filter(s=>Number.isFinite(Number(s.lat))&&Number.isFinite(Number(s.lon)));const arr=new Float32Array(stationRefs.length*3);stationRefs.forEach((s,i)=>{const p=coords(Number(s.lat),Number(s.lon));arr[i*3]=p.x;arr[i*3+1]=p.y;arr[i*3+2]=p.z;});
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(arr,3));const mat=new THREE.PointsMaterial({color:0x24f0a2,size:.075,map:markerTexture,transparent:true,alphaTest:.025,depthWrite:false,sizeAttenuation:true,blending:THREE.AdditiveBlending});markerPoints=new THREE.Points(geo,mat);markerPoints.renderOrder=4;earthGroup.add(markerPoints);
 }
 const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();raycaster.params.Points.threshold=.065;
 renderer.domElement.addEventListener('click',e=>{const rect=renderer.domElement.getBoundingClientRect();pointer.x=((e.clientX-rect.left)/rect.width)*2-1;pointer.y=-((e.clientY-rect.top)/rect.height)*2+1;raycaster.setFromCamera(pointer,camera);if(!markerPoints)return;const hits=raycaster.intersectObject(markerPoints);for(const hit of hits){if(hit.point.z<0.05)continue;const station=stationRefs[hit.index];if(station){window.WW?.selectStation(station.id);focus(station);break;}}});
 function focus(station){const target=coords(Number(station.lat),Number(station.lon),2.39);earthGroup.updateMatrixWorld(true);const world=earthGroup.localToWorld(target.clone());const dir=world.clone().normalize();camera.position.copy(dir.clone().multiplyScalar(7.2));camera.lookAt(0,0,0);controls.target.set(0,0,0);controls.update();if(selectedRing){earthGroup.remove(selectedRing);selectedRing.geometry.dispose();}selectedRing=new THREE.Mesh(new THREE.RingGeometry(.065,.09,48),ringMat);selectedRing.position.copy(target.clone().multiplyScalar(1.008));selectedRing.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),target.clone().normalize());earthGroup.add(selectedRing);}

 /* 地域名称：按相机距离分层显示，背面的标签自动隐藏。 */
 const labelLayer=document.getElementById('globeLabels')||(()=>{const d=document.createElement('div');d.id='globeLabels';document.body.appendChild(d);return d;})();
 /* 完整版页面的地球画布只是面板内的一块区域，标签坐标必须换算到视口并裁剪在画布内。 */
 const bottomGuard=document.querySelector('.globe-caption')?30:0;
 const PLACES=[
  {n:'北美洲',lat:47,lon:-103,level:1,kind:'continent',alpha:.8},
  {n:'南美洲',lat:-15,lon:-60,level:1,kind:'continent',alpha:.8},
  {n:'欧洲',lat:50,lon:16,level:1,kind:'continent',alpha:.8},
  {n:'非洲',lat:2,lon:20,level:1,kind:'continent',alpha:.8},
  {n:'亚洲',lat:42,lon:90,level:1,kind:'continent',alpha:.8},
  {n:'大洋洲',lat:-25,lon:135,level:1,kind:'continent',alpha:.8},
  {n:'太平洋',lat:5,lon:-155,level:1,kind:'ocean',alpha:.7},
  {n:'大西洋',lat:15,lon:-35,level:1,kind:'ocean',alpha:.7},
  {n:'印度洋',lat:-15,lon:75,level:1,kind:'ocean',alpha:.7},
  {n:'纽约',lat:40.71,lon:-74.01,level:2},
  {n:'伦敦',lat:51.51,lon:-.13,level:2},
  {n:'巴黎',lat:48.86,lon:2.35,level:2},
  {n:'东京',lat:35.68,lon:139.69,level:2},
  {n:'北京',lat:39.90,lon:116.41,level:2},
  {n:'迪拜',lat:25.20,lon:55.27,level:2},
  {n:'开罗',lat:30.04,lon:31.24,level:2},
  {n:'悉尼',lat:-33.87,lon:151.21,level:2},
  {n:'里约热内卢',lat:-22.91,lon:-43.17,level:2},
  {n:'莫斯科',lat:55.75,lon:37.62,level:2},
  {n:'洛杉矶',lat:34.05,lon:-118.24,level:2},
  {n:'新加坡',lat:1.35,lon:103.82,level:2},
  {n:'孟买',lat:19.08,lon:72.88,level:3},
  {n:'内罗毕',lat:-1.29,lon:36.82,level:3},
  {n:'开普敦',lat:-33.92,lon:18.42,level:3},
  {n:'雷克雅未克',lat:64.15,lon:-21.94,level:3},
  {n:'伊斯坦布尔',lat:41.01,lon:28.98,level:3},
  {n:'首尔',lat:37.57,lon:126.98,level:3},
  {n:'曼谷',lat:13.76,lon:100.50,level:3},
  {n:'墨西哥城',lat:19.43,lon:-99.13,level:3},
  {n:'布宜诺斯艾利斯',lat:-34.60,lon:-58.38,level:3},
  {n:'奥克兰',lat:-36.85,lon:174.76,level:3},
  {n:'檀香山',lat:21.31,lon:-157.86,level:3}
 ];
 const labels=PLACES.map(p=>{const el=document.createElement('div');el.className='globe-label'+(p.kind?' '+p.kind:'');el.lang='zh-CN';el.innerHTML='<i></i><span>'+p.n+'</span>';labelLayer.appendChild(el);return {...p,el,pos:coords(p.lat,p.lon,2.39),alpha:p.alpha??.85};});
 const hide=el=>{if(el.style.visibility!=='hidden'){el.style.visibility='hidden';el.style.opacity='0';}};
 function updateLabels(){
  const rect=renderer.domElement.getBoundingClientRect();
  if(!rect.width||!rect.height)return;
  const d=camera.position.length();
  /* 小画布上限制标签层级，避免地名挤成一团。 */
  const level=Math.min(d>10?1:d>6.6?2:3,rect.width<800?2:3);
  const camDir=camera.position.clone().normalize();
  for(const l of labels){
   if(l.level>level||(l.level===1&&level===3)){hide(l.el);continue;}
   const facing=l.pos.clone().normalize().dot(camDir);
   if(facing<.1){hide(l.el);continue;}
   const p=l.pos.clone().project(camera);
   const x=rect.left+(p.x*.5+.5)*rect.width,y=rect.top+(-p.y*.5+.5)*rect.height;
   /* 只画在地球画布范围内；底部留出说明文字的空间。 */
   if(x<rect.left+2||x>rect.right-2||y<rect.top+2||y>rect.bottom-bottomGuard){hide(l.el);continue;}
   l.el.style.transform='translate(-50%,-50%) translate('+x.toFixed(1)+'px,'+y.toFixed(1)+'px)';
   l.el.style.visibility='visible';
   l.el.style.opacity=String(Math.min(1,(facing-.1)*3.2)*l.alpha);
  }
 }

 /* 缩放：滚轮 / 触控双指 / 右下角按钮 / 键盘 + - 0。 */
 const zoomBy=f=>{const d=camera.position.length()*f;camera.position.setLength(Math.min(controls.maxDistance,Math.max(controls.minDistance,d)));controls.update();};
 const reset=()=>{camera.position.set(0,0,8.2);controls.target.set(0,0,0);controls.update();};
 document.getElementById('zoomIn')?.addEventListener('click',()=>zoomBy(.86));
 document.getElementById('zoomOut')?.addEventListener('click',()=>zoomBy(1.16));
 document.getElementById('resetGlobe')?.addEventListener('click',reset);
 window.addEventListener('keydown',e=>{if(e.key==='+'||e.key==='='){zoomBy(.88);}else if(e.key==='-'||e.key==='_'){zoomBy(1.13);}else if(e.key==='0'){reset();}});

 const resize=()=>{const w=host.clientWidth||600,h=host.clientHeight||490;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);};new ResizeObserver(resize).observe(host);resize();
 function animate(){requestAnimationFrame(animate);controls.update();clouds.rotation.y+=.00012;renderer.render(scene,camera);updateLabels();}animate();
 window.WW_GLOBE={draw(){setStations(window.WW_STATIONS||[]);},resize,zoom:zoomBy,reset,focus(id){const s=stationRefs.find(x=>x.id===id);if(s)focus(s);}};setStations(window.WW_STATIONS||[]);
})();
