/* ===== M&A Capital: conecta el Agente Legal con el dashboard =====
   - La sesión viene del inicio (usuario de Supabase con el módulo "agente_legal").
   - La IA pasa por la función agente-legal de Supabase (la clave de Anthropic vive allí, nunca aquí).
   - La carpeta es la carpeta Legal de OneDrive de esta PC. Solo lectura. */
(function(){
  let SES=null, listo; const sesP=new Promise(r=>listo=r);
  addEventListener("message",ev=>{ if(ev.source!==window.parent) return; const d=ev.data||{}; if(d.type!=="MA_SESSION") return; SES=d; listo(d); });
  if(window.parent!==window){
    window.parent.postMessage({type:"MA_APP_READY"},"*");
    let ult=0; ["mousemove","mousedown","keydown","wheel","touchstart"].forEach(e=>addEventListener(e,()=>{ if(Date.now()-ult>10000){ ult=Date.now(); try{ window.parent.postMessage({type:"MA_ACTIVITY"},"*"); }catch(_){} } },{passive:true,capture:true}));
  }
  const conTiempo=(p,ms)=>Promise.race([p,new Promise(r=>setTimeout(()=>r(null),ms))]);
  const err=(code,message,text)=>{ const e=new Error(message||code); e.code=code; if(text) e.text=text; return e; };
  const b64=blob=>new Promise((ok,no)=>{ const r=new FileReader(); r.onload=()=>ok(String(r.result).split(",")[1]); r.onerror=()=>no(r.error); r.readAsDataURL(blob); });

  async function llamar(body,signal){
    if(!SES) throw err("session_expired","Entra al Agente Legal desde el inicio del dashboard.");
    let r;
    try{ r=await fetch(SES.url.replace(/\/$/,"")+"/functions/v1/agente-legal",{method:"POST",signal,
      headers:{"Content-Type":"application/json",apikey:SES.anon,Authorization:"Bearer "+SES.token},body:JSON.stringify(body)}); }
    catch(e){ if(signal&&signal.aborted) throw err("cancelled","Detenido"); throw err("upstream_error","No hay conexión con Supabase."); }
    const out=await r.json().catch(()=>({}));
    if(r.ok) return out;
    const m=out.error||r.statusText||"Error";
    if(r.status===401) throw err("session_expired","La sesión venció. Vuelve a entrar desde el inicio.");
    if(r.status===403) throw err("not_granted",m);
    if(r.status===429||/rate.?limit|overloaded/i.test(m)) throw err("rate_limited",m);
    if(/too long|too large|prompt is too long/i.test(m)) throw err("prompt_too_large",m);
    throw err("config",m);
  }
  // mensajes: mismos roles seguidos se juntan (la API pide alternar)
  function juntar(ms){ const out=[]; for(const m of ms){ const last=out[out.length-1];
    if(last&&last.role===m.role&&typeof last.content==="string"&&typeof m.content==="string") last.content+="\n\n"+m.content; else out.push({role:m.role,content:m.content}); } return out; }

  async function sample(input,opts){
    opts=opts||{}; const signal=opts.signal;
    let msgs=typeof input==="string"?[{role:"user",content:input}]:juntar(input.map(m=>({role:m.role==="assistant"?"assistant":"user",content:String(m.content)})));
    if(opts.images&&opts.images.length){
      const last=msgs[msgs.length-1]; const blocks=[];
      for(const b of opts.images) blocks.push({type:"image",source:{type:"base64",media_type:b.type||"image/jpeg",data:await b64(b)}});
      blocks.push({type:"text",text:String(last.content)}); last.content=blocks;
    }
    const tools=(opts.tools||[]); const defs=tools.map(t=>({name:t.name,description:t.description,input_schema:t.inputSchema||{type:"object",properties:{}}}));
    let texto="", truncated=false;
    for(let vuelta=0; vuelta<25; vuelta++){
      if(signal&&signal.aborted) throw err("cancelled","Detenido",texto);
      let r;
      try{ r=await llamar({messages:msgs,...(defs.length?{tools:defs}:{}),...(opts.max_tokens?{max_tokens:opts.max_tokens}:{})},signal); }
      catch(e){ if(texto) e.text=texto; throw e; }
      const content=r.content||[];
      const t=content.filter(c=>c.type==="text").map(c=>c.text).join("");
      if(t){ texto+=(texto?"\n\n":"")+t; if(opts.onText) try{ opts.onText({text:texto}); }catch(_){} }
      truncated=r.stop_reason==="max_tokens";
      const usos=content.filter(c=>c.type==="tool_use");
      if(r.stop_reason!=="tool_use"||!usos.length) break;
      msgs.push({role:"assistant",content});
      const res=[];
      for(const u of usos){
        const tool=tools.find(x=>x.name===u.name); let out, isErr=false;
        try{ out=tool?await tool.execute(u.input||{},{signal:signal||new AbortController().signal}):"Herramienta desconocida: "+u.name; }
        catch(e){ if(signal&&signal.aborted) throw err("cancelled","Detenido",texto); out="Error: "+(e&&e.message||e); isErr=true; }
        res.push({type:"tool_result",tool_use_id:u.id,content:String(out==null?"":out),...(isErr?{is_error:true}:{})});
      }
      msgs.push({role:"user",content:res});
    }
    if(!texto) throw err("empty_completion","La IA no devolvió respuesta.");
    return {text:texto,truncated};
  }
  sample.json=async(prompt,opts)=>{
    const r=await sample(prompt,opts); const t=r.text;
    const iO=t.indexOf("{"), iA=t.indexOf("["); let i=(iA>=0&&(iO<0||iA<iO))?iA:iO; const j=Math.max(t.lastIndexOf("}"),t.lastIndexOf("]"));
    try{ return JSON.parse(t.slice(i,j+1)); }catch(e){ throw err("invalid_json","La respuesta llegó incompleta. Vuelve a intentar."); }
  };
  sample.limits=async()=>({tools:true,images:{maxCount:3,maxInputBytes:900000}});

  const downloads={async save({filename,data}){ const b=data instanceof Blob?data:new Blob([data]); const a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download=filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),2000); }};

  window.claude={ use: async n=>{
    if(n==="downloads") return downloads;
    if(n==="sample"){ const s=SES||await conTiempo(sesP,4000); return s?sample:null; }
    throw err("not_available","No disponible");   // SharePoint / Drive / Outlook no se usan aquí
  }};
})();
