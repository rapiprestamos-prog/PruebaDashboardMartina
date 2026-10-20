  /* ---------- Revisión de documentos: ortografía, datos sin llenar, montos y elementos que faltan ----------
     Todo por reglas (sin IA): no cambia nada del documento salvo las correcciones que la persona acepte. */
  const RV_ORTO={"articulo":"artículo","articulos":"artículos","clausula":"cláusula","clausulas":"cláusulas","numero":"número","numeros":"números","dias":"días","dia":"día","tambien":"también","ademas":"además","segun":"según","atravez":"a través","traves":"través",
   "debera":"deberá","deberan":"deberán","podra":"podrá","podran":"podrán","sera":"será","seran":"serán","estara":"estará","estaran":"estarán","pagara":"pagará","tendra":"tendrá","garantia":"garantía","cedula":"cédula","cedulas":"cédulas","telefono":"teléfono","despues":"después",
   "pais":"país","unico":"único","unica":"única","proposito":"propósito","exepto":"excepto","escencial":"esencial","deposito":"depósito","credito":"crédito","economico":"económico","juridica":"jurídica","juridico":"jurídico","publica":"pública","publico":"público",
   "tecnico":"técnico","valido":"válido","haci":"así","inmeble":"inmueble","interes":"interés","terminos":"términos","tramite":"trámite","linea":"línea","codigo":"código","pagina":"página","titulo":"título","minimo":"mínimo","maximo":"máximo","compañia":"compañía",
   "ultimo":"último","ultima":"última","via":"vía","notaria":"notaría","poliza":"póliza","polizas":"pólizas","cancelacion":"cancelación","gravamenes":"gravámenes","gravamen":"gravamen","hipotecaria":"hipotecaria"};
  const RV_MES="enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre";
  const RV_U=["","UNO","DOS","TRES","CUATRO","CINCO","SEIS","SIETE","OCHO","NUEVE","DIEZ","ONCE","DOCE","TRECE","CATORCE","QUINCE","DIECISÉIS","DIECISIETE","DIECIOCHO","DIECINUEVE","VEINTE","VEINTIUNO","VEINTIDÓS","VEINTITRÉS","VEINTICUATRO","VEINTICINCO","VEINTISÉIS","VEINTISIETE","VEINTIOCHO","VEINTINUEVE"];
  const RV_D=["","","","TREINTA","CUARENTA","CINCUENTA","SESENTA","SETENTA","OCHENTA","NOVENTA"], RV_C=["","CIENTO","DOSCIENTOS","TRESCIENTOS","CUATROCIENTOS","QUINIENTOS","SEISCIENTOS","SETECIENTOS","OCHOCIENTOS","NOVECIENTOS"];
  const rvMil=n=>{ if(!n) return ""; if(n===100) return "CIEN"; const c=Math.floor(n/100), r=n%100; let s=RV_C[c]; if(r) s+=(s?" ":"")+(r<30?RV_U[r]:RV_D[Math.floor(r/10)]+(r%10?" Y "+RV_U[r%10]:"")); return s; };
  const rvApoc=s=>s.replace(/VEINTIUNO$/,"VEINTIÚN").replace(/UNO$/,"UN");
  function rvEntero(n){ if(n===0) return "CERO"; const mm=Math.floor(n/1e6), m=Math.floor(n%1e6/1000), r=n%1000; let s="";
    if(mm) s=mm===1?"UN MILLÓN":rvApoc(rvEntero(mm))+" MILLONES"; if(m) s+=(s?" ":"")+(m===1?"MIL":rvApoc(rvMil(m))+" MIL"); if(r) s+=(s?" ":"")+rvMil(r); return s; }
  const rvSinTilde=s=>s.normalize("NFD").replace(/[̀-ͯ]/g,"");
  const rvConservar=(w,s)=>w===w.toUpperCase()&&w.length>1?s.toUpperCase():(w[0]===w[0].toUpperCase()?s[0].toUpperCase()+s.slice(1):s);
  const RV_REGLAS={
   compraventa:{nombre:"Compraventa / promesa",es:/compraventa/i,req:[
    ["Identificación de las partes con cédula",/c[eé]dula[\s\S]{0,60}?\d{1,2}-\d{1,4}-\d{1,6}/i],["RUC o folio de la sociedad",/RUC\s*[\d-]{6,}|folio\s*(no\.?)?\s*\d+/i],
    ["Número de finca",/finca\s*(no\.?|n[uú]mero)?\s*\d{3,}/i],["Precio en letras y en cifras",/(D[ÓO]LARES|BALBOAS?)\s+CON\s+\d{2}\/100\s*\((US\$|B\/\.)/i],
    ["Plazo",/plazo[^.]*\(\d+\)\s*(d[ií]as|meses|a[nñ]os)/i],["Fecha de firma",/(a los|el)\s+\d{1,2}\s+(d[ií]as|de)|\d{1,2} de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre) de \d{4}/i],["Bloque de firmas",/_{8,}/]]},
   arrendamiento:{nombre:"Arrendamiento",es:/arrendamiento|arrendador/i,req:[
    ["Identificación de las partes (RUC o cédula)",/RUC\s*[\d-]{6,}|c[eé]dula[\s\S]{0,60}?\d{1,2}-\d{1,4}-\d{1,6}/i],["Canon en letras y en cifras",/(D[ÓO]LARES|BALBOAS?)\s+CON\s+\d{2}\/100\s*\((US\$|B\/\.)/i],
    ["Plazo del contrato",/plazo[^.]*\(\d+\)\s*(d[ií]as|meses|a[nñ]os)/i],["Depósito de garantía",/dep[oó]sito/i],["Bloque de firmas",/_{8,}/]]},
   poder:{nombre:"Poder",es:/\bpoder\b/i,req:[
    ["Cédula del poderdante",/(yo|poderdante)[\s\S]{0,140}?\d{1,2}-\d{1,4}-\d{1,6}/i],["Cédula del apoderado",/(a favor de|otorgo)[\s\S]{0,220}?\d{1,2}-\d{1,4}-\d{1,6}/i],
    ["Facultades concretas",/para que[^.]{20,}/i],["Fecha",/\d{1,2} de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre) de \d{4}/i],["Firma",/_{8,}/]]}
  };
  function rvTipo(txt){ const t=txt.slice(0,500); if(/\bPODER\b/.test(t)) return "poder"; if(/COMPRAVENTA/i.test(t)) return "compraventa"; if(/ARRENDAMIENTO/i.test(t)) return "arrendamiento"; return null; }
  /* Analiza el texto de un documento (párrafos) */
  function rvAnalizar(texto){
    const orto=[], vistos=new Set();
    const RXW=/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/g; let m;
    const txt=String(texto);
    const pals=[]; while(m=RXW.exec(txt)) pals.push({w:m[0],i:m.index});
    pals.forEach((p,j)=>{ const low=p.w.toLowerCase(), ant=(pals[j-1]||{}).w||"", sig=(pals[j+1]||{}).w||"";
      let bien=RV_ORTO[low]&&RV_ORTO[low]!==low?RV_ORTO[low]:null, por="Falta tilde o está mal escrita";
      if(!bien&&/[cs]ion$/.test(low)&&low.length>5){ bien=low.replace(/cion$/,"ción").replace(/sion$/,"sión"); por="Las palabras terminadas en «-ción» o «-sión» llevan tilde"; }
      if(!bien&&low==="mas"&&ant.toLowerCase()==="a"&&sig.toLowerCase()==="tardar"){ bien="más"; por="«a más tardar» lleva tilde"; }
      if(bien){ const k="w:"+low; const ctx=txt.slice(Math.max(0,p.i-35),p.i+p.w.length+35).replace(/\s+/g," ");
        if(!vistos.has(k)){ vistos.add(k); orto.push({k,tipo:"Ortografía",mal:p.w,bien:rvConservar(p.w,bien),por,ctx,n:1}); } else orto.find(x=>x.k===k).n++; }
      if(sig&&low===sig.toLowerCase()&&low.length>1&&/^\s+$/.test(txt.slice(p.i+p.w.length,pals[j+1].i))){ const k="r:"+low; if(!vistos.has(k)){ vistos.add(k); orto.push({k,tipo:"Palabra repetida",mal:p.w+" "+sig,bien:p.w,por:"La misma palabra dos veces seguidas",ctx:txt.slice(Math.max(0,p.i-30),p.i+40).replace(/\s+/g," "),n:1}); } } });
    const dobles=(txt.match(/[^\s] {2,}[^\s]/g)||[]).length; if(dobles) orto.push({k:"s:dobles",tipo:"Formato",mal:"espacios dobles",bien:"un espacio",por:`${dobles} lugar(es) con dos o más espacios seguidos`,ctx:"",n:dobles});
    // validaciones
    const val=[];
    const campos=[...new Set([...txt.matchAll(/\{\{\s*([^{}\n]{1,80}?)\s*\}\}|\[([^\[\]\n]{1,80})\]/g)].map(x=>(x[1]||x[2]).trim()))];
    const lineas=(txt.match(/_{4,}/g)||[]).length;
    val.push({ok:!campos.length,txt:campos.length?`<b>${campos.length} dato(s) sin llenar:</b> ${campos.map(esc).join(", ")}`:"No quedan campos sin llenar ({{ }} o [ ])."});
    if(lineas) val.push({ok:true,aviso:true,txt:`${lineas} línea(s) en blanco (____) para completar a mano o firmar.`});
    const plano=txt.replace(/\s+/g," ");
    const RXM=/([A-ZÁÉÍÓÚÑ ]+?)\s*(D[ÓO]LARES|D[ÓO]LAR|BALBOAS|BALBOA)\s+CON\s+(\d{2})\/100\s*\(\s*(US\$|B\/\.|\$)\s*([\d,]+(?:\.\d{2})?)\s*\)/gi; let n=0;
    while(m=RXM.exec(plano)){ n++; const escrito=rvSinTilde(m[1].trim().toUpperCase()).replace(/^(LA SUMA DE|SUMA DE|DE)\s+/,""), cifra=m[5], num=Number(cifra.replace(/,/g,""));
      const e=Math.floor(num), c=Math.round((num-e)*100), esperado=rvSinTilde(e===1?"UN":rvApoc(rvEntero(e))).replace(/ DE$/,""), centOk=+m[3]===c;
      const antes=escrito.endsWith(" "+esperado)?escrito.slice(0,-esperado.length).trim():"";
      const ok=(escrito===esperado||(escrito.endsWith(" "+esperado)&&!/(CIENTO|CIENTOS|MIL|UN|UNO|DOS|TRES|CUATRO|CINCO|SEIS|SIETE|OCHO|NUEVE|DIEZ|ONCE|DOCE|TRECE|CATORCE|QUINCE|VEINTE|TREINTA|CUARENTA|CINCUENTA|SESENTA|SETENTA|OCHENTA|NOVENTA|Y|MILLON|MILLONES)$/.test(antes)))&&centOk;
      val.push({ok,txt:ok?`Monto <b>${esc(m[4]+cifra)}</b>: coincide con lo escrito en letras.`:`Monto <b>${esc(m[4]+cifra)}</b>: en letras dice «${esc(((m[1].trim().match(/(?:[A-ZÁÉÍÓÚÑ]+\s*)+$/)||[m[1]])[0]).trim())} … ${esc(m[3])}/100», pero esa cifra se escribe «<b>${esc(rvEntero(e))} … ${String(c).padStart(2,"0")}/100</b>».`}); }
    if(!n) val.push({ok:true,aviso:true,txt:"No hay montos con el formato «… DÓLARES CON 00/100 (US$…)» para comparar."});
    const k=rvTipo(txt); let tipo=null;
    if(k){ const r=RV_REGLAS[k]; tipo=r.nombre; const no=r.req.filter(([,rx])=>!rx.test(txt));
      val.push({ok:!no.length,txt:no.length?`<b>Le falta (${esc(r.nombre)}):</b> ${no.map(x=>esc(x[0])).join(" · ")}`:`Tiene los elementos de un(a) ${esc(r.nombre)}: ${r.req.map(x=>esc(x[0])).join(" · ")}.`}); }
    const fechas=[...new Set(plano.match(new RegExp("\\b\\d{1,2} de ("+RV_MES+") de \\d{4}\\b","gi"))||[])];
    if(fechas.length) val.push({ok:true,aviso:true,txt:`Fechas en el documento: ${esc(fechas.join(" · "))}`});
    return {orto,val,tipo};
  }
  function rvResumenHTML(an){
    const malos=an.val.filter(v=>!v.ok).length;
    return `<div class="rv-res"><span class="rv-tag ${an.orto.length?"bad":"ok"}">${an.orto.length} ortografía / formato</span><span class="rv-tag ${malos?"bad":"ok"}">${malos} validación(es) con error</span>${an.tipo?`<span class="rv-tag">Tipo: ${esc(an.tipo)}</span>`:""}</div>
      <div class="rv-val">${an.val.map(v=>`<div class="rv-it"><span class="rv-tag ${v.ok?(v.aviso?"":"ok"):"bad"}">${v.ok?(v.aviso?"Info":"OK"):"Revisar"}</span> ${v.txt}</div>`).join("")}</div>`;
  }
  /* Aplica en el Word (conservando su formato) solo las correcciones aceptadas */
  async function rvCorregirDocx(buf,items){
    const {zip,doc}=await abrirDocx(buf);
    const pal=items.filter(i=>i.k.startsWith("w:")), rep=items.some(i=>i.k.startsWith("r:")), dob=items.some(i=>i.k==="s:dobles");
    const repSet=new Set(items.filter(i=>i.k.startsWith("r:")).map(i=>i.k.slice(2)));
    let cambios=0;
    [...doc.getElementsByTagNameNS(W,"t")].forEach(t=>{ let s=t.textContent, o=s;
      pal.forEach(i=>{ const low=i.k.slice(2); s=s.replace(new RegExp("(?<![\\p{L}])("+low+")(?![\\p{L}])","giu"),w=>rvConservar(w,i.bien.toLowerCase())); });
      if(rep) s=s.replace(/(?<![\p{L}])(\p{L}+)(\s+)\1(?![\p{L}])/giu,(m0,w)=>repSet.has(w.toLowerCase())?w:m0);
      if(dob) s=s.replace(/(\S) {2,}(?=\S)/g,"$1 ");
      if(s!==o){ cambios++; t.textContent=s; t.setAttribute("xml:space","preserve"); } });
    zip.file("word/document.xml",new XMLSerializer().serializeToString(doc));
    return {blob:await zip.generateAsync({type:"blob",mimeType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"}),cambios};
  }
  async function rvListar(d,ruta,out,nivel){ if(!d||nivel>3) return; for await (const [n,h] of d.entries()){ if(n.startsWith(".")||n.startsWith("~$")||n.startsWith("_")) continue;
      if(h.kind==="directory") await rvListar(h,ruta?ruta+" › "+n:n,out,nivel+1); else if(/\.docx$/i.test(n)) out.push({ruta:ruta||"(raíz)",nombre:n,handle:h,dir:d}); } }
  async function revisar(){
    const c=$d("dxCuerpo");
    if(!raiz()){ c.innerHTML=`<div class="dx-vacio"><b>Elige la carpeta Legal</b>Pulsa «Elegir carpeta» arriba.</div>`; return; }
    c.innerHTML=`<div class="dx-vacio">Buscando documentos Word en la carpeta Legal…</div>`;
    const lista=[]; try{ await rvListar(raiz(),"",lista,0); }catch(e){}
    lista.sort((a,b)=>(a.ruta+a.nombre).localeCompare(b.ruta+b.nombre,"es"));
    c.innerHTML=`<div class="dx-bar"><span class="mut">Abre un Word de la carpeta Legal (o uno que te enviaron) y el sistema marca las faltas de ortografía, los datos sin llenar, los montos en letras que no coinciden y lo que le falta. Tú decides qué corregir; el formato del Word se conserva.</span></div>
      <div class="dx-form" style="padding-bottom:6px"><div class="dx-row">
        <select id="rvSel" style="flex:1;min-width:280px">${lista.length?lista.map((x,i)=>`<option value="${i}">${esc(x.ruta)} › ${esc(x.nombre)}</option>`).join(""):`<option value="">No hay archivos Word en la carpeta</option>`}</select>
        <button class="dx-b" id="rvAbrir"${lista.length?"":" disabled"}>🔎 Revisar</button><span class="mut">o</span><button class="dx-b g" id="rvSubir">⬆ Subir un Word</button></div></div>
      <div id="rvOut"></div>`;
    let actual=null;
    const mostrar=async(nombre,buf,origen)=>{
      const out=$d("rvOut"); out.innerHTML=`<div class="dx-vacio">Leyendo ${esc(nombre)}…</div>`;
      try{ const {ps}=await abrirDocx(buf.slice(0)); const texto=ps.map(textoP).join("\n"); const an=rvAnalizar(texto); actual={nombre,buf,origen,an};
        let h=await html(buf.slice(0),true);
        out.innerHTML=`<div class="rv-wrap"><div><div class="dx-row" style="padding:0 18px 10px"><b>${esc(nombre)}</b><span class="mut">${esc(origen?origen.ruta:"subido desde tu computadora")}</span></div><div class="dx-paper" id="rvPaper" style="margin:0 18px 18px">${h}</div></div>
          <div class="rv-lado"><h3>Revisión</h3>${rvResumenHTML(an)}
            ${an.orto.length?`<h3 style="margin-top:14px">Correcciones propuestas</h3><div class="rv-lista">${an.orto.map((o,i)=>`<label class="rv-co"><input type="checkbox" data-i="${i}" checked><span><span class="rv-tag ${o.tipo==="Ortografía"?"bad":""}">${esc(o.tipo)}</span> <s>${esc(o.mal)}</s> → <b>${esc(o.bien)}</b>${o.n>1?` <span class="mut">(${o.n} veces)</span>`:""}<span class="sm">${esc(o.por)}${o.ctx?` · «…${esc(o.ctx)}…»`:""}</span></span></label>`).join("")}</div>
            <div class="dx-row" style="margin-top:12px"><button class="dx-b ok" id="rvBajar">⬇ Descargar Word corregido</button>${origen?`<button class="dx-b g" id="rvGuardar">💾 Guardar corregido junto al original</button>`:""}</div><div class="dx-st" id="rvSt"></div>`
            :`<div class="dx-nota" style="margin-top:12px;background:#DDF0E3;color:#1F7A3D">✓ No se encontraron faltas de ortografía en la lista revisada.</div>`}
            <p class="sm" style="margin-top:12px">La revisión usa reglas (tildes, palabras repetidas, «-ción», montos en letras, elementos por tipo de documento). Las listas se ajustan con el equipo de Legal.</p></div></div>`;
        // marca en la vista las palabras con falta
        const marcar=()=>{ const ws=an.orto.filter(o=>o.k.startsWith("w:")).map(o=>o.k.slice(2)); if(!ws.length) return; const rx=new RegExp("(?<![\\p{L}])("+ws.join("|")+")(?![\\p{L}])","giu");
          const w=document.createTreeWalker($d("rvPaper"),NodeFilter.SHOW_TEXT); const ns=[]; let x; while(x=w.nextNode()) ns.push(x);
          ns.forEach(nd=>{ if(!rx.test(nd.nodeValue)) return; rx.lastIndex=0; const sp=document.createElement("span"); sp.innerHTML=esc(nd.nodeValue).replace(rx,'<span class="rv-mal">$1</span>'); nd.replaceWith(sp); }); };
        marcar();
        const sel=()=>[...out.querySelectorAll(".rv-co input:checked")].map(x=>an.orto[+x.dataset.i]);
        const st=(t,c2)=>{ const e=$d("rvSt"); if(e){ e.textContent=t; e.className="dx-st"+(c2?" "+c2:""); } };
        const nomCorr=nombre.replace(/\.docx$/i,"")+" (corregido).docx";
        if($d("rvBajar")) $d("rvBajar").onclick=async()=>{ try{ const r=await rvCorregirDocx(actual.buf.slice(0),sel()); bajar(r.blob,nomCorr); st(`✓ ${r.cambios} tramo(s) corregido(s). El original no se modificó.`,"okk"); }catch(e){ st(e.message,"err"); } };
        if($d("rvGuardar")) $d("rvGuardar").onclick=async()=>{ try{ st("Guardando…"); await permisoEscritura(); const r=await rvCorregirDocx(actual.buf.slice(0),sel()); await escribir(origen.dir,nomCorr,r.blob); st(`✓ Guardado como «${nomCorr}» en ${origen.ruta}. El original no se modificó.`,"okk"); }catch(e){ st(e.message,"err"); } };
      }catch(e){ out.innerHTML=`<div class="dx-vacio"><b>No se pudo leer el documento</b>${esc(e.message)}</div>`; } };
    if($d("rvAbrir")) $d("rvAbrir").onclick=async()=>{ const it=lista[+$d("rvSel").value]; if(!it) return; await mostrar(it.nombre,await (await it.handle.getFile()).arrayBuffer(),it); };
    $d("rvSubir").onclick=()=>{ const inp=document.createElement("input"); inp.type="file"; inp.accept=".docx"; inp.onchange=async()=>{ const f=inp.files[0]; if(f) await mostrar(f.name,await f.arrayBuffer(),null); }; inp.click(); };
  }

