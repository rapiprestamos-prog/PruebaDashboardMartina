const IA_SISTEMA=`Eres el asistente legal interno de M&A Capital (Panamá). Trabajas SOLO con los documentos y datos que se te entregan.
Reglas:
- No inventes datos. Si algo no aparece en los documentos, dilo claramente o deja el valor vacío.
- Indica el nombre del archivo de donde sale cada dato.
- Escribe en español salvo que se pida otro idioma.
- Responde ÚNICAMENTE con un objeto JSON válido, sin texto antes ni después, con la forma indicada.`;
const IA_DOCS=(docs=[])=>docs.map(d=>`<<<DOCUMENTO: ${d.nombre}>>>\n${d.texto}\n<<<FIN: ${d.nombre}>>>`).join("\n\n");
const IA_TAREAS={
  caso_meta:b=>`Caso (subcarpeta): ${b.caso}
Con los documentos, identifica la sociedad del grupo que participa y el tipo de proceso (por ejemplo, compraventa de inmueble, contrato de servicios, confidencialidad).
Devuelve: {"sociedad":"","tipo_proceso":""} (vacío si no se puede saber).

${IA_DOCS(b.documentos)}`,
  due_diligence:b=>`Caso: ${b.caso}
Datos a revisar: ${(b.datos||[]).join(", ")}.
Extrae de TODOS los documentos esos datos (por ejemplo: partes con nombres, cédulas o RUC; fincas con número y ubicación; fechas de firma, vencimientos y vigencias; precios, montos y abonos; hipotecas, gravámenes o limitaciones) y compara el mismo dato entre documentos.
Devuelve: {"datos":[{"dato":"nombre del dato","valor":"valor principal","valores":[{"documento":"archivo","valor":"como aparece"}],"documentos":["archivos donde aparece"],"estado":"coincide|revisar|diferencia","nota":"explicación breve si no es coincide"}]}
"diferencia" = dos documentos dicen cosas distintas; "revisar" = incompleto, vencido o dudoso; "coincide" = todos concuerdan.

${IA_DOCS(b.documentos)}`,
  redaccion_campos:b=>`Caso: ${b.caso}${b.sociedad?`\nSociedad del caso: ${b.sociedad}`:""}
Idioma de los valores: ${b.idioma||"Español"}.
La plantilla tiene estos campos entre corchetes: ${(b.campos||[]).map(c=>`[${c}]`).join(", ")}.
Busca el valor de cada campo en los documentos del caso. Si un campo no aparece, deja "valor" vacío. Escribe los valores tal como deben ir en el documento (montos en letras si el campo lo pide).
Devuelve: {"campos":{"NOMBRE DEL CAMPO":{"valor":"","fuente":"archivo"}}} usando los nombres de campo exactamente como están (sin corchetes).

TEXTO DE LA PLANTILLA:
${b.plantilla||""}

DOCUMENTOS DEL CASO:
${IA_DOCS(b.documentos)}`,
  redaccion_cambio:b=>`Pedido de cambio: "${b.pedido}"
Idioma: ${b.idioma||"Español"}.
Estos son los párrafos del documento (índice y texto). Propón el cambio mínimo necesario: modifica solo los párrafos que hagan falta y conserva los campos entre corchetes que no se deban tocar.
Devuelve: {"cambios":[{"parrafo":índice,"propuesto":"texto completo nuevo del párrafo","explicacion":"qué cambiaste"}]}

${(b.parrafos||[]).map(p=>`[${p.i}] ${p.texto}`).join("\n")}`,
  redaccion_validar:b=>`Revisa la consistencia de este documento ya llenado: montos en letras contra números, nombres y cédulas contra los documentos del caso, fechas y plazos coherentes, campos vacíos o entre corchetes que quedaron sin llenar.
Devuelve: {"validaciones":[{"estado":"OK|PENDIENTE|ERROR","texto":"qué revisaste y qué encontraste"}]}

DOCUMENTO:
${b.texto||""}

DOCUMENTOS DEL CASO:
${IA_DOCS(b.documentos)}`,
  cierre:b=>`Caso: ${b.caso}
Checklist del proceso "${b.checklist}":
${(b.items||[]).map((x,i)=>`${i+1}. ${x.documento}${x.detalle?` (${x.detalle})`:""}`).join("\n")}
Archivos de la carpeta del caso: ${(b.archivos||[]).map(a=>`${a.nombre} (modificado ${a.modificado})`).join("; ")}
Para cada documento del checklist, busca el archivo que le corresponde y decide su estado: "Final" (firmado/completo y vigente), "Por modificar" (borrador, falta firma, vencido o con algo que corregir) o "Falta" (no hay archivo).
Devuelve: {"items":[{"documento":"del checklist","archivo":"archivo encontrado o vacío","estado":"Final|Por modificar|Falta","motivo":"breve"}],"que_falta":["pasos concretos para cerrar"],"alertas":["vencimientos u otros riesgos con fecha, si los hay"]}

${IA_DOCS(b.documentos)}`,
  correo_seguimiento:b=>`Redacta un correo de seguimiento profesional y breve para cerrar el caso "${b.caso}" (checklist "${b.checklist}").
Pendientes: ${JSON.stringify(b.que_falta||[])}
Estado de documentos: ${JSON.stringify(b.items||[])}
Alertas: ${JSON.stringify(b.alertas||[])}
No inventes destinatarios ni nombres que no estén en los datos; usa "[Nombre]" donde haga falta.
Devuelve: {"asunto":"","cuerpo":""}`,
  comparar:b=>`Compara estos dos documentos y lista las diferencias relevantes (partes, montos, fechas, plazos, cláusulas añadidas o quitadas, obligaciones).
Devuelve: {"resumen":"","diferencias":[{"tema":"","a":"lo que dice A","b":"lo que dice B","importancia":"Alta|Media|Baja"}]}

DOCUMENTO A:
${IA_DOCS([b.a])}

DOCUMENTO B:
${IA_DOCS([b.b])}`,
  consultar:b=>`Pregunta: ${b.pregunta}
Responde usando solo este documento y copia los fragmentos que lo respaldan.
Devuelve: {"respuesta":"","citas":[{"texto":"fragmento literal","ubicacion":"cláusula o sección"}]}

${IA_DOCS([b.documento])}`,
  semaforo:b=>`Caso: ${b.caso}
Evalúa el riesgo legal del caso con sus documentos: vencimientos próximos o pasados, firmas o poderes faltantes, gravámenes, diferencias entre documentos, cláusulas desfavorables.
Devuelve: {"nivel":"verde|amarillo|rojo","resumen":"una línea","riesgos":[{"riesgo":"","gravedad":"Alta|Media|Baja","documento":"archivo"}]}

${IA_DOCS(b.documentos)}`
};
// La IA pasa por la función agente-legal de Supabase (la clave de Anthropic vive allá, nunca en esta página)
async function ia(tarea,payload){
  const s=await window.claude.use("sample"); if(!s) throw new Error("La IA no está disponible: entra al Agente Legal desde el inicio del dashboard.");
  try{
    if(tarea==="chat"){
      const msgs=[{role:"user",content:IA_SISTEMA+`\n\nDocumentos del caso "${payload.caso}":\n\n${IA_DOCS(payload.documentos)}\n\nVoy a hacerte preguntas sobre estos documentos. Responde solo con lo que digan. Devuelve siempre {"respuesta":"..."}.`},
        {role:"assistant",content:'{"respuesta":"Entendido. ¿Qué necesitas saber?"}'},...(payload.mensajes||[]).map(m=>({role:m.role==="assistant"?"assistant":"user",content:m.content}))];
      const r=await s(msgs); const t=r.text, i=t.indexOf("{"), j=t.lastIndexOf("}");
      try{ return JSON.parse(t.slice(i,j+1)); }catch(e){ return {respuesta:t}; }
    }
    const armar=IA_TAREAS[tarea]; if(!armar) throw new Error("Tarea desconocida: "+tarea);
    return await s.json(IA_SISTEMA+"\n\n"+armar(payload));
  }catch(e){ throw new Error(e&&e.message||"No se pudo completar con la IA."); }
}
