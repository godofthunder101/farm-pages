// Static R07-P1 inspection only. This file makes no gameplay or network mutations.
(()=>{
 "use strict";
 const $=id=>document.getElementById(id),params=new URLSearchParams(location.search);
 let view=params.get("view")==="before"?"before":"after",loaded=null;
 const ids=["copy-svg","copy-json","copy-report","copy-link"];
 const status=t=>{$("inspect-status").textContent=t};
 const control=enabled=>ids.forEach(id=>$(id).disabled=!enabled);
 const file=(v,ext)=>new URL("./r07-p1-data/"+v+"."+ext,location.href).href;
 const report=()=>{
  const m=loaded.model;
  return [
   "Farm Test R07-P1 STATIC FIXTURE REPORT",
   "View: "+view,"Instance: "+m.instanceId,"Revision: "+m.revision,
   "Plot: "+m.plots[0].id,"Crop: "+m.plots[0].cropStatus,
   "Lucerne: "+m.inventory.lucerne,"Decision: "+(m.lastDecision?.outcome||"none"),
   "SVG: "+loaded.svgUrl,"JSON: "+loaded.jsonUrl,
   "","INSPECT.JSON",JSON.stringify(m,null,2),"","INSPECT.SVG",loaded.svg
  ].join("\n");
 };
 async function show(next){
  view=next;loaded=null;control(false);status("Loading "+view+"…");
  for(const b of document.querySelectorAll("[data-inspect-view]"))b.setAttribute("aria-pressed",String(b.dataset.inspectView===view));
  const svgUrl=file(view,"svg"),jsonUrl=file(view,"json");
  $("direct-svg").href=svgUrl;$("direct-json").href=jsonUrl;
  $("inspect-diagram").removeAttribute("src");
  const url=new URL(location.href);url.searchParams.set("view",view);history.replaceState(null,"",url);
  try{
   const [jr,sr]=await Promise.all([fetch(jsonUrl,{cache:"no-store"}),fetch(svgUrl,{cache:"no-store"})]);
   if(!jr.ok||!sr.ok)throw Error("Fixture HTTP "+jr.status+"/"+sr.status);
   const [model,svg]=await Promise.all([jr.json(),sr.text()]);
   const xml=new DOMParser().parseFromString(svg,"image/svg+xml");
   if(xml.getElementsByTagName("parsererror").length)throw Error("Invalid SVG XML");
   if(model.schemaVersion!=="r07-p0/v1"||model.instanceId!=="farm-a"||
      model.revision!==(view==="before"?0:1)||!svg.includes("Revision "+model.revision))
    throw Error("Snapshot mismatch");
   loaded={model,svg,svgUrl,jsonUrl};
   $("inspect-diagram").src=svgUrl;
   $("inspect-diagram").alt="Farm "+model.instanceId+", revision "+model.revision+", crop "+model.plots[0].cropStatus;
   $("inspect-json").textContent=JSON.stringify(model,null,2);
   $("revision").textContent="farm-a · revision "+model.revision+" · "+model.plots[0].cropStatus+" · lucerne "+model.inventory.lucerne;
   status("Loaded "+view+" snapshot · independent SVG and JSON");control(true);
  }catch(e){
   $("revision").textContent="Unavailable";$("inspect-json").textContent="Could not load the inspection data.";
   status("Inspection error: "+(e instanceof Error?e.message:String(e)));
  }
 }
 async function copy(text,name){
  try{await navigator.clipboard.writeText(text);status("Copied "+name+".")}
  catch{status("Clipboard unavailable; open the direct data links or select the JSON text.");}
 }
 for(const b of document.querySelectorAll("[data-inspect-view]"))b.addEventListener("click",()=>show(b.dataset.inspectView));
 $("copy-svg").addEventListener("click",()=>loaded&&copy(loaded.svg,"SVG source"));
 $("copy-json").addEventListener("click",()=>loaded&&copy(JSON.stringify(loaded.model,null,2),"JSON"));
 $("copy-report").addEventListener("click",()=>loaded&&copy(report(),"diagnostic report"));
 $("copy-link").addEventListener("click",()=>loaded&&copy(location.href,"report URL"));
 show(view);
})();