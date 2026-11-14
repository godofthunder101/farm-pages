import {createSession,step,snapshot,diagnostic} from "./r09-p2-modules/r09-p2/session.js";
import {renderFacingSvg} from "./r09-p2-modules/r09-p2/first-person.js";
import {renderSvg} from "./r09-p2-modules/r09-p0/core.js";

const $=id=>{
 const node=document.getElementById(id);
 if(!node)throw Error("MISSING_UI_ELEMENT:"+id);
 return node;
};
const legalActions=new Set([
 "dungeon.enter","dungeon.move.forward","dungeon.move.backward",
 "dungeon.turn.left","dungeon.turn.right","dungeon.chest.open",
 "dungeon.card.use","dungeon.attack.basic","farm.return","farm.recover"
]);
let session=null,previousSvgUrl=null,previousFacingUrl=null;
let statusText="Fixture loaded. Enter the unlocked dungeon to begin.";
function updateImage(id,svg,oldUrl){
 const url=URL.createObjectURL(new Blob([svg],{type:"image/svg+xml;charset=utf-8"}));
 $(id).src=url;
 if(oldUrl)URL.revokeObjectURL(oldUrl);
 return url;
}
function log(){
 const list=$("action-history");list.replaceChildren();
 if(!session)return;
 for(const event of [...session.history].reverse().slice(0,8)){
  const li=document.createElement("li");
  li.textContent="#"+event.index+" "+event.action+" → "+event.outcome+
   (event.reasonCode?" ("+event.reasonCode+")":"")+
   (event.events.length?" ["+event.events.join(", ")+"]":"");
  li.dataset.outcome=event.outcome;list.append(li);
 }
 if(!session.history.length){
  const li=document.createElement("li");
  li.textContent="No input submitted yet.";list.append(li);
 }
}
function draw(){
 if(!session)return;
 const state=snapshot(session),player=state.player,dungeon=state.dungeon,inDungeon=state.mode==="dungeon";
 $("status").textContent=statusText;
 $("status").dataset.outcome=session.lastUI?.outcome??"ready";
 $("mode").textContent=inDungeon?"Dungeon":"Farm";
 $("revision").textContent=String(state.revision);
 $("stamina").textContent=player.stamina+"/"+player.maxStamina;
 $("hand-count").textContent=player.hand.length+"/"+player.handLimit;
 $("position").textContent=player.position?
  player.position.x+","+player.position.y+" · "+player.facing:"farm";
 $("encounter").textContent=dungeon?(dungeon.engaged?"ACTIVE":"clear"):"none";
 $("enemy").textContent=dungeon?(dungeon.enemy.health+" HP · "+dungeon.enemy.status):"not in dungeon";
 $("chest").textContent=dungeon?(dungeon.chest.opened?"opened":"closed"):"not in dungeon";
 $("gold").textContent=String(state.farm.gold);
 $("deck-discard").textContent="Deck: "+(player.deck.join(", ")||"empty")+
  " · Discard: "+(player.discard.join(", ")||"empty");
 $("farm-context").textContent="Owned: "+
  state.farm.parcels.filter(p=>p.owned).map(p=>p.id).join(", ")+
  " · Entrances: "+state.farm.availableEntrances.map(e=>e.id).join(", ");
 const hand=$("hand-select"),oldCard=hand.value;
 hand.replaceChildren();
 if(player.hand.length===0){
  const opt=document.createElement("option");opt.value="";opt.textContent="No cards";hand.append(opt);
 }else{
  for(const card of player.hand){
   const opt=document.createElement("option");opt.value=card;opt.textContent=card;hand.append(opt);
  }
  if(player.hand.includes(oldCard))hand.value=oldCard;
 }
 for(const button of document.querySelectorAll("button[data-action]")){
  const action=button.dataset.action;
  button.disabled=action==="dungeon.enter"?
   inDungeon||player.stamina===0||!state.farm.availableEntrances.some(e=>e.id==="entrance-one")
   :action==="farm.return"?!inDungeon
   :action==="farm.recover"?inDungeon||player.stamina>=player.maxStamina
   :action==="dungeon.card.use"?!inDungeon||!dungeon?.engaged||!player.hand.length
   :action==="dungeon.attack.basic"?!inDungeon||!dungeon?.engaged
   :action==="dungeon.chest.open"?!inDungeon||!!dungeon?.engaged||!!dungeon?.chest.opened
   :!inDungeon;
 }
 previousSvgUrl=updateImage("inspect-diagram",renderSvg(state),previousSvgUrl);
 previousFacingUrl=updateImage("facing-diagram",renderFacingSvg(state),previousFacingUrl);
 $("inspect-json").textContent=JSON.stringify(state,null,2);
 log();
}
function perform(action){
 if(!session||!legalActions.has(action))return;
 try{
  const card=action==="dungeon.card.use"?$("hand-select").value:undefined;
  const result=step(session,action,card);
  session=result.session;
  const decision=result.decision;
  statusText=decision.outcome==="accepted"?
   "Accepted · "+action+" · world revision "+session.runtime.revision+
    (decision.events.length?" · "+decision.events.map(e=>e.kind).join(", "):""):
   "Rejected · "+action+" · "+decision.reasonCode+" (revision unchanged)";
  draw();
 }catch(error){
  statusText="Prototype error: "+String(error);
  $("status").textContent=statusText;
 }
}
function reset(fixture){
 session=createSession(fixture);
 statusText="Demo reset. The farm already owns entrance-one. Tap Enter dungeon.";
 draw();
}
async function copy(){
 if(!session)return;
 try{
  await navigator.clipboard.writeText(diagnostic(session));
  statusText="Copied live report. Paste it into ChatGPT to inspect your actions.";
 }catch{
  statusText="Clipboard unavailable. Inspect/select JSON below or retry on HTTPS.";
 }
 $("status").textContent=statusText;
}
function wire(fixture){
 for(const button of document.querySelectorAll("button[data-action]")){
  button.addEventListener("click",()=>{
   const action=button.dataset.action;
   if(legalActions.has(action))perform(action);
  });
 }
 $("reset-demo").addEventListener("click",()=>reset(fixture));
 $("copy-report").addEventListener("click",copy);
 const keyboard={
  ArrowUp:"dungeon.move.forward",ArrowDown:"dungeon.move.backward",
  ArrowLeft:"dungeon.turn.left",ArrowRight:"dungeon.turn.right"
 };
 document.addEventListener("keydown",event=>{
  if(event.target?.matches?.("input,select,textarea,[contenteditable]"))return;
  const action=keyboard[event.key];
  if(action&&session&&snapshot(session).mode==="dungeon"){
   event.preventDefault();perform(action);
  }
 });
 reset(fixture);
}
(async()=>{
 try{
  const response=await fetch("./r09-p2-fixture.json",{cache:"no-store"});
  if(!response.ok)throw Error("Fixture HTTP "+response.status);
  wire(await response.json());
 }catch(error){
  $("status").textContent="Cannot start R09-P2: "+String(error);
  $("status").dataset.outcome="rejected";
 }
})();
