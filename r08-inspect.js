// R08-P1 — read-only public demo fixture viewer, no live command or server endpoints.
(()=>{
 "use strict";
 const $ = id => document.getElementById(id);
 const stages=["start","harvested","order-fulfilled","land-purchased"];
 const initial=new URLSearchParams(location.search).get("stage");
 let selected=stages.includes(initial)?initial:"land-purchased";
 let loaded=null,requestId=0;
 const buttons=["copy-report","copy-json","copy-svg","copy-link"];
 const status=msg=>{$("inspect-status").textContent=msg;};
 const enable=ok=>buttons.forEach(id=>{$(id).disabled=!ok;});
 const asset=(stage,ext)=>new URL("./r08-p1-data/"+stage+"."+ext,location.href).href;
 const stageLabel={
   "start":"Start","harvested":"Lucerne harvested",
   "order-fulfilled":"Market order fulfilled","land-purchased":"Parcel purchased"
 };
 const summary=model=>{
  const owned=model.parcels.filter(p=>p.owned).length;
  const crop=model.plots.find(p=>p.id==="plot-one")?.cropStatus||"unknown";
  const order=model.orders.find(o=>o.id==="order-one")?.status||"unknown";
  return "farm-a · revision "+model.revision+" · lucerne "+(model.inventory.lucerne||0)+
   " · gold "+model.gold+" · crop "+crop+" · order "+order+
   " · owned parcels "+owned+" · entrances "+model.availableEntrances.length;
 };
 function report(){
  if(!loaded)return "";
  const m=loaded.model;
  return [
   "Farm Test R08-P1 STATIC PROGRESSION REPORT",
   "Stage: "+selected,
   "Label: "+stageLabel[selected],
   "Instance: "+m.instanceId,
   "Revision: "+m.revision,
   "Lucerne: "+(m.inventory.lucerne||0),
   "Gold: "+m.gold,
   "Crop: "+(m.plots.find(p=>p.id==="plot-one")?.cropStatus||"unknown"),
   "Order: "+(m.orders.find(o=>o.id==="order-one")?.status||"unknown"),
   "Owned parcels: "+m.parcels.filter(p=>p.owned).map(p=>p.id).join(", "),
   "Dungeon entrances: "+(m.availableEntrances.map(f=>f.id).join(", ")||"none"),
   "Last command: "+(m.lastDecision?.commandId||"none"),
   "Last outcome: "+(m.lastDecision?.outcome||"none"),
   "SVG URL: "+loaded.svgUrl,
   "JSON URL: "+loaded.jsonUrl,
   "","INSPECT.JSON",JSON.stringify(m,null,2),"","INSPECT.SVG",loaded.svg
  ].join("\n");
 }
 async function show(stage){
  if(!stages.includes(stage))return;
  selected=stage;loaded=null;const token=++requestId;enable(false);
  $("inspect-diagram").removeAttribute("src");
  $("summary").textContent="Loading stage…";
  $("inspect-json").textContent="Loading JSON…";
  status("Loading "+stageLabel[stage]+"…");
  for(const b of document.querySelectorAll("[data-stage]")){
   b.setAttribute("aria-pressed",String(b.dataset.stage===stage));
  }
  const svgUrl=asset(stage,"svg"),jsonUrl=asset(stage,"json");
  $("direct-json").href=jsonUrl;$("direct-svg").href=svgUrl;
  const url=new URL(location.href);url.searchParams.set("stage",stage);
  history.replaceState(null,"",url);
  try{
   const [jr,sr]=await Promise.all([
    fetch(jsonUrl,{cache:"no-store"}),
    fetch(svgUrl,{cache:"no-store"})
   ]);
   if(!jr.ok||!sr.ok)throw Error("Fixture HTTP "+jr.status+"/"+sr.status);
   const [model,svg]=await Promise.all([jr.json(),sr.text()]);
   if(token!==requestId)return; // do not render a slower stale-stage response
   const xml=new DOMParser().parseFromString(svg,"image/svg+xml");
   const wanted=stages.indexOf(stage);
   if(xml.getElementsByTagName("parsererror").length||
      model.schemaVersion!=="r08-p0/v1"||
      model.instanceId!=="farm-a"||
      model.revision!==wanted||
      !svg.includes("Revision "+wanted)||
      !svg.includes('id="farm-parcels"')||
      (model.availableEntrances.length>0)!==svg.includes('id="entrance-entrance-one"')){
      throw Error("JSON/SVG fixture mismatch");
   }
   loaded={model,svg,svgUrl,jsonUrl};
   $("summary").textContent=summary(model);
   $("inspect-json").textContent=JSON.stringify(model,null,2);
   $("inspect-diagram").src=svgUrl;
   $("inspect-diagram").alt="Farm "+model.instanceId+" at revision "+model.revision+
     ", "+model.parcels.filter(p=>p.owned).length+" owned parcels, "+
     model.availableEntrances.length+" entrances";
   status("Loaded "+stageLabel[stage]+" · static JSON and SVG");
   enable(true);
  }catch(error){
   if(token!==requestId)return;
   $("summary").textContent="Data unavailable";
   $("inspect-json").textContent="Could not load selected fixture.";
   status("Inspection error: "+(error instanceof Error?error.message:String(error)));
  }
 }
 async function copy(text,label){
  try{await navigator.clipboard.writeText(text);status("Copied "+label+".");}
  catch{status("Clipboard unavailable. Select JSON or open one of the direct links.");}
 }
 for(const b of document.querySelectorAll("[data-stage]")){
  b.addEventListener("click",()=>show(b.dataset.stage));
 }
 $("copy-report").addEventListener("click",()=>loaded&&copy(report(),"diagnostic report"));
 $("copy-json").addEventListener("click",()=>loaded&&copy(JSON.stringify(loaded.model,null,2),"JSON"));
 $("copy-svg").addEventListener("click",()=>loaded&&copy(loaded.svg,"SVG source"));
 $("copy-link").addEventListener("click",()=>loaded&&copy(location.href,"stage URL"));
 show(selected);
})();