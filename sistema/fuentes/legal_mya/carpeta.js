/* ===== Carpeta Legal de OneDrive (se conecta una vez y se recuerda en esta PC) ===== */
(function(){
  const IDB="ma_agente_legal";
  const db=()=>new Promise((ok,no)=>{ const r=indexedDB.open(IDB,1); r.onupgradeneeded=()=>r.result.createObjectStore("h"); r.onsuccess=()=>ok(r.result); r.onerror=()=>no(r.error); });
  const guardar=async h=>{ try{ const d=await db(); await new Promise(r=>{ const tx=d.transaction("h","readwrite"); tx.objectStore("h").put(h,"carpeta"); tx.oncomplete=r; tx.onerror=r; }); }catch(e){} };
  const leer=async()=>{ try{ const d=await db(); return await new Promise(r=>{ const g=d.transaction("h").objectStore("h").get("carpeta"); g.onsuccess=()=>r(g.result||null); g.onerror=()=>r(null); }); }catch(e){ return null; } };
  let H=null, FIRMA="";
  async function listar(h){ const out=[];
    async function walk(d,p){ for await (const [n,x] of d.entries()){ if(out.length>20000) return; if(n[0]==="."||n.startsWith("~$")) continue;
      if(x.kind==="directory") await walk(x,p+n+"/"); else if(SUPS.test(n)){ try{ out.push({path:p+n,file:await x.getFile()}); }catch(e){} } } }
    await walk(h,""); return out; }
  const firma=l=>l.map(x=>x.path+"|"+x.file.size+"|"+x.file.lastModified).sort().join(";");
  async function usar(h,abrir){ H=h; const l=await listar(h); FIRMA=firma(l); SH.setFolder(l,h.name);
    if(abrir){ const p=SH.pending; SH.pending=null; openDM(p||{}); } }
  const original=SH.chooseFolder.bind(SH);
  SH.chooseFolder=async function(){
    if(!window.showDirectoryPicker) return original();
    try{
      if(!SH.folder.entries.length){ const h=await leer(); if(h&&await h.requestPermission({mode:"read"})==="granted"){ await usar(h,true); return; } }
      const h=await window.showDirectoryPicker({mode:"read",id:"ma_agente_legal"}); await guardar(h); await usar(h,true);
    }catch(e){ if(e&&e.name!=="AbortError") $s("#fname").textContent="No se pudo abrir la carpeta: "+e.message; }
  };
  const clear0=SH.clearFolder.bind(SH);
  SH.clearFolder=function(){ H=null; FIRMA=""; clear0(); };
  async function revisar(){ if(!H||document.hidden) return; try{ const l=await listar(H); if(firma(l)!==FIRMA){ FIRMA=firma(l); SH.setFolder(l,H.name); } }catch(e){} }
  setInterval(revisar,60000);
  { let u=0; const v=()=>{ if(document.hidden||Date.now()-u<5000) return; u=Date.now(); revisar(); }; addEventListener("focus",v); document.addEventListener("visibilitychange",v); }
  (async()=>{ if(!window.showDirectoryPicker) return; const h=await leer(); if(!h) return;
    try{ if(await h.queryPermission({mode:"read"})==="granted"){ $s("#fname").textContent="Leyendo la carpeta «"+h.name+"»…"; await usar(h,false); }
      else $s("#fchoose").textContent="Abrir carpeta «"+h.name+"»"; }catch(e){} })();
})();
