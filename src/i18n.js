/*
 * i18n.js -- English / Spanish for the revision form.
 *
 * Spanish wording follows the house vocabulary already used in the CRM's
 * bilingual task subjects, so agents read the same terms here that they read on
 * their tasks:
 *
 *   Screen Printing  -> SERIGRAFÍA          Embroidery      -> BORDADO
 *   Vinyl Department -> DEPARTAMENTO DE VINILO
 *   Graphic Design   -> DISEÑO GRÁFICO      garments        -> prendas
 *   Deal             -> acuerdo             stage           -> etapa
 *   order revision   -> revisión del pedido
 *
 * ---------------------------------------------------------------------------
 * CRITICAL: translation is DISPLAY ONLY.
 *
 * Department, category and agent values are written to Zoho exactly as CRM
 * spells them, in English. Only the label an agent reads changes. Sending a
 * translated picklist value would be rejected on write.
 *
 * The note stays in English regardless of the agent's language, so every
 * revision note on every deal reads the same way for whoever reviews them --
 * matching the existing DEAL ONBOARDING FORM notes. The agent's own free-text
 * reason is stored verbatim in whatever language they typed it.
 * ---------------------------------------------------------------------------
 */

export const LANGS = ["en", "es"];

const STRINGS = {
  // ---- chrome -----------------------------------------------------------
  "app.Revision": { en: "Order Revision", es: "Revisión de Pedido" },
  "app.Correction": { en: "Order Correction", es: "Corrección de Pedido" },
  "app.loading": { en: "Loading the order…", es: "Cargando el pedido…" },
  "app.eventOf": { en: "event {n} of {max}", es: "evento {n} de {max}" },
  "app.atLimit": { en: "at limit", es: "en el límite" },

  // ---- section titles ---------------------------------------------------
  "sec.type": { en: "Type", es: "Tipo" },
  "sec.wrong": { en: "What went wrong", es: "Qué salió mal" },
  "sec.garments": { en: "Which garments", es: "Cuáles prendas" },
  "sec.closing": { en: "Closing date", es: "Fecha de cierre" },
  "sec.review": { en: "Review", es: "Revisar" },

  // ---- type -------------------------------------------------------------
  "type.revisionHint": {
    en: "The blank is reordered and every graphic on the garment is reprinted.",
    es: "Se reordena la prenda en blanco y se reimprime cada gráfico de la prenda.",
  },
  "type.correctionHint": {
    en: "The garment is salvaged in-house and only the affected placements are redone.",
    es: "La prenda se recupera internamente y solo se rehacen las ubicaciones afectadas.",
  },

  // ---- what went wrong --------------------------------------------------
  "lbl.department": { en: "{type} Department", es: "Departamento de {type}" },
  "lbl.categoryOne": { en: "Category (pick one)", es: "Categoría (elija una)" },
  "lbl.categoryMany": { en: "Category (pick one or more)", es: "Categoría (elija una o más)" },
  "lbl.reason": { en: "What happened?", es: "¿Qué pasó?" },
  "ph.reason": {
    en: "Plain description for whoever picks this up later.",
    es: "Descripción sencilla para quien lo retome después.",
  },
  "lbl.agent": { en: "{type} Agent", es: "Agente de {type}" },
  "agent.identified": {
    en: "Identified from the completed production tasks on this deal. Override if it is wrong.",
    es:
      "Identificado a partir de las tareas de producción completadas en este acuerdo. " +
      "Corríjalo si no es correcto.",
  },
  "agent.none": {
    en: "Nobody identified yet — pick the department and category above, or select manually.",
    es: "Nadie identificado aún — elija el departamento y la categoría arriba, o selecciónelo manualmente.",
  },
  "agent.miss": {
    en: " No completed Produce Order task found for: {list}.",
    es: " No se encontró tarea completada de Producir Orden para: {list}.",
  },
  "agent.unmapped": {
    en: " {list} has no production task to trace, so it identifies nobody on its own.",
    es: " {list} no tiene tarea de producción que rastrear, así que por sí solo no identifica a nadie.",
  },
  "agent.noOrder": {
    en: " No Order Garments task found for the misorder.",
    es: " No se encontró tarea de Pedido de Prendas para el error de pedido.",
  },
  "agent.rejected": {
    en: " Skipped (not on the agent list): {list}.",
    es: " Omitido (no está en la lista de agentes): {list}.",
  },

  // ---- garments ---------------------------------------------------------
  "g.none": { en: "No items yet.", es: "Aún no hay artículos." },
  "g.item": { en: "Item {n}", es: "Artículo {n}" },
  "g.remove": { en: "Remove", es: "Quitar" },
  "g.application": { en: "Application", es: "Aplicación" },
  "g.garment": { en: "Garment", es: "Prenda" },
  "g.graphic": { en: "Graphic", es: "Gráfico" },
  "g.placement": { en: "Placement redone", es: "Ubicación rehecha" },
  "g.placements": { en: "Placements affected", es: "Ubicaciones afectadas" },
  "g.placementsHint": {
    en: "Only the placements you tick are counted — a shirt with three placements where one is redone costs one placement, not three.",
    es: "Solo se cuentan las ubicaciones marcadas — una camisa con tres ubicaciones donde se rehace una cuesta una ubicación, no tres.",
  },
  "g.noPlacements": {
    en: "No placements recorded for this garment.",
    es: "No hay ubicaciones registradas para esta prenda.",
  },
  "g.affected": { en: "Garments affected", es: "Prendas afectadas" },
  "g.select": { en: "— select —", es: "— seleccione —" },
  "g.originalQty": { en: "Original order was {n}.", es: "El pedido original fue de {n}." },
  "g.allGraphics": {
    en: "All {n} graphic(s) on this garment will be reprinted.",
    es: "Se reimprimirán los {n} gráfico(s) de esta prenda.",
  },
  "g.add": { en: "+ Add an affected garment", es: "+ Agregar una prenda afectada" },
  "g.addMore": { en: "+ Add another affected garment", es: "+ Agregar otra prenda afectada" },
  "g.noGarments": {
    en: "No garment products found in this deal's payload.",
    es: "No se encontraron prendas en los datos de este acuerdo.",
  },

  // ---- closing date -----------------------------------------------------
  "cd.current": { en: "Current closing date", es: "Fecha de cierre actual" },
  "cd.notSet": { en: "not set", es: "sin definir" },
  "cd.update": { en: "Update closing date?", es: "¿Actualizar la fecha de cierre?" },
  "cd.new": { en: "New closing date", es: "Nueva fecha de cierre" },
  "cd.disclaimer": {
    en: "Please ensure that the client has been contacted and has approved the new closing date.",
    es:
      "Asegúrese de que se haya contactado al cliente y que haya aprobado la nueva fecha de cierre.",
  },

  // ---- review / submit --------------------------------------------------
  "r.screenPrint": { en: "Screen Print", es: "Serigrafía" },
  "r.embroidery": { en: "Embroidery", es: "Bordado" },
  "r.vinyl": { en: "Vinyl", es: "Vinilo" },
  "r.alsoStamps": {
    en:
      "Also stamps {stamp} and Failed Quality Check, sets {type}_Count to {n}, and posts a note " +
      "with the per-garment breakdown.",
    es:
      "También marca {stamp} y Control de Calidad Fallido, ajusta {type}_Count a {n}, y publica " +
      "una nota con el desglose por prenda.",
  },
  "r.stampRevision": { en: "Order Needs Revision", es: "Pedido Necesita Revisión" },
  "r.stampCorrection": { en: "Order Needs Corrections", es: "Pedido Necesita Correcciones" },
  "btn.cancel": { en: "Cancel", es: "Cancelar" },
  "btn.submit": { en: "Submit {type}", es: "Enviar {type}" },
  "btn.saving": { en: "Saving…", es: "Guardando…" },
  "need.all": {
    en: "Needs a department, a category, a reason, and at least one garment with a count.",
    es: "Requiere un departamento, una categoría, una razón y al menos una prenda con cantidad.",
  },
  "need.closing": {
    en: "Pick a new closing date and confirm the client has approved it.",
    es: "Elija una nueva fecha de cierre y confirme que el cliente la ha aprobado.",
  },
  "ok.saved": { en: "Saved to slot {n}.", es: "Guardado en la casilla {n}." },
  "err.nothing": { en: "Nothing was saved. ", es: "No se guardó nada. " },

  // ---- banners ----------------------------------------------------------
  "b.noRecord": {
    en:
      "No onboarding record found on this deal — no JSON payload and no DEAL ONBOARDING FORM note. " +
      "Online orders bypass onboarding, so this is normal for those. Nothing to pick from.",
    es:
      "No se encontró registro de incorporación en este acuerdo — ni datos JSON ni nota DEAL " +
      "ONBOARDING FORM. Los pedidos en línea omiten la incorporación, así que esto es normal en " +
      "esos casos. No hay nada que seleccionar.",
  },
  "b.readFail": {
    en: "Could not read the onboarding record ({reason}).",
    es: "No se pudo leer el registro de incorporación ({reason}).",
  },
  "b.fromNote": {
    en:
      "Read from the DEAL ONBOARDING FORM note — this deal predates the JSON payload. Colors, " +
      "underbase and placements all came through, so the print count is calculated the same way. " +
      "The note does not record the original order quantity, so garments below show their size " +
      "breakdown instead.",
    es:
      "Leído de la nota DEAL ONBOARDING FORM — este acuerdo es anterior a los datos JSON. Los " +
      "colores, la base y las ubicaciones se recuperaron, así que el conteo de impresiones se " +
      "calcula igual. La nota no registra la cantidad original del pedido, por eso las prendas " +
      "abajo muestran su desglose de tallas.",
  },
  "b.atLimitRevision": {
    en:
      "This deal has already had {n} revision(s), which is the limit. Escalate rather than " +
      "logging a fourth.",
    es:
      "Este acuerdo ya ha tenido {n} revisión(es), que es el límite. Escale el caso en lugar de " +
      "registrar una cuarta.",
  },
  "b.atLimitCorrection": {
    en:
      "This deal has already had {n} correction(s), which is the limit. A garment will not take a " +
      "third reprint — log this as a Revision instead.",
    es:
      "Este acuerdo ya ha tenido {n} corrección(es), que es el límite. Una prenda no soporta una " +
      "tercera reimpresión — regístrelo como Revisión.",
  },
  "b.notWidget": {
    en: "Not running inside a Zoho widget. Open this from a Deal record.",
    es: "No se está ejecutando dentro de un widget de Zoho. Ábralo desde un acuerdo.",
  },
  "b.noContext": {
    en: "No record context. Open this widget from a Deal.",
    es: "Sin contexto de registro. Abra este widget desde un acuerdo.",
  },
  "b.loadFail": {
    en: "Could not load the deal: {msg}",
    es: "No se pudo cargar el acuerdo: {msg}",
  },
};

/*
 * Picklist DISPLAY only. The keys are the values written to Zoho and must never
 * change; only the Spanish label is presentational.
 */
const DEPARTMENT_ES = {
  "Screen Printing": "Serigrafía",
  Embroidery: "Bordado",
  "Vinyl Department": "Departamento de Vinilo",
  Outsourced: "Subcontratado",
  "Graphic Design": "Diseño Gráfico",
  Ordering: "Pedidos",
};

const CATEGORY_ES = {
  "Misprint (Placement)": "Impresión defectuosa (Ubicación)",
  "Misprint (Wrong Graphic)": "Impresión defectuosa (Gráfico incorrecto)",
  "Misprint (Wrong Colors)": "Impresión defectuosa (Colores incorrectos)",
  "Misprint (Malfunction)": "Impresión defectuosa (Falla de máquina)",
  "Misprint (Wrong Size or Product)": "Impresión defectuosa (Talla o producto incorrecto)",
  "Misprint (Other)": "Impresión defectuosa (Otro)",
  "Wrong Product Size (Misorder)": "Talla incorrecta (Error de pedido)",
  "Wrong Product Type (Misorder)": "Producto incorrecto (Error de pedido)",
  "Missing Product": "Producto faltante",
  "Damaged Product (Shipped Damaged)": "Producto dañado (Dañado en el envío)",
  "Damaged Product (During Production)": "Producto dañado (Durante la producción)",
  "Client Unhappy": "Cliente insatisfecho",
  "Other (Please Detail in Revision Reason Notes)":
    "Otro (Detalle en las notas de razón de revisión)",
  "Other (Please Detail in Correction Reason Notes)":
    "Otro (Detalle en las notas de razón de corrección)",
};

// Application names as they appear in the onboarding payload.
const APPLICATION_ES = {
  "Screen Printing": "Serigrafía",
  Embroidery: "Bordado",
  "Direct-to-Garment": "Directo a Prenda (DTG)",
  "Direct-to-Film": "Directo a Película (DTF)",
  "Heat-Transfer": "Transferencia de Calor",
  Vinyl: "Vinilo",
  "Pressed Patches": "Parches Prensados",
  "Graphic Design": "Diseño Gráfico",
};

export function makeT(lang) {
  return function t(key, vars) {
    const entry = STRINGS[key];
    let out = entry ? entry[lang] || entry.en : key;
    if (vars) {
      Object.keys(vars).forEach((k) => {
        out = out.split("{" + k + "}").join(String(vars[k]));
      });
    }
    return out;
  };
}

export const labelDepartment = (v, lang) => (lang === "es" && DEPARTMENT_ES[v]) || v;
export const labelCategory = (v, lang) => (lang === "es" && CATEGORY_ES[v]) || v;
export const labelApplication = (v, lang) => (lang === "es" && APPLICATION_ES[v]) || v;

const KEY = "tpp.revisionForm.lang";

export function loadLang() {
  try {
    const v = window.localStorage.getItem(KEY);
    return LANGS.indexOf(v) >= 0 ? v : "en";
  } catch (e) {
    return "en"; // private windows and blocked site data both throw
  }
}

export function saveLang(lang) {
  try {
    window.localStorage.setItem(KEY, lang);
  } catch (e) {
    /* not worth failing over */
  }
}
