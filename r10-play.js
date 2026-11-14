import {createSession,step,snapshot,diagnostic} from "./r10-p0-modules/r10-p0/session.js";
import {renderSvg} from "./r10-p0-modules/r09-p0/core.js";
import {createRenderer} from "./r10-p0-modules/r09-p3/renderer.js";
import {createFarmRenderer} from "./r10-p0-modules/r10-p0/farm-renderer.js";

const $=id=>{
 const e=document.getElementById(id);
 if(!e)throw Error("R10_UI_MISSING: "+id);
 return e;
};
const actions=new Set([
 "farm.plot.harvest","market.order.fulfil","farm.parcel.purchase","dungeon.enter",
 "dungeon.move.forward","dungeon.move.backward","dungeon.turn.left","dungeon.turn.right",
 "dungeon.chest.open","dungeon.card.use","dungeon.attack.basic","farm.return","farm.recover"
]);
let session=null,farmRenderer=null,dungeonRenderer=null,lastFrame=null,svgObjectUrl=null;
let currentFixture=null,statusText="Loading local farm and dungeon…";
const canvas=$("world-canvas");
function showSvg(svg){
 const url=URL.createObjectURL(new Blob([svg],{type:"image/svg+xml;charset=utf-8"}));
 $("inspect-diagram").src=url;
 if(svgObjectUrl)URL.revokeObjectURL(svgObjectUrl);
 svgObjectUrl=url;
}
function recent(){
 const list=$("action-history");list.replaceChildren();
 if(!session)return;
 if(!session.history.length){
  const row=document.createElement("li");row.textContent="No actions submitted yet.";list.append(row);return;
 }
 for(const e of [...session.history].reverse().slice(0,14)){
  const row=document.createElement("li");
  row.dataset.outcome=e.outcome;
  row.textContent=e.commandId+" "+e.action+" → "+e.outcome+
   (e.reasonCode?" ("+e.reasonCode+")":"")+
   (e.events.length?" ["+e.events.join(", ")+"]":"");
  list.append(row);
 }
}
function draw(){
 if(!session)return;
 const state=snapshot(session),f=state.farm,p=state.player;
 const inDungeon=state.mode==="dungeon",plot=f.plots.find(x=>x.id==="plot-one");
 const order=f.orders.find(x=>x.id==="order-one");
 const east=f.parcels.find(x=>x.id==="parcel-east");
 $("status").textContent=statusText;
 $("status").dataset.outcome=session.lastUI?.outcome??"ready";
 $("revision").textContent=String(state.revision);
 $("mode").textContent=inDungeon?"Dungeon":"Farm";
 $("farm-revision").textContent=String(f.revision);
 $("gold").textContent=String(f.gold);
 $("lucerne").textContent=String(f.inventory.lucerne??0);
 $("stamina").textContent=p.stamina+"/"+p.maxStamina;
 $("farm-panel").hidden=inDungeon;
 $("dungeon-panel").hidden=!inDungeon;
 const unlocked=f.availableEntrances.some(e=>e.id==="entrance-one");
 const progress=unlocked?"Dungeon entrance unlocked":
  east?.owned?"East parcel owned":
  order?.status==="fulfilled"?"Market order complete — buy east parcel":
  plot?.cropStatus==="harvested"?"Crop harvested — fulfil market order":
  "Ready lucerne — harvest to begin";
 $("progress").textContent=progress+
  " · Owned parcels "+f.parcels.filter(x=>x.owned).length+
  " · Entrances "+f.availableEntrances.length;
 $("farm-details").textContent=
  "Crop: "+(plot?.cropStatus??"missing")+
  " · Order: "+(order?.status??"missing")+
  " · East parcel: "+(east?.owned?"owned":"unowned")+
  " · Entrance: "+(unlocked?"available":"locked")+
  ". Try entering before buying land to see an authoritative rejection.";
 const d=state.dungeon;
 $("dungeon-details").textContent=d?
  "Position "+p.position?.x+","+p.position?.y+" facing "+p.facing+
  " · Enemy "+d.enemy.health+" HP ("+d.enemy.status+")"+
  " · Encounter "+(d.engaged?"ACTIVE":"clear")+
  " · Chest "+(d.chest.opened?"opened":"closed")+
  " · Deck "+p.deck.join(", ")+
  " · Discard "+p.discard.join(", "):
  "No active dungeon";
 const selection=$("card-select"),old=selection.value;
 selection.replaceChildren();
 if(!p.hand.length){
  const opt=document.createElement("option");opt.value="";
  opt.textContent="No cards";selection.append(opt);
 }else{
  for(const card of p.hand){
   const opt=document.createElement("option");opt.value=card;
   opt.textContent=card;selection.append(opt);
  }
  if(p.hand.includes(old))selection.value=old;
 }
 // Keep farm actions clickable to demonstrate rejections, including locked entrance.
 for(const button of document.querySelectorAll("button[data-action]")){
  const act=button.dataset.action;
  button.disabled=act==="dungeon.card.use"? !inDungeon||!p.hand.length:
   act.startsWith("dungeon.")? !inDungeon&&act!=="dungeon.enter":
   act==="dungeon.enter"?inDungeon:
   act==="farm.return"?!inDungeon:inDungeon;
 }
 showSvg(renderSvg(state));
 $("inspect-json").textContent=JSON.stringify(state,null,2);
 recent();
 try{
  if(inDungeon){
   if(!dungeonRenderer)dungeonRenderer=createRenderer(canvas);
   lastFrame=dungeonRenderer.render(state);
   $("render-status").textContent="WebGL dungeon · world revision "+lastFrame.revision+
    " · "+lastFrame.triangles+" triangles · facing "+lastFrame.facing+
    " · enemy "+lastFrame.enemy;
  }else{
   if(!farmRenderer)farmRenderer=createFarmRenderer(canvas);
   lastFrame=farmRenderer.render(state);
   $("render-status").textContent="WebGL isometric farm · world revision "+lastFrame.revision+
    " · "+lastFrame.triangles+" triangles · "+lastFrame.owned+" owned parcels"+
    " · "+lastFrame.entrances+" visible entrances";
  }
  $("render-fallback").hidden=true;
 }catch(error){
  lastFrame=null;
  $("render-status").textContent="3D renderer error: "+String(error);
  $("render-fallback").hidden=false;
 }
}
function input(action){
 if(!session||!actions.has(action))return;
 try{
  const card=action==="dungeon.card.use"?$("card-select").value:undefined;
  const next=step(session,action,card);
  session=next.session;
  statusText=next.decision.outcome==="accepted"
   ?"Accepted · "+action+" · revision "+session.runtime.revision+
    (next.decision.events.length?" · "+next.decision.events.map(e=>e.kind).join(", "):""):
   "Rejected · "+action+" · "+next.decision.reasonCode+" (world revision unchanged)";
  draw();
 }catch(error){
  statusText="Command error: "+String(error);
  $("status").textContent=statusText;
 }
}
function reset(){
 if(!currentFixture)return;
 try{
  session=createSession(currentFixture);
  statusText="World reset to revision 0. Harvest the ready lucerne to begin.";
  draw();
 }catch(error){
  $("status").textContent="Cannot reset world: "+String(error);
 }
}
async function copy(){
 if(!session)return;
 const frame=lastFrame?
  "WebGL mode: "+(lastFrame.renderer??"dungeon-webgl1")+
  " · frame revision "+lastFrame.revision+
  " · triangles "+lastFrame.triangles+
  " · GL error "+lastFrame.glError:
  "WebGL frame unavailable";
 const report=frame+"\n\n"+diagnostic(session);
 try{
  await navigator.clipboard.writeText(report);
  $("status").textContent="Copied current farm/dungeon JSON, semantic SVG and 3D frame report.";
 }catch{
  $("status").textContent="Clipboard unavailable. Open the JSON inspector and select its content.";
 }
}
function wire(){
 for(const button of document.querySelectorAll("button[data-action]")){
  button.addEventListener("click",()=>input(button.dataset.action));
 }
 $("reset-demo").addEventListener("click",reset);
 $("copy-report").addEventListener("click",copy);
 window.addEventListener("resize",()=>{if(session)draw();});
 canvas.addEventListener("webglcontextlost",event=>{
  event.preventDefault();lastFrame=null;
  $("render-status").textContent="WebGL context lost; waiting for recovery.";
  $("render-fallback").hidden=false;
 });
 canvas.addEventListener("webglcontextrestored",()=>{
  farmRenderer=null;dungeonRenderer=null;
  if(session)draw();
 });
 const shortcuts={ArrowUp:"dungeon.move.forward",ArrowDown:"dungeon.move.backward",
  ArrowLeft:"dungeon.turn.left",ArrowRight:"dungeon.turn.right"};
 document.addEventListener("keydown",event=>{
  if(event.target?.matches?.("input,select,textarea,[contenteditable]"))return;
  const action=shortcuts[event.key];
  if(action&&session&&snapshot(session).mode==="dungeon"){
   event.preventDefault();input(action);
  }
 });
}
(async()=>{
 try{
  const response=await fetch("./r09-p2-fixture.json",{cache:"no-store"});
  if(!response.ok)throw Error("Fixture HTTP "+response.status);
  currentFixture=await response.json();
  wire();reset();
 }catch(error){
  $("status").textContent="Cannot load integrated fixture: "+String(error);
  $("status").dataset.outcome="rejected";
 }
})();
