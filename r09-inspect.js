// R09-P1: static, public, fixture-only AI inspector. No game commands or backend writes.
(()=>{
"use strict";
const $=id=>document.getElementById(id);
const stages=["start","farm-unlocked","entered","card-drawn","chest-opened","engaged",
"card-used","enemy-defeated","stamina-empty","returned","recovered"];
const revisions=[0,3,4,5,8,11,12,13,15,16,17];
const labels=["Start on farm","Land and entrance unlocked","Enter dungeon",
"Forward step and card","Chest loot","Enemy engaged","Card used",
"Enemy defeated","Stamina exhausted","Returned to farm","Stamina recovered"];
const search=new URLSearchParams(location.search).get("stage");
let stage=stages.includes(search)?search:"engaged";
let current=null,requestId=0;
const copyIds=["copy-report","copy-json","copy-svg","copy-link"];
const status=text=>{$("inspect-status").textContent=text;};
const enable=ok=>copyIds.forEach(id=>{$(id).disabled=!ok;});
const urlFor=(name,extension)=>new URL("./r09-p1-data/"+name+"."+extension,location.href).href;
const marker=(s,mode)=>mode==="dungeon"?'id="dungeon-grid"':'id="farm-parcels"';
function sceneSummary(model){
 const p=model.player;
 const common="World revision "+model.revision+" · Mode "+model.mode+
 " · Stamina "+p.stamina+"/"+p.maxStamina+
 " · Hand "+p.hand.length+"/"+p.handLimit;
 if(model.mode==="farm"){
  return common+" · Farm revision "+model.farm.revision+
   " · Gold "+model.farm.gold+" · Entrances "+model.farm.availableEntrances.length;
 }
 const d=model.dungeon;
 return common+" · Dungeon "+d.instanceId+
  " · Tile ("+p.position.x+","+p.position.y+") facing "+p.facing+
  " · Enemy "+d.enemy.health+" HP ("+d.enemy.status+")"+
  " · Encounter "+(d.engaged?"ACTIVE":"clear")+
  " · Chest "+(d.chest.opened?"opened":"closed")+
  " · Deck "+p.deck.length+" · Discard "+p.discard.length;
}
function diagnostic(){
 if(!current)return "";
 const {model,svg,svgUrl,jsonUrl}=current,p=model.player;
 return [
  "Farm Test R09-P1 STATIC DUNGEON INSPECTION REPORT",
  "Stage: "+stage,
  "Milestone: "+labels[stages.indexOf(stage)],
  "World revision: "+model.revision,
  "Mode: "+model.mode,
  "Farm instance: "+model.farmInstanceId,
  "Dungeon instance: "+(model.dungeon?.instanceId||"none (farm mode)"),
  "Position: "+(p.position?"("+p.position.x+","+p.position.y+")":"farm"),
  "Facing: "+(p.facing||"none"),
  "Stamina: "+p.stamina+"/"+p.maxStamina,
  "Hand: "+p.hand.join(", "),
  "Deck: "+p.deck.join(", "),
  "Discard: "+p.discard.join(", "),
  "Enemy HP: "+(model.dungeon?.enemy.health??"n/a"),
  "Engaged: "+(model.dungeon?.engaged??"n/a"),
  "Chest opened: "+(model.dungeon?.chest.opened??"n/a"),
  "Farm revision: "+model.farm.revision,
  "Farm entrances: "+model.farm.availableEntrances.map(e=>e.id).join(", "),
  "Last command: "+(model.lastDecision?.commandId||"none"),
  "Last action: "+(model.lastDecision?.action||"none"),
  "Last outcome: "+(model.lastDecision?.outcome||"none"),
  "SVG URL: "+svgUrl,"JSON URL: "+jsonUrl,
  "","INSPECT.JSON",JSON.stringify(model,null,2),
  "","INSPECT.SVG",svg
 ].join("\n");
}
function navButtons(){
 const i=stages.indexOf(stage);
 $("stage-previous").disabled=i===0;
 $("stage-next").disabled=i===stages.length-1;
 $("stage-picker").value=stage;
}
async function show(next){
 if(!stages.includes(next))return;
 stage=next;current=null;const myRequest=++requestId;
 enable(false);navButtons();
 $("inspect-diagram").removeAttribute("src");
 $("summary").textContent="Loading…";$("inspect-json").textContent="Loading…";
 status("Loading "+labels[stages.indexOf(stage)]+"…");
 const jsonUrl=urlFor(stage,"json"),svgUrl=urlFor(stage,"svg");
 $("direct-json").href=jsonUrl;$("direct-svg").href=svgUrl;
 const link=new URL(location.href);
 link.searchParams.set("stage",stage);
 history.replaceState(null,"",link);
 try{
  const [jr,sr]=await Promise.all([
   fetch(jsonUrl,{cache:"no-store"}),fetch(svgUrl,{cache:"no-store"})
  ]);
  if(!jr.ok||!sr.ok)throw Error("Fixture HTTP "+jr.status+"/"+sr.status);
  const [model,svg]=await Promise.all([jr.json(),sr.text()]);
  if(myRequest!==requestId)return;
  const xml=new DOMParser().parseFromString(svg,"image/svg+xml");
  const expectedRevision=revisions[stages.indexOf(stage)];
  const expectedMode=(stage==="start"||stage==="farm-unlocked"||stage==="returned"||stage==="recovered")?"farm":"dungeon";
  const expectedTitle=expectedMode==="dungeon"?"R09 dungeon dungeon-run-one":"R08 farm farm-a";
  const title=xml.querySelector("title")?.textContent;
  if(xml.getElementsByTagName("parsererror").length||
    xml.documentElement.localName!=="svg"||
    xml.documentElement.namespaceURI!=="http://www.w3.org/2000/svg"||
    title!==expectedTitle||
    model.schemaVersion!=="r09-p0/v1"||
    model.source!=="deterministic-fixture"||
    model.farmInstanceId!=="farm-a"||
    model.player?.actorId!=="owner-a"||
    model.revision!==expectedRevision||
    model.mode!==expectedMode||
    !svg.includes(marker(stage,expectedMode))||
    (expectedMode==="dungeon" &&
      (!model.dungeon||model.dungeon.instanceId!=="dungeon-run-one"||
       !svg.includes("revision "+expectedRevision)))||
    (expectedMode==="farm"&&!svg.includes("World Revision "+expectedRevision))){
     throw Error("JSON/SVG snapshot identity mismatch");
  }
  current={model,svg,svgUrl,jsonUrl};
  $("summary").textContent=sceneSummary(model);
  $("inspect-json").textContent=JSON.stringify(model,null,2);
  $("inspect-diagram").src=svgUrl;
  $("inspect-diagram").alt="R09 "+stage+", "+model.mode+", world revision "+
    model.revision+", "+(model.mode==="dungeon"?
     "player "+model.player.facing+" at ("+model.player.position.x+","+model.player.position.y+")":
     "farm with "+model.farm.availableEntrances.length+" dungeon entrances");
  status("Loaded "+labels[stages.indexOf(stage)]+" · static JSON and SVG");
  enable(true);
 }catch(error){
  if(myRequest!==requestId)return;
  $("summary").textContent="Selected fixture unavailable";
  $("inspect-json").textContent="Unable to load this stage.";
  status("Inspection error: "+(error instanceof Error?error.message:String(error)));
 }
}
async function copy(value,thing){
 try{await navigator.clipboard.writeText(value);status("Copied "+thing+".");}
 catch{status("Clipboard unavailable. Use the direct JSON/SVG links or select the JSON text.");}
}
$("stage-picker").addEventListener("change",e=>show(e.target.value));
$("stage-previous").addEventListener("click",()=>show(stages[Math.max(0,stages.indexOf(stage)-1)]));
$("stage-next").addEventListener("click",()=>show(stages[Math.min(stages.length-1,stages.indexOf(stage)+1)]));
$("toggle-zoom").addEventListener("click",()=>{
 const enabled=$("scene-container").classList.toggle("zoom");
 $("toggle-zoom").textContent=enabled?"Fit diagram":"Zoom diagram";
 $("toggle-zoom").setAttribute("aria-pressed",String(enabled));
});
$("copy-report").addEventListener("click",()=>current&&copy(diagnostic(),"diagnostic report"));
$("copy-json").addEventListener("click",()=>current&&copy(JSON.stringify(current.model,null,2),"JSON"));
$("copy-svg").addEventListener("click",()=>current&&copy(current.svg,"SVG"));
$("copy-link").addEventListener("click",()=>current&&copy(location.href,"stage URL"));
$("direct-replay").href=new URL("./r09-p1-data/replay-report.json",location.href).href;
show(stage);
})();