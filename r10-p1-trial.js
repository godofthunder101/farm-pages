import {createTrial,step,snapshot,dungeonInspection,availableFrontier} from "./r10-p1-trial-modules/r10-p1-trial/session.js";
import {renderSvg,diagnostic} from "./r10-p1-trial-modules/r10-p1-trial/inspection.js";
import {createFarmRenderer,projectParcel,hitParcel,fitOwned,unitSize,iso} from "./r10-p1-trial-modules/r10-p1-trial/farm-renderer.js";
import {createRenderer} from "./r10-p1-trial-modules/r09-p3/renderer.js";
const $=id=>{const e=document.getElementById(id);if(!e)throw Error("P1_UI_MISSING "+id);return e;};
const canvas=$("world"),viewport=$("viewport"),markers=$("markers"),dialog=$("settings");
let fixture,trial=createTrial(),farmRenderer,dungeonRenderer,selection=null;
let biomeChoice="grassland",svgURL=null,overview=false,previousCamera=null,dungeonCamera=null;
let cam={focusX:0,focusY:0,zoom:1.2},anim=0,lastFrame=null;
let device=null,motion="device";
try{device=window.matchMedia("(prefers-reduced-motion: reduce)");}catch{}
try{const stored=localStorage.getItem("p1-t01-motion");if(stored==="on"||stored==="off")motion=stored;}catch{}
function reduced(){return motion==="on"||(motion==="device"&&(!device||device.matches));}
function updateSettings(){
 const choice=dialog.querySelector('input[name="motion"][value="'+motion+'"]');
 if(choice)choice.checked=true;
 $("deviceStatus").textContent=motion==="device"?
  (!device?"Device preference unavailable — using reduced motion":
   "Device preference: Reduced Motion "+(device.matches?"On":"Off")):"Explicit override active";
}
updateSettings();
if(device){const change=()=>{updateSettings();if(motion==="device"&&reduced())anim++;};if(device.addEventListener)device.addEventListener("change",change);else device.addListener(change);}
function status(text,kind="info"){
 const e=$("status");e.textContent=text;e.dataset.kind=kind;
 // An accessible status request is not evidence that a screen reader actually spoke.
 e.dataset.delivery="Attempted — Unconfirmed";
}
function canvasSize(){
 const box=canvas.getBoundingClientRect(),dpi=Math.min(2,Math.max(1,window.devicePixelRatio||1));
 const w=Math.round(box.width*dpi),h=Math.round(box.height*dpi);
 if(w>0&&h>0&&(canvas.width!==w||canvas.height!==h)){canvas.width=w;canvas.height=h;}
}
function dimensions(){return [viewport.clientWidth,viewport.clientHeight];}
function animateTo(target){
 anim++;const token=anim,from={...cam};
 if(reduced()){cam={...target};draw();return;}
 const start=performance.now();
 function frame(now){
  if(token!==anim)return;
  const t=Math.min(1,(now-start)/180),u=t*t*(3-2*t);
  cam={focusX:from.focusX+(target.focusX-from.focusX)*u,
   focusY:from.focusY+(target.focusY-from.focusY)*u,zoom:from.zoom+(target.zoom-from.zoom)*u};
  draw();
  if(t<1)requestAnimationFrame(frame);
 }
 requestAnimationFrame(frame);
}
function fitAll(animate=true){
 const [w,h]=dimensions();
 const target=fitOwned(trial,w,h,Math.max(120,h-($("dock").hidden?0:110)));
 if(animate)animateTo(target);else{anim++;cam=target;draw();}
}
function select(kind,key){
 if(trial.mode!=="farm")return;
 selection={kind,key};
 updateDock();draw();
}
function chosenPoint(key){
 const [x,y]=key.split(",").map(Number);return {x,y};
}
function marker(className,label,x,y,onClick){
 const [w,h]=dimensions(),[sx,sy]=projectParcel(x,y,cam,w,h);
 if(sx<16||sy<16||sx>w-16||sy>h-16)return;
 const b=document.createElement("button");
 b.type="button";b.className="marker "+className;
 b.style.left=sx+"px";b.style.top=sy+"px";b.textContent=label.symbol;
 b.setAttribute("aria-label",label.name);
 b.addEventListener("pointerdown",event=>event.stopPropagation());
 b.addEventListener("click",event=>{event.stopPropagation();onClick();});
 markers.append(b);
}
function updateMarkers(){
 markers.replaceChildren();
 if(trial.mode!=="farm")return;
 for(const p of availableFrontier(trial)){
  const key=p.x+","+p.y,sel=selection?.key===key&&selection?.kind==="candidate"?"selected":"";
  marker("frontier "+sel,{symbol:"+",name:"Select unowned adjacent parcel "+key},p.x,p.y,()=>select("candidate",key));
 }
 for(const p of Object.values(trial.parcels)){
  const sel=selection?.key===p.key?"selected":"";
  marker("owned "+sel,{symbol:"◆",name:"Inspect owned parcel "+p.key+" "+p.biome},p.x,p.y,()=>select("owned",p.key));
  if(p.entranceId){
   const [w,h]=dimensions(),[x,y]=projectParcel(p.x,p.y,cam,w,h);
   const b=document.createElement("button");
   b.type="button";b.className="marker entrance "+sel;
   b.textContent="⌂";b.style.left=x+"px";b.style.top=(y-46)+"px";
   b.setAttribute("aria-label","Select dungeon entrance on parcel "+p.key);
   b.addEventListener("pointerdown",event=>event.stopPropagation());
   b.addEventListener("click",event=>{event.stopPropagation();select("entrance",p.key);});
   markers.append(b);
  }
 }
}
function updateDock(){
 const dock=$("dock"),info=$("dockInfo");
 dock.hidden=!selection||trial.mode!=="farm";
 if(dock.hidden){$("purchase").hidden=true;$("enter").hidden=true;return;}
 const key=selection.key;
 $("purchase").hidden=selection.kind!=="candidate";
 $("enter").hidden=selection.kind!=="entrance";
 if(selection.kind==="candidate"){
  $("dockHeading").textContent="Expand farm at "+key;
  info.replaceChildren();
  const p=document.createElement("p");
  p.textContent="Coordinate: "+key+" · Price: 10 test gold · Gold: "+trial.gold;
  info.append(p);
  const biomes=document.createElement("div");biomes.id="biomes";
  for(const name of ["grassland","marshland"]){
   const b=document.createElement("button");b.type="button";
   b.textContent=name==="grassland"?"Grassland":"Marshland";
   b.className=biomeChoice===name?"selected":"ghost";
   b.setAttribute("aria-pressed",String(biomeChoice===name));
   b.addEventListener("click",()=>{biomeChoice=name;updateDock();draw();});
   biomes.append(b);
  }
  info.append(biomes);
  const note=document.createElement("p");
  note.textContent=trial.firstEntranceKey===null?
   "First expansion guarantees a dungeon entrance on this parcel.":
   "Later expansions are not guaranteed additional entrances.";
  info.append(note);
  const buy=$("purchase");buy.disabled=trial.gold<10||Object.keys(trial.parcels).length>=trial.cap;
  buy.title=buy.disabled?(trial.gold<10?"Insufficient gold":"Parcel cap reached"):"Purchase selected parcel";
  if(buy.disabled){const why=document.createElement("p");why.textContent=buy.title;info.append(why);}
 }else{
  const p=trial.parcels[key];
  $("dockHeading").textContent=selection.kind==="entrance"?"Dungeon entrance":"Owned parcel "+key;
  info.textContent=p?("Biome: "+p.biome+" · Coordinate: "+key+
    (p.entranceId?" · Contains the guaranteed dungeon entrance.":" · No entrance.")):"No matching owned parcel";
 }
}
function ui(){
 const m=snapshot(trial);
 $("hudMode").textContent=trial.mode==="farm"?"Farm":"Dungeon";
 $("hudGold").textContent=String(m.farm.gold);
 $("hudCrop").textContent=String(m.farm.inventory.lucerne);
 $("hudParcels").textContent=String(m.farm.ownedParcels.length)+"/"+trial.cap;
 $("hudStamina").textContent=m.player.stamina+"/"+m.player.maxStamina;
 $("hudRevision").textContent=String(m.revision);
 $("farmControls").hidden=trial.mode!=="farm";
 $("cameraControls").hidden=trial.mode!=="farm";
 $("dungeonControls").hidden=trial.mode!=="dungeon";
 $("harvest").disabled=!trial.cropReady;
 $("order").disabled=!trial.orderOpen||trial.lucerne<2;
 $("grant").disabled=!trial.firstEntranceKey;
 $("previousView").disabled=!overview||!previousCamera;
 $("cap").value=String(trial.cap);
 $("dungeonDetails").textContent=trial.mode==="dungeon"?
  "Stamina: "+m.player.stamina+" · Hand: "+m.player.hand.join(", ")+
  " · Facing: "+(m.player.facing??"none"):"";
 updateDock();
 $("inspectJSON").textContent=JSON.stringify(m,null,2);
 const svg=renderSvg(trial);
 const url=URL.createObjectURL(new Blob([svg],{type:"image/svg+xml"}));
 $("inspectSVG").src=url;
 if(svgURL)URL.revokeObjectURL(svgURL);svgURL=url;
 const hist=$("history");hist.replaceChildren();
 for(const d of [...trial.history].reverse().slice(0,25)){
  const li=document.createElement("li");
  li.textContent=d.id+" "+d.action+" → "+d.outcome+(d.reasonCode?" ("+d.reasonCode+")":"");
  hist.append(li);
 }
}
function draw(){
 if(!farmRenderer||!dungeonRenderer)return;
 canvasSize();
 try{
  if(trial.mode==="farm"){
   lastFrame=farmRenderer.draw(trial,cam,selection?.kind==="owned"||selection?.kind==="entrance"?selection.key:null);
   $("renderStatus").textContent="WebGL1 farm · daylight · "+lastFrame.triangles+" triangles · GL "+lastFrame.glError;
  }else{
   const i=dungeonInspection(trial);
   if(i){lastFrame=dungeonRenderer.render(i);
    $("renderStatus").textContent="R09-P3 fixed dungeon · "+lastFrame.triangles+" triangles · GL "+lastFrame.glError;}
  }
  updateMarkers();
 }catch(error){$("renderStatus").textContent="WebGL rendering problem: "+String(error);throw error;}
}
function run(action,params={}){
 if(!fixture)return;
 const before=trial.mode;
 const result=step(trial,action,fixture,params);
 trial=result.trial;
 const d=result.decision;
 if(d.outcome==="accepted"){
  status(d.events.length?d.events.join(" · "):action+" succeeded","success");
 }else status(action+" rejected: "+d.reasonCode,"error");
 if(action==="dungeon.enter"&&d.outcome==="accepted"){
  // Separate camera and overview state from the R09-P3 dungeon adapter.
  dungeonCamera={cam:{...cam},overview,
   previousCamera:previousCamera?{...previousCamera}:null};
  selection=null;
 }
 if(action==="farm.return"&&d.outcome==="accepted"&&dungeonCamera){
  anim++;cam={...dungeonCamera.cam};
  overview=dungeonCamera.overview;
  previousCamera=dungeonCamera.previousCamera;
  dungeonCamera=null;
  status("Returned to farm after this dungeon visit.","success");
 }
 ui();draw();return d;
}
function purchase(){
 if(!selection||selection.kind!=="candidate")return;
 const key=selection.key;
 const wasOverview=overview;
 const d=run("farm.parcel.purchase",{key,biome:biomeChoice});
 if(d.outcome!=="accepted")return;
 selection=null;updateDock();
 const [w,h]=dimensions();
 if(wasOverview){fitAll(true);return;}
 const p=chosenPoint(key),[sx,sy]=projectParcel(p.x,p.y,cam,w,h);
 const top=36,right=w-40,bottom=h-($("dock").hidden?36:160),left=40;
 let dx=0,dy=0;
 if(sx<left)dx=sx-left;else if(sx>right)dx=sx-right;
 if(sy<top)dy=sy-top;else if(sy>bottom)dy=sy-bottom;
 if(dx||dy){
  const unit=unitSize(w,h,cam.zoom);
  animateTo({...cam,focusX:cam.focusX+dx/unit,focusY:cam.focusY+dy/unit});
 }else draw();
}
$("purchase").addEventListener("click",purchase);
$("enter").addEventListener("click",()=>{
 if(selection?.kind==="entrance")run("dungeon.enter",{key:selection.key});
});
function clearSelection(){selection=null;updateDock();draw();}
$("cancel").addEventListener("click",clearSelection);
$("closePanel").addEventListener("click",clearSelection);
$("harvest").addEventListener("click",()=>run("farm.plot.harvest"));
$("order").addEventListener("click",()=>run("market.order.fulfil"));
$("recover").addEventListener("click",()=>run("farm.recover"));
$("grant").addEventListener("click",()=>run("farm.grant-test-gold"));
$("setCap").addEventListener("click",()=>run("farm.set-test-cap",{cap:Number($("cap").value)}));
for(const b of document.querySelectorAll("[data-dungeon-action]"))
 b.addEventListener("click",()=>run(b.dataset.dungeonAction));
$("showAll").addEventListener("click",()=>{
 if(!overview)previousCamera={...cam};
 overview=true;fitAll(true);ui();
});
$("previousView").addEventListener("click",()=>{
 if(!overview||!previousCamera)return;
 const target=previousCamera;overview=false;previousCamera=null;animateTo(target);ui();
});
$("reset").addEventListener("click",()=>{
 if(!window.confirm("Reset disposable P1-T01 world? Purchased parcels and progress are lost; motion preference remains."))return;
 trial=createTrial();selection=null;biomeChoice="grassland";overview=false;
 previousCamera=null;dungeonCamera=null;anim++;cam={focusX:0,focusY:0,zoom:1.2};
 status("Disposable trial reset; player motion preference kept.");ui();draw();
});
$("copyReport").addEventListener("click",async()=>{
 const s=diagnostic(trial);
 try{await navigator.clipboard.writeText(s);status("Copied P1-T01 local report.");}
 catch{status("Copy unavailable. Use the visible JSON/SVG inspection.","error");}
});
function settingsOpen(){
 updateSettings();dialog.showModal();
 $("settingsHeading").focus();
}
$("settingsOpen").addEventListener("click",settingsOpen);
$("settingsClose").addEventListener("click",()=>dialog.close());
dialog.addEventListener("click",e=>{
 if(e.target===dialog){const r=dialog.getBoundingClientRect();
  if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}
});
dialog.addEventListener("close",()=>$("settingsOpen").focus());
dialog.addEventListener("keydown",event=>{
 if(event.key!=="Tab")return;
 const controls=[...dialog.querySelectorAll('button,input:not([disabled])')].filter(e=>!e.disabled);
 const i=controls.indexOf(document.activeElement);
 if(event.shiftKey&&i===0){event.preventDefault();controls.at(-1)?.focus();}
 else if(!event.shiftKey&&i===controls.length-1){event.preventDefault();controls[0]?.focus();}
});
for(const r of dialog.querySelectorAll('input[name="motion"]'))
 r.addEventListener("change",()=>{
  motion=r.value;
  try{if(motion==="device")localStorage.removeItem("p1-t01-motion");
   else localStorage.setItem("p1-t01-motion",motion);}catch{}
  if(reduced())anim++;
  updateSettings();draw();
 });
const pointers=new Map();
let gesture=false,lastSpan=0;
canvas.addEventListener("pointerdown",e=>{
 if(trial.mode!=="farm"||dialog.open)return;
 anim++;canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,originX:e.clientX,originY:e.clientY});
 if(pointers.size>=2){gesture=true;lastSpan=0;}
});
canvas.addEventListener("pointermove",e=>{
 if(!pointers.has(e.pointerId)||trial.mode!=="farm")return;
 const last=pointers.get(e.pointerId);
 const dx=e.clientX-last.x,dy=e.clientY-last.y;
 last.x=e.clientX;last.y=e.clientY;
 if(Math.hypot(e.clientX-last.originX,e.clientY-last.originY)>8)gesture=true;
 const entries=[...pointers.values()];
 const [w,h]=dimensions();
 if(entries.length===2){
  const span=Math.hypot(entries[0].x-entries[1].x,entries[0].y-entries[1].y);
  if(lastSpan>0&&span>0)cam.zoom=Math.max(.18,Math.min(2.5,cam.zoom*span/lastSpan));
  lastSpan=span;gesture=true;overview=false;previousCamera=null;
 }else if(gesture){
  const u=unitSize(w,h,cam.zoom);
  cam.focusX-=dx/u;cam.focusY-=dy/u;overview=false;previousCamera=null;
 }
 if(gesture){ui();draw();}
});
function endPointer(e){
 const p=pointers.get(e.pointerId);
 if(!p)return;
 pointers.delete(e.pointerId);
 if(pointers.size===0){
  if(!gesture&&trial.mode==="farm"){
   const r=canvas.getBoundingClientRect(),pt=hitParcel(e.clientX-r.left,e.clientY-r.top,
    cam,r.width,r.height);
   const key=pt.x+","+pt.y;
   if(Object.hasOwn(trial.parcels,key))select("owned",key);
   else if(availableFrontier(trial).some(q=>q.x===pt.x&&q.y===pt.y))select("candidate",key);
   else clearSelection();
  }
  gesture=false;lastSpan=0;
 }
}
canvas.addEventListener("pointerup",endPointer);
canvas.addEventListener("pointercancel",e=>{pointers.delete(e.pointerId);gesture=false;lastSpan=0;});
window.addEventListener("resize",()=>{ui();draw();});
window.addEventListener("keydown",e=>{
 if(e.key==="Escape"&&!dialog.open&&selection)clearSelection();
});
async function boot(){
 try{
  const response=await fetch("./r09-p2-fixture.json",{cache:"no-store"});
  if(!response.ok)throw Error("FIXTURE_HTTP_"+response.status);
  fixture=await response.json();
  farmRenderer=createFarmRenderer(canvas);dungeonRenderer=createRenderer(canvas);
  ui();draw();
  $("ready").dataset.ready="1";$("ready").textContent="Isolated farm ready";
  status("Ready. Harvest lucerne, fulfil the market order and choose a + marker to expand.");
 }catch(err){
  $("ready").dataset.ready="error";$("ready").textContent="Trial failed to initialize";
  status("Initialization failed: "+String(err),"error");
 }
}
boot();
