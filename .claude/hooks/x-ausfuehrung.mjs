#!/usr/bin/env node
// A-531 AUSFUEHRUNG PR 3: Hook der Hintergrundroutine für genau die freigabepflichtigen Aufrufe – Gmail send_message/reply und Schreibwerkzeuge jedes fremden Connectors (gesteuert(), MCP-1: z. B. Metricool, HubSpot, Notion, Slack, Shopify).
// Muster: docs/x2/spike/mandant-repo/_claude/hooks/x-freigabe.mjs + versand-melden.mjs (Altweg, unverändert). Unterschied: kein Connector-Token – der Hook weist sich mit der Lease des
// Auftrags aus (POST /api/x/freigabe-pruefen und /api/x/versand-melden ohne Authorization-Kopf, lib/x/connector/hook.ts, PR 1).
//   post (PostToolUse, jedes MCP-Werkzeug): arbeit_holen von „EXAVA Hintergrund“ → Lease des gelieferten Auftrags nach .exava/lease.json (Claude schreibt sie nie selbst; ohne Auftrag geleert).
//            Drive get_file_permissions im Auftrag ablage: Ordner mit einem verbundenen Postfach als Eigentümer → lease.ordner (A-534, G7: Verschieben nur in eigene Ordner).
//            Gmail get_thread im Versandauftrag: Thread-Stand (IDs, sha256) → /api/x/quellen-beobachtung mit Lease (B10-HINTERGRUND: Antwort nur, wenn der Thread unverändert ist).
//            prepare_file_upload von „EXAVA Hintergrund“: Host der upload_url → lease.upload_hosts (A-531 COMPLIANCE H2: die Policy lässt curl PUT nur dorthin).
//            A-600 FOLGE: ebenso exava_datei_lesen – Host der download_url → lease.upload_hosts (die Policy lässt curl -o nur von dort zu).
//            A-608 BELEG-ORIGINAL (E-1120 Regel 1): Drive download_file_content im Auftrag belegsuche → der Hook selbst schreibt das Original (PDF/JPEG/PNG/TIFF, ≤ 20 MiB, Magic Bytes)
//            nach arbeit/drive-<fileId>.<endung> und merkt die SHA-256 in lease.originale; die Policy lässt curl PUT im Auftrag belegsuche nur für eine gemerkte Prüfsumme zu.
//            Ebenso Gmail get_message mit messageFormat RAW: PDF-/Bild-Anhänge (MIME, base64) nach arbeit/gmail-<messageId>-<n>.<endung>.
//            A-657 GO pdf.py: ohne solchen Anhang die Rohmail nach arbeit/gmail-<messageId>.eml (lease.rohmails); Bash pdf.py --mail dazu → erzeugte PDF in lease.originale.
//            A-657/A-658: arbeit_holen eines Belegsuche-Auftrags mit job.bezug.csv → lease.csv (die Policy lässt dann Write und Upload der CSV zu).
//            A-642: Ist das Ergebnis größer als MAX_MCP_OUTPUT_TOKENS, liest der Hook die von Claude Code gespeicherte Ausgabe (<session_id>/tool-results/, gespeicherteAusgabe).
//            A-626 WEB (nur Aufträge aus WEB_ARTEN, A-782): arbeit_holen → lease.web = Web-Adressen aus dem Auftragstext (job.eingabe ohne angehängten Gesprächsverlauf); WebSearch → Adressen der Treffer
//            (url mit title, nie der Suchtext); WebFetch → der Hook lädt dieselbe Seite selbst (GET, nur HTML, ≤ 4 MiB) und merkt Zieladresse und Links (href) – nie Text aus der
//            Zusammenfassung des Modells. Höchstens 3.000 Adressen je Auftrag; die Policy lässt WebFetch und curl -o aus dem Web nur dafür zu.
//            Gesteuerter Aufruf mit Vermerk aus pre → „ausgeführt“ melden (ok/fehler, bei Gmail mit Message-ID); Fehler beim Melden ändern nichts (der Wachhund setzt „unklar“).
//   pre  (PreToolUse, jedes MCP-Werkzeug): nicht gesteuert → durchlassen (die übrigen Hooks entscheiden). Gesteuert → nur, wenn EXAVA für genau diesen Aufruf mit dieser Lease
//            „erlaubt“ antwortet (Hash am freigegebenen Entwurf, genau einmal reserviert); sonst Exit 2. Keine Lease, kein Netz, Fehler, Frist, Anhänge → gesperrt (fail closed).
//            A-615: Drive get_file_metadata im Auftrag ablage – bestätigter eigener Ordner namens „Archiv“ (Ordner-MIME) → lease.archiv (einziges Upload-Ziel).
//   pre, Drive create_file mit base64Content "@arbeit/<datei>.pdf" (A-615, Auftrag ablage; A-642 OFFICE ebenso .doc/.docx/.xls/.xlsx/.csv/.odt/.ods/.rtf): der Hook liest die Datei
//            (kein Verweis, Magic Bytes passend zur Endung, ≤ 20 MiB), prüft __#hash8 im Titel gegen
//            die selbst gerechnete SHA-256 und setzt den Inhalt per updatedInput ein – das Modell gibt nie Binärdaten aus; Ziel nur lease.archiv. Sonst Exit 2.
//   pre, Drive copy_file (A-638, Auftrag ablage, Anhang über ~7 MB): Quelle nur eine eigene Datei (lease.ordner) mit Namen …__#<hash8>.pdf (lease.kopierbar aus search_files/get_file_metadata
//            ohne Textauszüge), hash8 = Anfang der SHA-256 eines Anhangs von exava_datei_lesen (lease.anhaenge), Titel mit demselben __#hash8 (G13). Sonst Exit 2.
//   A-818 (G5): arbeit_holen eines Ablage-Auftrags mit job.bezug.datev_paket → lease.datev (Name, drei Ordner); get_file_metadata des bestätigten eigenen Monatsordners → lease.datev_ziel;
//            create_file mit "@arbeit/<name>.zip" → Inhalt per updatedInput nur als ZIP ≤ 7 MB mit der SHA-256 aus exava_datei_lesen (lease.anhaenge), Titel <name>__#<hash8>.zip, Ziel lease.datev_ziel.
//   pre, Bash (A-531 DATEI): nur die curl-PUT-Form (hintergrund-policy.mjs hat sie geprüft) – EXAVA gibt die Upload-URL frei (art upload: Auftrag, Lauf, angemeldete Datei), sonst Exit 2.
//            A-623 FOLGE: Laden (curl -o nach arbeit/, Skills x-eingang und x-ablage) lässt er in genau dieser Form durch – Host und Pfad prüft die Policy (BASH_LADEN, Host aus der Lease).
// Host fest (A-305: ein Host für alle Kunden) – nie aus einer Datei, die Claude beschreiben kann. Das Silo aus der Lease ist nur Wegweiser (wie im Token).
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

export const EXAVA_HOST = "https://app.exava.ai";
export const FRIST_MS = 10_000;
export const EXAVA_SERVER = "exava_hintergrund";
/** Wortgleich mit hintergrund-policy.mjs (scripts/test/a529-vorlage.ts prüft die Gleichheit). */
export const LESEN = new Set(["get", "list", "search", "read", "fetch", "find", "describe", "download", "estimate", "check", "query", "compute", "preview", "count", "lookup", "view", "show", "inspect", "guide", "suggest"]);
export const SCHREIBEN = new Set(["create", "update", "delete", "remove", "send", "publish", "upload", "add", "set", "put", "patch", "write", "share", "invite", "move", "rename", "copy", "archive",
  "merge", "push", "fire", "trigger", "approve", "submit", "cancel", "pause", "resume", "enable", "disable", "mark", "apply", "assign", "transfer", "pay", "duplicate", "manage", "run", "execute",
  "start", "stop", "reply", "forward", "respond", "edit", "insert", "replace", "import", "export", "sync", "subscribe", "unsubscribe", "label", "trash", "spam", "comment", "resolve", "revoke", "grant",
  "deploy", "close", "lock", "schedule", "save", "reset", "clear", "purge", "drop", "destroy", "kill", "terminate"]);
/** A-531 HOOK-WORTLISTE: nach einem Verbindungswort muss wieder ein Lesewort stehen (fetch_and_post, get_or_upsert → nicht lesend). */
export const VERBINDUNG = new Set(["and", "or", "then", "plus"]);
export const woerter = (name) => String(name ?? "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").split(/[\s_.-]+/).filter(Boolean).map((w) => w.toLowerCase());
export function lesend(name) { const w = woerter(name); if (w[0] === "bulk") w.shift(); return w.length > 0 && LESEN.has(w[0]) && !w.some((x) => SCHREIBEN.has(x)) && w.every((x, i) => !VERBINDUNG.has(w[i - 1]) || LESEN.has(x)); }
export function mcpTeile(name) { const t = /^mcp__(.+?)__(.+)$/.exec(String(name ?? "")); return t ? { server: t[1].toLowerCase().replace(/[\s-]/g, "_"), werkzeug: t[2] } : null; }
/** Freigabepflichtig und über diesen Hook ausführbar: Gmail senden/antworten (Mail-Entwurf, Hash v2) und jeder fremde Connector schreibend (Werkzeug-Entwurf, Hash v3, D18; MCP-1):
 *  fremd = kein Kern-Server (Gmail, Drive, Kalender), nicht exava*, kein UUID-Name (der bleibt beim Werkzeugvertrag, sonst fail closed). Wortgleich in hintergrund-policy.mjs. */
export function gesteuert(t) { return !!t && ((t.server === "gmail" && (t.werkzeug === "send_message" || t.werkzeug === "reply")) || (!/(^|_)(gmail|(google_)?drive|google_calendar)$/.test(t.server) && !t.server.startsWith("exava") && !/^[0-9a-f]{8}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{12}$/.test(t.server) && /^[a-z0-9_]+$/.test(t.server) && /^[A-Za-z0-9_.-]+$/.test(t.werkzeug) && !lesend(t.werkzeug))); }

const projekt = (env) => String(env.CLAUDE_PROJECT_DIR || process.cwd());
const leasePfad = (env) => join(projekt(env), ".exava", "lease.json");
const vermerkPfad = (env, toolUseId) => join(projekt(env), ".exava", `ausfuehrung-${createHash("sha256").update(String(toolUseId)).digest("hex").slice(0, 32)}.json`);
const nein = (grund) => ({ code: 2, stderr: `Gesperrt (EXAVA-Ausführung): ${grund}` });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lease aus .exava/lease.json – nur job_id, lauf_id, lease_token, silo; sonst null. */
export function leaseLesen(env = process.env) {
  try {
    const l = JSON.parse(readFileSync(leasePfad(env), "utf8"));
    return l && UUID.test(String(l.job_id)) && UUID.test(String(l.lauf_id)) && /^[A-Za-z0-9_-]{20,200}$/.test(String(l.lease_token))
      ? { job_id: l.job_id, lauf_id: l.lauf_id, lease_token: l.lease_token, ...(typeof l.silo === "string" ? { silo: l.silo } : {}) } : null;
  } catch { return null; }
}

/** Alle JSON-Objekte aus einer Werkzeugantwort (Text-Inhalte des MCP-Ergebnisses). */
function antwortObjekte(r, out = []) {
  if (typeof r === "string") { try { antwortObjekte(JSON.parse(r), out); } catch { /* kein JSON */ } }
  else if (Array.isArray(r)) for (const x of r) antwortObjekte(x, out);
  else if (r && typeof r === "object") { out.push(r); for (const k of ["text", "content", "result", "structuredContent"]) if (k in r) antwortObjekte(r[k], out); }
  return out;
}

/** Hook-Körper für freigabe-pruefen aus dem Werkzeugaufruf: Mail (felder, Anhänge mit Inhalt nicht unterstützt) oder Werkzeug (eingabe). */
export function pruefKoerper(name, t, eingabe, lease, toolUseId) {
  const ti = eingabe && typeof eingabe === "object" && !Array.isArray(eingabe) ? eingabe : {};
  if (t.server === "gmail") {
    if (Array.isArray(ti.attachments) && ti.attachments.length) return null; // Anhänge: get_approved_draft lehnt sie ab – nie halb senden
    return { lease, werkzeug: name, felder: ti, anhaenge: [], tool_use_id: toolUseId };
  }
  return { lease, art: "werkzeug", werkzeug: name, eingabe: ti, tool_use_id: toolUseId };
}

async function senden(pfad, koerper, f = fetch) {
  const r = await f(`${EXAVA_HOST}${pfad}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(koerper), signal: AbortSignal.timeout(FRIST_MS - 1000) });
  let b = {}; try { b = await r.json(); } catch { /* leer */ }
  return { status: r.status, body: b };
}

/** PreToolUse-Entscheidung. Liefert { code, stderr? }. `f` austauschbar (Test). */
export const CURL_URL = /^\/usr\/bin\/curl -q -sSf -X PUT --data-binary @\S+ -H "content-type: [^"]+" "(https:\/\/[^"\s]+)"$/;
export const CURL_LADEN = /^\/usr\/bin\/curl -q -sSfL -o arbeit\/[A-Za-z0-9._#-]{1,160} "https:\/\/[^"\s$`\\]+"$/; // A-623 FOLGE: Form wie BASH_LADEN der Policy, ohne Dollar, Backtick und Backslash
export async function vorher(eingabe, { env = process.env, f = fetch } = {}) {
  const d = mcpTeile(eingabe?.tool_name);
  if (d && (d.server === "google_drive" || /^[0-9a-f]{8}_[0-9a-f]{4}_/.test(d.server)) && d.werkzeug === "create_file" && eingabe.tool_input?.base64Content !== undefined) return anhangEinsetzen(eingabe.tool_input, env);
  if (d && (d.server === "google_drive" || /^[0-9a-f]{8}_[0-9a-f]{4}_/.test(d.server)) && d.werkzeug === "copy_file") return kopieBinden(eingabe.tool_input, env); // A-638
  if (eingabe?.tool_name === "Bash") { // A-531 DATEI: Upload-Ziel prüft EXAVA (datei-upload.md §3.3); andere Formen hat die Policy schon entschieden
    const c = String(eingabe.tool_input?.command ?? ""), url = CURL_URL.exec(c)?.[1];
    if (!url) return /\bcurl\b/.test(c) && !CURL_LADEN.test(c) ? nein("curl nur in der freigelisteten Form.") : { code: 0 }; // A-623 FOLGE: Laden entscheidet die Policy
    const lease = leaseLesen(env), toolUseId = String(eingabe.tool_use_id ?? "");
    if (!lease || !/^[^\s]{1,300}$/.test(toolUseId)) return nein("Upload nur im Auftrag aus arbeit_holen (Lease) mit tool_use_id.");
    const r = await senden("/api/x/freigabe-pruefen", { lease, art: "upload", url, tool_use_id: toolUseId }, f);
    return r.status === 200 && r.body?.erlaubt === true ? { code: 0 } : nein(`Upload-Ziel nicht freigegeben (${String(r.body?.grund ?? r.status).slice(0, 80)}).`);
  }
  const t = mcpTeile(eingabe?.tool_name);
  if (!gesteuert(t)) return { code: 0 };
  const lease = leaseLesen(env);
  if (!lease) return nein("ohne Lease kein Ausführen – nur im Auftrag aus arbeit_holen nach Freigabe in EXAVA.");
  const toolUseId = String(eingabe.tool_use_id ?? "");
  if (!/^[^\s]{1,300}$/.test(toolUseId)) return nein("tool_use_id fehlt.");
  const koerper = pruefKoerper(eingabe.tool_name, t, eingabe.tool_input, lease, toolUseId);
  if (!koerper) return nein("Anhänge im Sendeaufruf werden in der Hintergrundarbeit nicht ausgeführt.");
  const r = await senden("/api/x/freigabe-pruefen", koerper, f);
  if (r.status !== 200 || r.body?.erlaubt !== true || !UUID.test(String(r.body?.entwurf_id))) return nein(String(r.body?.text ?? r.body?.grund ?? `EXAVA antwortet ${r.status}`).slice(0, 300));
  mkdirSync(join(projekt(env), ".exava"), { recursive: true });
  writeFileSync(vermerkPfad(env, toolUseId), JSON.stringify({ entwurf_id: r.body.entwurf_id, werkzeug: eingabe.tool_name, art: t.server === "gmail" ? null : "werkzeug" }));
  return { code: 0 };
}

/** A-615: Upload eines Mail-Anhangs nach 00-EXAVA/Archiv. Platzhalter "@arbeit/<datei>.pdf" (Datei aus exava_datei_lesen + curl -o) → Inhalt base64 per updatedInput;
 *  nur im Auftrag ablage, nur genau diese Felder, Ziel nur lease.archiv, Titel endet auf __#<erste 8 Zeichen der SHA-256 der Datei>.pdf (G13 – der Hook rechnet selbst). */
export const ANHANG_PLATZHALTER = /^@(arbeit\/[A-Za-z0-9._-]{1,140}(?:__#[0-9a-f]{8})?\.(pdf|docx?|xlsx?|csv|odt|ods|rtf|jpe?g|png|webp|heic))$/;
/** A-642 OFFICE: genau ein MIME je Endung (wie ANHANG_MIME in hintergrund-policy.mjs); Makro-Formate (docm, xlsm, …) gibt es nicht. A-655: Beleg-Fotos und Scans, nie .ics/.vcf. */
export const ANHANG_MIME = { pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", csv: "text/csv", odt: "application/vnd.oasis.opendocument.text", ods: "application/vnd.oasis.opendocument.spreadsheet", rtf: "application/rtf",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic" };
/** A-642 OFFICE: Inhalt passt zur Endung (Magic Bytes, nie Name oder mimeType): PDF %PDF-; docx/xlsx/odt/ods ZIP ohne vbaProject.bin (Makros); doc/xls OLE; rtf {\rtf; csv Text ohne NUL in den ersten 8 KB und ohne PDF-/Bild-Signatur.
 *  A-655: jpg/jpeg FF D8 FF, png wie originalEndung, webp RIFF….WEBP, heic ISO-BMFF ftyp mit HEIF-Marke. */
export function anhangPasst(buf, e) {
  const k = (s) => buf.subarray(0, s.length).equals(Buffer.from(s, "latin1")), b = (von, bis) => buf.subarray(von, bis).toString("latin1");
  return buf.length > 0 && (e === "pdf" ? originalEndung(buf) === "pdf" : ["docx", "xlsx", "odt", "ods"].includes(e) ? k("PK\x03\x04") && !buf.includes("vbaProject.bin")
    : ["doc", "xls"].includes(e) ? k("\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1") : e === "rtf" ? k("{\\rtf") : e === "csv" ? !buf.subarray(0, 8192).includes(0) && !originalEndung(buf)
    : ["jpg", "jpeg"].includes(e) ? originalEndung(buf) === "jpg" : e === "png" ? originalEndung(buf) === "png" : e === "webp" ? k("RIFF") && b(8, 12) === "WEBP"
    : e === "heic" ? b(4, 8) === "ftyp" && ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(b(8, 12)) : false);
}
/** A-818 (G5, Go Bauherr 28.10.2026): DATEV-Paket des Ablage-Auftrags – wortgleich in hintergrund-policy.mjs (scripts/test/a529-vorlage.ts prüft die Gleichheit). */
export const DATEV_ZIP_MAX = 7_000_000; // Grenze des Drive-Connectors (A-638) – größere Pakete bleiben Download in EXAVA (lib/datev/drive.ts DRIVE_MAX_BYTES)
export const DATEV_STAMM = /^DATEV_[A-Z0-9_-]{1,20}_(\d{4}-(?:0[1-9]|1[0-2]))(?:_Nachtrag-\d{1,2})?$/, DATEV_ORDNER = /^(?!\.{1,2}$)[^<>:"/\\|?*\x00-\x1f]{1,80}$/;
export function datevAus(d) {
  const m = DATEV_STAMM.exec(String(d?.name ?? "")), o = d?.ordner;
  return m && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(String(d.export_id)) && Number.isInteger(d.nr) && d.nr >= 1 && d.nr <= 99 && Array.isArray(o) && o.length === 3
    && o[0] === "DATEV-Exporte" && o[2] === m[1] && o.every((x) => typeof x === "string" && x.trim() === x && DATEV_ORDNER.test(x)) ? { export_id: d.export_id, nr: d.nr, name: d.name, ordner: [...o] } : null;
}
/** A-818 (G5): DATEV-Paket ins Drive – Platzhalter "@arbeit/<name>.zip" (Datei aus exava_datei_lesen + curl -o) → Inhalt base64 per updatedInput; nur im Auftrag ablage mit lease.datev,
 *  nur genau diese Felder, Ziel nur der bestätigte Monatsordner (lease.datev_ziel), Inhalt ein ZIP ≤ DATEV_ZIP_MAX mit genau der SHA-256 aus exava_datei_lesen (lease.anhaenge, von EXAVA),
 *  Titel <name>__#<erste 8 Zeichen der SHA-256>.zip (G13 – der Hook rechnet selbst). */
export function datevEinsetzen(ti, env = process.env) {
  let l; try { l = JSON.parse(readFileSync(leasePfad(env), "utf8")); } catch { l = null; }
  const d = l?.art === "ablage" && leaseLesen(env) ? datevAus(l.datev) : null;
  if (!d) return nein("DATEV-Paket nur im Ablage-Auftrag mit job.bezug.datev_paket (Lease aus arbeit_holen).");
  if (Object.keys(ti).some((k) => !["title", "parentId", "contentMimeType", "base64Content", "disableConversionToGoogleType"].includes(k)) || ti.base64Content !== `@arbeit/${d.name}.zip` || ti.contentMimeType !== "application/zip"
    || ti.disableConversionToGoogleType !== true || typeof l.datev_ziel !== "string" || ti.parentId !== l.datev_ziel) return nein("DATEV-Paket nur mit base64Content \"@arbeit/<name>.zip\" und contentMimeType application/zip in den Monatsordner (per get_file_permissions und get_file_metadata bestätigt).");
  let buf; try { if (![join(projekt(env), "arbeit"), join(projekt(env), "arbeit", `${d.name}.zip`)].some((x) => lstatSync(x).isSymbolicLink())) buf = readFileSync(join(projekt(env), "arbeit", `${d.name}.zip`)); } catch { /* fehlt */ }
  if (!buf || buf.length > DATEV_ZIP_MAX || !buf.subarray(0, 4).equals(Buffer.from("PK\x03\x04", "latin1"))) return nein("ZIP unter arbeit/ fehlt, ist ein Verweis, kein ZIP oder größer als 7 MB (Grenze des Drive-Connectors – das Paket bleibt Download in EXAVA).");
  const sha = createHash("sha256").update(buf).digest("hex");
  if (!(Array.isArray(l.anhaenge) ? l.anhaenge : []).some((x) => x?.sha256 === sha)) return nein("SHA-256 der Datei gehört zu keinem Paket aus exava_datei_lesen in diesem Auftrag.");
  if (ti.title !== `${d.name}__#${sha.slice(0, 8)}.zip`) return nein("Titel muss <name>__#<erste 8 Zeichen der SHA-256>.zip sein (G13).");
  return { code: 0, stdout: JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", permissionDecisionReason: "A-818 DATEV-Paket aus arbeit/", updatedInput: { ...ti, base64Content: buf.toString("base64") } } }) };
}
export function anhangEinsetzen(ti, env = process.env) {
  if (/\.zip$/i.test(String(ti?.base64Content ?? ""))) return datevEinsetzen(ti, env); // A-818 (G5)
  let l; try { l = JSON.parse(readFileSync(leasePfad(env), "utf8")); } catch { l = null; }
  if (!l || l.art !== "ablage" || !leaseLesen(env)) return nein("Upload nur im Auftrag ablage (Lease aus arbeit_holen).");
  const m = ANHANG_PLATZHALTER.exec(String(ti?.base64Content ?? ""));
  if (!m || Object.keys(ti).some((k) => !["title", "parentId", "contentMimeType", "base64Content", "disableConversionToGoogleType"].includes(k)) || ti.contentMimeType !== ANHANG_MIME[m[2]]
    || ti.disableConversionToGoogleType !== true || typeof l.archiv !== "string" || ti.parentId !== l.archiv) return nein("Upload nur mit base64Content \"@arbeit/<datei>.<pdf|docx|xlsx|…>\" und passendem contentMimeType nach 00-EXAVA/Archiv (per get_file_permissions und get_file_metadata bestätigt).");
  let buf; try { if (![join(projekt(env), "arbeit"), join(projekt(env), m[1])].some((x) => lstatSync(x).isSymbolicLink())) buf = readFileSync(join(projekt(env), m[1])); } catch { /* fehlt */ }
  if (!buf || buf.length > ORIGINAL_MAX || !anhangPasst(buf, m[2])) return nein("Datei unter arbeit/ fehlt, ist ein Verweis, passt nicht zur Endung (Magic Bytes) oder ist größer als 20 MiB.");
  const h8 = new RegExp(`__#([0-9a-f]{8})\\.${m[2]}$`).exec(String(ti.title ?? ""))?.[1];
  if (h8 !== createHash("sha256").update(buf).digest("hex").slice(0, 8)) return nein("__#hash8 im Titel passt nicht zur SHA-256 der Datei (G13).");
  return { code: 0, stdout: JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", permissionDecisionReason: "A-615 Anhang aus arbeit/", updatedInput: { ...ti, base64Content: buf.toString("base64") } } }) };
}
/** A-638 (Go Bauherr 21.10.2026): copy_file im Auftrag ablage für einen Mail-Anhang, den create_file zu groß ablehnt. Quelle nur eine eigene Drive-Datei (lease.ordner, get_file_permissions)
 *  mit Namen …__#<hash8>.pdf (lease.kopierbar); hash8 = Anfang der SHA-256 eines Anhangs aus exava_datei_lesen (lease.anhaenge), Größe gleich, wo beide sie nennen; Titel endet auf denselben
 *  __#hash8 (G13: gleicher Hash = dieselbe Datei). Felder, Namensschema und Ziel lease.archiv prüft hintergrund-policy.mjs. */
export function kopieBinden(ti, env = process.env) {
  let l; try { l = JSON.parse(readFileSync(leasePfad(env), "utf8")); } catch { l = null; }
  if (!l || l.art !== "ablage" || !leaseLesen(env)) return nein("Kopie nur im Auftrag ablage (Lease aus arbeit_holen).");
  const h8 = /__#([0-9a-f]{8})\.pdf$/.exec(String(ti?.title ?? ti?.name ?? ""))?.[1];
  const q = (Array.isArray(l.kopierbar) ? l.kopierbar : []).find((x) => x?.id === ti?.fileId);
  if (!h8 || q?.h8 !== h8 || !Array.isArray(l.ordner) || !l.ordner.includes(ti.fileId)) return nein("Kopie nur von einer eigenen Drive-Datei (get_file_permissions), deren Name auf denselben __#hash8 endet (search_files oder get_file_metadata mit excludeContentSnippets: true).");
  const a = (Array.isArray(l.anhaenge) ? l.anhaenge : []).find((x) => typeof x?.sha256 === "string" && x.sha256.startsWith(h8));
  return a && (q.groesse === undefined || a.groesse === undefined || q.groesse === a.groesse) ? { code: 0 } : nein("__#hash8 gehört zu keinem Anhang aus exava_datei_lesen in diesem Auftrag, oder die Größe weicht ab (G13).");
}
/** A-638: Drive search_files/get_file_metadata im Auftrag ablage ohne Textauszüge (excludeContentSnippets: true) – PDFs mit Namen …__#<hash8>.pdf → lease.kopierbar { id, h8, groesse? }
 *  (höchstens 50); nur aus der Antwort des Connectors (alleObjekte, nie aus Dateiinhalten). */
function kopierbarMerken(eingabe, env) {
  let l; try { l = JSON.parse(readFileSync(leasePfad(env), "utf8")); } catch { return; }
  if (!l || l.art !== "ablage" || !leaseLesen(env) || eingabe.tool_input?.excludeContentSnippets !== true) return;
  const objekte = alleObjekte(eingabe.tool_response);
  if (objekte.some((x) => x.isError === true || x.is_error === true)) return;
  const liste = Array.isArray(l.kopierbar) ? l.kopierbar.filter((x) => x && typeof x.id === "string" && /^[0-9a-f]{8}$/.test(String(x.h8))) : [], vorher = liste.length;
  for (const o of objekte) {
    const h8 = /__#([0-9a-f]{8})\.pdf$/i.exec(String(o.name ?? o.title ?? ""))?.[1]?.toLowerCase(), g = Number(o.size ?? o.fileSize);
    if (h8 && typeof o.id === "string" && /^[A-Za-z0-9_-]{6,200}$/.test(o.id) && (o.mimeType === undefined || o.mimeType === "application/pdf") && !liste.some((x) => x.id === o.id) && liste.length < 50)
      liste.push({ id: o.id, h8, ...(Number.isSafeInteger(g) && g > 0 ? { groesse: g } : {}) });
  }
  if (liste.length > vorher) writeFileSync(leasePfad(env), JSON.stringify({ ...l, kopierbar: liste }));
}
/** A-638: exava_datei_lesen im Auftrag ablage – sha256 und size_bytes der gelieferten Anhänge (von EXAVA, nie vom Modell) → lease.anhaenge (höchstens 50). */
function anhangMerken(eingabe, env) {
  let l; try { l = JSON.parse(readFileSync(leasePfad(env), "utf8")); } catch { return; }
  if (!l || l.art !== "ablage" || !leaseLesen(env) || alleObjekte(eingabe.tool_response).some((x) => x.isError === true || x.is_error === true)) return;
  const liste = Array.isArray(l.anhaenge) ? l.anhaenge.filter((x) => x && /^[0-9a-f]{64}$/.test(String(x.sha256))) : [], vorher = liste.length;
  for (const o of antwortObjekte(eingabe.tool_response)) {
    const sha256 = String(o.sha256 ?? "").toLowerCase();
    if (/^[0-9a-f]{64}$/.test(sha256) && typeof o.download_url === "string" && !liste.some((x) => x.sha256 === sha256) && liste.length < 50) liste.push({ sha256, ...(Number.isSafeInteger(o.size_bytes) ? { groesse: o.size_bytes } : {}) });
  }
  if (liste.length > vorher) writeFileSync(leasePfad(env), JSON.stringify({ ...l, anhaenge: liste }));
}
/** A-615: Drive get_file_metadata im Auftrag ablage – ein bestätigter eigener Ordner (lease.ordner) namens „Archiv“ wird lease.archiv; sonst nichts (fail closed). */
function archivMerken(eingabe, env) {
  let l; try { l = JSON.parse(readFileSync(leasePfad(env), "utf8")); } catch { return; }
  const id = eingabe.tool_input?.fileId;
  if (!l || l.art !== "ablage" || !leaseLesen(env) || !Array.isArray(l.ordner) || !l.ordner.includes(id)) return;
  const o = alleObjekte(eingabe.tool_response);
  if (o.some((x) => x.isError === true || x.is_error === true)) return;
  const ordner = (name) => o.some((x) => x.id === id && (x.name ?? x.title) === name && x.mimeType === "application/vnd.google-apps.folder"), d = datevAus(l.datev);
  if (ordner("Archiv")) writeFileSync(leasePfad(env), JSON.stringify({ ...l, archiv: id }));
  else if (d && ordner(d.ordner[2])) writeFileSync(leasePfad(env), JSON.stringify({ ...l, datev_ziel: id })); // A-818 (G5): bestätigter eigener Monatsordner des DATEV-Pakets
}
/** A-534 (G7): Postfächer des Kunden aus job.bezug.verbindungen (von EXAVA, nie vom Modell) – kleingeschrieben, nur mit @, höchstens 20. */
const adressen = (job) => (Array.isArray(job?.bezug?.verbindungen) ? job.bezug.verbindungen : []).map((v) => v?.adresse).filter((a) => typeof a === "string" && a.includes("@")).map((a) => a.toLowerCase()).slice(0, 20);
/** Alle Objekte einer Antwort, rekursiv. JSON in Texten nur aus der MCP-Hülle (text/content/result/structuredContent), nie aus Datenfeldern
 *  wie Datei- oder Anzeigenamen – sonst bestätigt ein eingeschleustes {"role":"owner",…} einen fremden Ordner (A-531 HOOK-AUDIT F1). */
function alleObjekte(r, out = [], tiefe = 0, json = true) {
  if (tiefe > 12 || out.length > 5000) return out;
  if (typeof r === "string") { if (json) try { alleObjekte(JSON.parse(r), out, tiefe + 1); } catch { /* kein JSON */ } }
  else if (Array.isArray(r)) for (const x of r) alleObjekte(x, out, tiefe + 1, json);
  else if (r && typeof r === "object") { out.push(r); for (const [k, x] of Object.entries(r)) alleObjekte(x, out, tiefe + 1, ["text", "content", "result", "structuredContent"].includes(k)); }
  return out;
}
/** A-531 COMPLIANCE H2: Host der von EXAVA ausgegebenen Upload-URL (https, ohne Port) in lease.upload_hosts, nur bei gültiger Lease; die Policy lässt curl PUT nur dorthin (höchstens 5). */
function uploadHostMerken(eingabe, env) {
  let l; try { l = JSON.parse(readFileSync(leasePfad(env), "utf8")); } catch { return; }
  if (!l || !leaseLesen(env) || alleObjekte(eingabe.tool_response).some((x) => x.isError === true || x.is_error === true)) return;
  const hosts = Array.isArray(l.upload_hosts) ? l.upload_hosts.filter((x) => typeof x === "string") : [];
  for (const o of antwortObjekte(eingabe.tool_response)) {
    const url = o.upload_url ?? o.download_url; let u; try { u = new URL(String(url)); } catch { continue; } // A-600 FOLGE: download_url aus exava_datei_lesen
    if (typeof url === "string" && u.protocol === "https:" && /^[a-z0-9.-]{1,253}$/.test(u.host) && !hosts.includes(u.host) && hosts.length < 5) hosts.push(u.host);
  }
  writeFileSync(leasePfad(env), JSON.stringify({ ...l, upload_hosts: hosts }));
}
/** A-626 WEB: wortgleich in hintergrund-policy.mjs (scripts/test/a529-vorlage.ts prüft die Gleichheit). */
export function webAdresse(x) {
  let u; try { u = new URL(String(x ?? "")); } catch { return null; }
  if (u.protocol === "http:") u.protocol = "https:";
  u.hash = "";
  return u.protocol === "https:" && !u.username && !u.password && !u.port && /^(?=[a-z0-9.-]*[a-z])[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(u.hostname)
    && !/\.(internal|local|localhost|lan|home|arpa|corp|intranet)$/.test(u.hostname) && u.href.length <= 2000 ? u.href : null;
}
export const WEB_MAX = 3000;
/** A-782: wortgleich in hintergrund-policy.mjs (scripts/test/a782-entschlackung.ts prüft die Gleichheit). */
export const WEB_ARTEN = new Set(["arbeit", "ablage", "mail_vorbereitung", "antwort"]);
/** A-626 WEB: Web-Adressen im Auftragstext – nur vor dem angehängten Gesprächsverlauf (auftragMitVerlauf, lib/antwort/recherche-auftrag.ts), Satzzeichen am Ende ab, höchstens 50. */
export const textAdressen = (t) => [...String(t ?? "").split("\n\n[Bisheriger Gesprächsverlauf")[0].matchAll(/https?:\/\/[^\s<>"'()[\]{}]+/gi)]
  .map((m) => webAdresse(m[0].replace(/[.,;:!?]+$/, ""))).filter(Boolean).slice(0, 50);
/** A-626 WEB: Treffer-Adressen einer WebSearch-Antwort – nur url von Objekten mit title, nie der Suchtext (query). */
export function trefferAdressen(r, tiefe = 0, out = []) {
  if (typeof r === "string") { if (tiefe === 0) try { trefferAdressen(JSON.parse(r), 1, out); } catch { /* kein JSON */ } return out; }
  if (tiefe > 8 || out.length >= 500) return out;
  if (Array.isArray(r)) for (const x of r) trefferAdressen(x, tiefe + 1, out);
  else if (r && typeof r === "object") { if (typeof r.url === "string" && typeof r.title === "string") out.push(r.url); for (const [k, x] of Object.entries(r)) if (k !== "query") trefferAdressen(x, tiefe + 1, out); }
  return out;
}
/** A-626 WEB: Adressen in lease.web aufnehmen – nur mit gültiger Lease eines Auftrags aus WEB_ARTEN, nur webAdresse, höchstens WEB_MAX. */
function webMerken(env, adressen) {
  let l; try { l = JSON.parse(readFileSync(leasePfad(env), "utf8")); } catch { return; }
  if (!l || !WEB_ARTEN.has(l.art) || !leaseLesen(env)) return;
  const web = new Set(Array.isArray(l.web) ? l.web.filter((x) => typeof x === "string") : []), vorher = web.size;
  for (const a of adressen) { const h = webAdresse(a); if (h && web.size < WEB_MAX) web.add(h); }
  if (web.size > vorher) writeFileSync(leasePfad(env), JSON.stringify({ ...l, web: [...web] }));
}
/** A-626 WEB: nach WebFetch einer erlaubten Adresse lädt der Hook dieselbe Seite selbst (GET ohne Daten) und merkt Zieladresse und Links (href, ≤ 2.000) – Links kommen so von der Seite,
 *  nie aus der Zusammenfassung des Modells. Kein HTML: nur die Zieladresse. Fehler → nichts. */
async function seiteMerken(eingabe, env, f) {
  let l; try { l = JSON.parse(readFileSync(leasePfad(env), "utf8")); } catch { return; }
  const url = webAdresse(eingabe.tool_input?.url);
  if (!l || !WEB_ARTEN.has(l.art) || !leaseLesen(env) || !url || !Array.isArray(l.web) || !l.web.includes(url)) return;
  try {
    const r = await f(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; exava-hintergrund)" }, signal: AbortSignal.timeout(FRIST_MS - 3000) });
    const ziel = webAdresse(r.url || url);
    if (!ziel || !r.ok || !/html/i.test(r.headers.get("content-type") ?? "") || Number(r.headers.get("content-length") ?? 0) > 4 << 20) return webMerken(env, ziel ? [ziel] : []);
    const html = (await r.text()).slice(0, 4 << 20);
    webMerken(env, [ziel, ...[...html.matchAll(/\bhref\s*=\s*["']?([^"'\s>]+)/gi)].slice(0, 2000).map((m) => { try { return new URL(m[1].replace(/&amp;/g, "&"), ziel).href; } catch { return null; } })]);
  } catch { /* nicht ladbar: nichts merken */ }
}
/** A-608 BELEG-ORIGINAL: Endung je Typ, erkannt an den ersten Bytes (nie am Namen oder mimeType der Antwort); Grenze wie beleg_original (20 MiB, lib/x/belegbild.ts). */
export const ORIGINAL_MAX = 20 * 1024 * 1024;
export function originalEndung(buf) {
  return buf.subarray(0, 5).toString("latin1") === "%PDF-" ? "pdf" : buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff ? "jpg"
    : buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? "png" : ["II*\0", "MM\0*"].includes(buf.subarray(0, 4).toString("latin1")) ? "tif" : null;
}
/** A-608 BELEG-ORIGINAL: PDF-/Bild-Anhänge einer Roh-Mail (Gmail get_message RAW): MIME-Teile mit base64, verschachtelt höchstens 5 Ebenen, höchstens 50 Teile; Typ nur nach Magic Bytes. Rein, exportiert für den Test. */
export function mimeAnhaenge(roh, tiefe = 0, out = []) {
  const t = String(roh), k = /\r?\n\r?\n/.exec(t); if (!k || tiefe > 5 || out.length >= 50) return out;
  const kopf = t.slice(0, k.index).replace(/\r?\n[ \t]+/g, " "), rumpf = t.slice(k.index + k[0].length);
  const feld = (n) => new RegExp(`^${n}:\\s*(.*)$`, "im").exec(kopf)?.[1] ?? "";
  const grenze = /^multipart\//i.test(feld("content-type")) ? /boundary="?([^";]+)"?/i.exec(feld("content-type"))?.[1] : null;
  if (grenze) { for (const teil of rumpf.split(`--${grenze}`).slice(1, 51)) if (!teil.startsWith("--")) mimeAnhaenge(teil.replace(/^\r?\n/, ""), tiefe + 1, out); return out; }
  if (!/^base64$/i.test(feld("content-transfer-encoding").trim())) return out;
  const buf = Buffer.from(rumpf.replace(/[^A-Za-z0-9+/=]/g, ""), "base64");
  if (originalEndung(buf) && buf.length <= ORIGINAL_MAX) out.push(buf);
  return out;
}
/** A-642: Ein MCP-Ergebnis über MAX_MCP_OUTPUT_TOKENS (schon eine PDF ab ~70 KB) speichert Claude Code vollständig unter <Projektordner>/<session_id>/tool-results/ und meldet nur
 *  „Output has been saved to <pfad>“. Gelesen wird genau diese Datei: nur in diesem Ordner, reguläre Datei ohne Verweis, ≤ Grenze, `id` der Antwort = angefragte ID; sonst []. */
export function gespeicherteAusgabe(eingabe, id) {
  const m = /Output has been saved to (\/[^\s"\\]+\.txt)/.exec(JSON.stringify(eingabe?.tool_response ?? ""));
  const tp = eingabe?.transcript_path, sid = eingabe?.session_id;
  if (!m || typeof tp !== "string" || typeof sid !== "string" || !/^[A-Za-z0-9_-]{8,80}$/.test(sid)) return [];
  if (dirname(m[1]) !== join(dirname(tp), sid, "tool-results") || !/^mcp-[A-Za-z0-9_.-]{1,200}\.txt$/.test(basename(m[1]))) return [];
  try {
    const st = lstatSync(m[1]);
    if (!st.isFile() || st.nlink > 1 || st.size > ORIGINAL_MAX * 1.4 + 65536) return [];
    const o = alleObjekte(readFileSync(m[1], "utf8"));
    return o.length && (typeof o[0].id !== "string" || o[0].id === id) ? o : [];
  } catch { return []; }
}
/** A-608 BELEG-ORIGINAL: im Auftrag belegsuche Drive download_file_content (base64) bzw. Gmail get_message RAW (Anhänge) → Datei unter arbeit/ und SHA-256 in lease.originale
 *  (höchstens 10); A-659: im Auftrag ablage nur die Drive-Datei unter arbeit/ (Prüfsumme per sha256sum, wenn Drive keine sha256Checksum liefert – nie ein Original); sonst nichts (fail closed). */
function originalMerken(eingabe, env, quelle) {
  let l; try { l = JSON.parse(readFileSync(leasePfad(env), "utf8")); } catch { return; }
  const id = quelle === "drive" ? eingabe.tool_input?.fileId : eingabe.tool_input?.messageId;
  const nurDatei = l?.art === "ablage" && quelle === "drive"; // A-659: Ablage braucht nur die Bytes für die Prüfsumme
  if (!l || (l.art !== "belegsuche" && !nurDatei) || !leaseLesen(env) || typeof id !== "string" || !/^[A-Za-z0-9_-]{6,120}$/.test(id)) return;
  const objekte = alleObjekte(eingabe.tool_response);
  if (objekte.some((x) => x.isError === true || x.is_error === true)) return;
  const felder = quelle === "drive" ? ["blob", "data", "base64Content", "content", "contentBase64"] : ["raw"];
  const finden = (liste) => liste.flatMap((x) => felder.map((k) => x[k])).find((v) => typeof v === "string" && v.length >= 16 && v.length <= ORIGINAL_MAX * 1.4 && /^[A-Za-z0-9+/_-]+={0,2}$/.test(v));
  const b64 = finden(objekte) ?? finden(gespeicherteAusgabe(eingabe, id)); // A-642: über MAX_MCP_OUTPUT_TOKENS steht nur der Pfad in der Antwort
  if (!b64) return;
  const bufs = quelle === "drive" ? [Buffer.from(b64, "base64")] : mimeAnhaenge(Buffer.from(b64, "base64").toString("latin1"));
  if (quelle === "gmail" && !bufs.length) return rohmailMerken(l, id, Buffer.from(b64, "base64"), env); // A-657 GO pdf.py: Belegmail nur als HTML
  let originale = Array.isArray(l.originale) ? l.originale.filter((x) => x && typeof x.sha256 === "string" && typeof x.datei === "string") : [];
  const vorher = originale.length;
  bufs.forEach((buf, n) => {
    const endung = originalEndung(buf);
    if (!endung || buf.length > ORIGINAL_MAX || originale.length >= 10) return;
    const datei = quelle === "drive" ? `arbeit/drive-${id}.${endung}` : `arbeit/gmail-${id}-${n + 1}.${endung}`, sha256 = createHash("sha256").update(buf).digest("hex");
    mkdirSync(join(projekt(env), "arbeit"), { recursive: true });
    if ([join(projekt(env), "arbeit"), join(projekt(env), datei)].some((x) => { try { return lstatSync(x).isSymbolicLink(); } catch { return false; } })) return; // nie über einen Verweis schreiben
    writeFileSync(join(projekt(env), datei), buf);
    if (!nurDatei && !originale.some((x) => x.sha256 === sha256 && x.datei === datei)) originale = [...originale, { datei, sha256 }];
  });
  if (originale.length > vorher) writeFileSync(leasePfad(env), JSON.stringify({ ...l, originale }));
}
/** A-657 GO pdf.py: Mail ohne PDF-/Bild-Anhang → Rohmail (≤ 2 MiB, Grenze von pdf.py) nach arbeit/gmail-<messageId>.eml, SHA-256 in lease.rohmails (höchstens 10) – nur sie darf pdf.py --mail lesen. */
function rohmailMerken(l, id, buf, env) {
  const datei = `arbeit/gmail-${id}.eml`, rohmails = Array.isArray(l.rohmails) ? l.rohmails.filter((x) => x && typeof x.datei === "string" && typeof x.sha256 === "string") : [];
  if (!buf.length || buf.length > 2 << 20 || rohmails.length >= 10) return;
  mkdirSync(join(projekt(env), "arbeit"), { recursive: true });
  if ([join(projekt(env), "arbeit"), join(projekt(env), datei)].some((x) => { try { return lstatSync(x).isSymbolicLink(); } catch { return false; } })) return; // nie über einen Verweis schreiben
  writeFileSync(join(projekt(env), datei), buf);
  const sha256 = createHash("sha256").update(buf).digest("hex");
  writeFileSync(leasePfad(env), JSON.stringify({ ...l, rohmails: [...rohmails.filter((x) => x.datei !== datei), { datei, sha256 }] }));
}
/** A-657 GO pdf.py (PostToolUse Bash): nach pdf.py --mail einer gemerkten Rohmail (Prüfsumme erneut gerechnet) wird die erzeugte PDF ein Original in lease.originale – nur wenn pdf.py
 *  genau diese Datei meldet, sie eine reguläre Datei mit %PDF- ist (≤ 20 MiB). Eine selbst geschriebene PDF gibt es im Auftrag belegsuche nicht (Write gesperrt). */
export const MAIL_PDF = /^\/usr\/bin\/python3 -I \.claude\/tools\/pdf\.py --mail (arbeit\/gmail-([A-Za-z0-9_-]{6,120})\.eml) (arbeit\/gmail-\2-mail\.pdf)$/;
function mailPdfMerken(eingabe, env) {
  let l; try { l = JSON.parse(readFileSync(leasePfad(env), "utf8")); } catch { return; }
  const m = MAIL_PDF.exec(String(eingabe.tool_input?.command ?? ""));
  if (!m || !l || l.art !== "belegsuche" || !leaseLesen(env)) return;
  const lies = (d) => { try { const p = join(projekt(env), d), st = lstatSync(p); return st.isFile() && st.nlink === 1 && st.size <= ORIGINAL_MAX ? readFileSync(p) : null; } catch { return null; } };
  const sha = (b) => createHash("sha256").update(b).digest("hex"), eml = lies(m[1]), pdf = lies(m[3]);
  let gemeldet = null; try { gemeldet = JSON.parse(String(eingabe.tool_response?.stdout ?? "").trim())?.datei; } catch { /* kein JSON */ }
  if (!eml || !pdf || gemeldet !== m[3] || originalEndung(pdf) !== "pdf" || !(Array.isArray(l.rohmails) && l.rohmails.some((x) => x?.datei === m[1] && x.sha256 === sha(eml)))) return;
  const originale = Array.isArray(l.originale) ? l.originale.filter((x) => x && typeof x.sha256 === "string" && typeof x.datei === "string" && x.datei !== m[3]) : [];
  if (originale.length < 10) writeFileSync(leasePfad(env), JSON.stringify({ ...l, originale: [...originale, { datei: m[3], sha256: sha(pdf) }] }));
}
/** A-534 (G7): Ordner-ID aus get_file_permissions nur dann in lease.ordner, wenn ein verbundenes Postfach Eigentümer ist und die Lease-Art ablage lautet; sonst nichts (fail closed). */
function ordnerBestaetigen(eingabe, env) {
  let l; try { l = JSON.parse(readFileSync(leasePfad(env), "utf8")); } catch { return; }
  const id = eingabe.tool_input?.fileId;
  if (!l || l.art !== "ablage" || !leaseLesen(env) || !Array.isArray(l.adressen) || typeof id !== "string" || !/^[A-Za-z0-9_-]{6,200}$/.test(id)) return;
  if (alleObjekte(eingabe.tool_response).some((x) => x.isError === true || x.is_error === true)) return;
  const eigen = alleObjekte(eingabe.tool_response).some((x) => x.role === "owner" && typeof x.emailAddress === "string" && l.adressen.includes(x.emailAddress.toLowerCase()));
  const ordner = Array.isArray(l.ordner) ? l.ordner.filter((x) => typeof x === "string") : [];
  if (!eigen || ordner.includes(id) || ordner.length >= 20) return;
  writeFileSync(leasePfad(env), JSON.stringify({ ...l, ordner: [...ordner, id] }));
}

/** B10-HINTERGRUND: Thread-Stand aus der echten Antwort von Gmail get_thread (wie quellenbeobachtung.mjs, A-516 P4a): thread_id, alle Message-IDs, letzte; jede Abweichung → nicht lesbar. */
export function threadBeobachtung(r) {
  const leer = { lesbar: false }, id = (x, ...n) => { const w = n.map((k) => x?.[k]).find((v) => v != null); return typeof w === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(w) ? w : null; };
  if (alleObjekte(r).some((x) => x.isError === true || x.is_error === true)) return leer;
  const o = antwortObjekte(r).find((x) => Array.isArray(x.messages)), tid = id(o, "id", "threadId", "thread_id");
  if (!tid || !o.messages.length || o.messages.length > 500) return leer;
  const ids = [];
  for (const m of o.messages) { const mid = id(m, "id", "messageId", "message_id"), mt = m?.threadId ?? m?.thread_id; if (!mid || (mt !== undefined && mt !== tid)) return leer; ids.push(mid); }
  return new Set(ids).size === ids.length ? { lesbar: true, thread_id: tid, message_ids: ids, letzte_message_id: ids[ids.length - 1] } : leer;
}
/** B10-HINTERGRUND: im Versandauftrag (Lease-Art versand) den gelesenen Thread-Stand über den Lease-Weg von /api/x/quellen-beobachtung melden (nur IDs + sha256, keine Inhalte).
 *  Fehlt die Meldung, sperrt EXAVA den Versand einer Antwort (thread_nicht_beobachtet). */
async function threadMelden(eingabe, env, f) {
  let art; try { art = JSON.parse(readFileSync(leasePfad(env), "utf8"))?.art; } catch { return; }
  const lease = leaseLesen(env), toolUseId = String(eingabe.tool_use_id ?? ""), b = threadBeobachtung(eingabe.tool_response);
  if (art !== "versand" || !lease || !/^[^\s]{1,300}$/.test(toolUseId) || !b.lesbar) return;
  const roh = typeof eingabe.tool_response === "string" ? eingabe.tool_response : JSON.stringify(eingabe.tool_response ?? null);
  try { await senden("/api/x/quellen-beobachtung", { lease, tool_use_id: toolUseId, werkzeug: "get_thread", ...b, antwort_sha256: createHash("sha256").update(roh).digest("hex"), beobachtet_am: new Date().toISOString() }, f); }
  catch { /* Meldung fehlgeschlagen: der Versand wird mit thread_nicht_beobachtet gesperrt (fail closed) */ }
}

/** PostToolUse: Lease aus arbeit_holen ablegen bzw. einen ausgeführten gesteuerten Aufruf melden. Immer Exit 0 (nach dem Aufruf lässt sich nichts mehr sperren). */
export async function nachher(eingabe, { env = process.env, f = fetch } = {}) {
  if (eingabe?.tool_name === "WebSearch") { webMerken(env, trefferAdressen(eingabe.tool_response)); return { code: 0 }; } // A-626 WEB
  if (eingabe?.tool_name === "WebFetch") { await seiteMerken(eingabe, env, f); return { code: 0 }; } // A-626 WEB
  if (eingabe?.tool_name === "Bash") { mailPdfMerken(eingabe, env); return { code: 0 }; } // A-657 GO pdf.py
  const t = mcpTeile(eingabe?.tool_name);
  if (t && (t.server === EXAVA_SERVER || /^[0-9a-f]{8}_[0-9a-f]{4}_/.test(t.server)) && t.werkzeug === "arbeit_holen") {
    const o = antwortObjekte(eingabe.tool_response).find((x) => typeof x.lease_token === "string" && x.job && typeof x.lauf_id === "string");
    mkdirSync(join(projekt(env), ".exava"), { recursive: true });
    mkdirSync(join(projekt(env), "arbeit"), { recursive: true }); // A-632 FOLGE: curl -o legt keinen Ordner an – arbeit/ steht vor dem ersten Laden
    writeFileSync(leasePfad(env), JSON.stringify(o ? { job_id: o.job.id, lauf_id: o.lauf_id, lease_token: o.lease_token, ...(typeof o.silo === "string" ? { silo: o.silo } : {}), ...(typeof o.job.art === "string" ? { art: o.job.art } : {}), ...(o.job.art === "belegsuche" && o.job.bezug?.csv === true ? { csv: true } : {}), ...(o.job.art === "ablage" && datevAus(o.job.bezug?.datev_paket) ? { datev: datevAus(o.job.bezug.datev_paket) } : {}) /* A-818 */, adressen: adressen(o.job),
      ...(WEB_ARTEN.has(o.job.art) ? { web: [...new Set(textAdressen(o.job.eingabe))] } : {}) } : {})); // A-534: art und Postfächer für die Ausnahmen der Policy; A-626 WEB: Adressen aus dem Auftrag
    return { code: 0 };
  }
  if (t && (t.server === "google_drive" || /^[0-9a-f]{8}_[0-9a-f]{4}_/.test(t.server)) && t.werkzeug === "get_file_permissions") { ordnerBestaetigen(eingabe, env); return { code: 0 }; }
  if (t && (t.server === "google_drive" || /^[0-9a-f]{8}_[0-9a-f]{4}_/.test(t.server)) && t.werkzeug === "get_file_metadata") { archivMerken(eingabe, env); kopierbarMerken(eingabe, env); return { code: 0 }; } // A-615, A-638
  if (t && (t.server === "google_drive" || /^[0-9a-f]{8}_[0-9a-f]{4}_/.test(t.server)) && t.werkzeug === "search_files") { kopierbarMerken(eingabe, env); return { code: 0 }; } // A-638
  if (t && (t.server === "google_drive" || /^[0-9a-f]{8}_[0-9a-f]{4}_/.test(t.server)) && t.werkzeug === "download_file_content") { originalMerken(eingabe, env, "drive"); return { code: 0 }; } // A-608 BELEG-ORIGINAL
  if (t && (t.server === EXAVA_SERVER || /^[0-9a-f]{8}_[0-9a-f]{4}_/.test(t.server)) && (t.werkzeug === "prepare_file_upload" || t.werkzeug === "exava_datei_lesen")) { uploadHostMerken(eingabe, env); if (t.werkzeug === "exava_datei_lesen") anhangMerken(eingabe, env); return { code: 0 }; } // A-638: Anhang-Prüfsummen
  if (t && (t.server === "gmail" || /^[0-9a-f]{8}_[0-9a-f]{4}_/.test(t.server)) && t.werkzeug === "get_message" && eingabe.tool_input?.messageFormat === "RAW") { originalMerken(eingabe, env, "gmail"); return { code: 0 }; } // A-608 BELEG-ORIGINAL (Gmail-Anhang)
  if (t && t.server === "gmail" && t.werkzeug === "get_thread") { await threadMelden(eingabe, env, f); return { code: 0 }; }
  if (!gesteuert(t)) return { code: 0 };
  const toolUseId = String(eingabe.tool_use_id ?? ""); const pfad = vermerkPfad(env, toolUseId);
  let v; try { v = JSON.parse(readFileSync(pfad, "utf8")); } catch { return { code: 0 }; }
  const lease = leaseLesen(env); if (!lease) return { code: 0 };
  const antwort = antwortObjekte(eingabe.tool_response);
  const fehler = antwort.some((x) => x.isError === true || x.is_error === true || typeof x.error === "string");
  const msgId = t.server === "gmail" ? antwort.map((x) => x.id ?? x.messageId ?? x.message_id).find((x) => typeof x === "string" && /^[^\s]{1,300}$/.test(x)) : null;
  try {
    await senden("/api/x/versand-melden", { lease, werkzeug: eingabe.tool_name, ...(v.art ? { art: v.art } : {}), entwurf_id: v.entwurf_id, tool_use_id: toolUseId, ergebnis: fehler ? "fehler" : "ok",
      ...(msgId ? { gmail_message_id: msgId } : {}), ...(fehler ? { fehler: "Werkzeugfehler" } : {}) }, f);
  } catch { /* Meldung fehlgeschlagen: die Freigabe bleibt in_versand, der Wachhund setzt unklar */ }
  try { rmSync(pfad, { force: true }); } catch { /* temporärer Vermerk */ }
  return { code: 0 };
}

function hauptprogramm() {
  const modus = process.argv[2] === "post" ? "post" : "pre";
  const ende = (r) => { if (r.stderr) process.stderr.write(r.stderr); if (r.stdout && modus === "pre" && r.code === 0) return process.stdout.write(r.stdout, () => process.exit(0)); process.exit(modus === "post" ? 0 : r.code); }; // A-615: updatedInput
  const absturz = (x) => ende({ code: 2, stderr: `Gesperrt (EXAVA-Ausführung): Hook-Fehler (${String(x?.message ?? x).slice(0, 200)}).` });
  process.on("uncaughtException", absturz); process.on("unhandledRejection", absturz);
  setTimeout(() => ende({ code: 2, stderr: "Gesperrt (EXAVA-Ausführung): Prüfung dauerte zu lange." }), FRIST_MS);
  let roh = ""; process.stdin.setEncoding("utf8");
  process.stdin.on("data", (c) => { roh += c; if (roh.length > 4 << 20) absturz(new Error("Hook-Eingabe zu groß")); });
  process.stdin.on("error", absturz);
  process.stdin.on("end", () => { let e; try { e = JSON.parse(roh); } catch { return ende({ code: 2, stderr: "Gesperrt (EXAVA-Ausführung): Hook-Eingabe nicht lesbar." }); }
    (modus === "post" ? nachher(e) : vorher(e)).then(ende, absturz); });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) hauptprogramm();
