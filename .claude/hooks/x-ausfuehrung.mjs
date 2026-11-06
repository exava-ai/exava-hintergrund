#!/usr/bin/env node
// A-531 AUSFUEHRUNG PR 3: Hook der Hintergrundroutine für genau die freigabepflichtigen Aufrufe – Gmail send_message/reply und Schreibwerkzeuge jedes fremden Connectors (gesteuert(), MCP-1: z. B. Metricool, HubSpot, Notion, Slack, Shopify).
// Muster: docs/x2/spike/mandant-repo/_claude/hooks/x-freigabe.mjs + versand-melden.mjs (Altweg, unverändert). Unterschied: kein Connector-Token – der Hook weist sich mit der Lease des
// Auftrags aus (POST /api/x/freigabe-pruefen und /api/x/versand-melden ohne Authorization-Kopf, lib/x/connector/hook.ts, PR 1).
//   post (PostToolUse, jedes MCP-Werkzeug): arbeit_holen von „EXAVA Hintergrund“ → Lease des gelieferten Auftrags nach .exava/lease.json (Claude schreibt sie nie selbst; ohne Auftrag geleert;
//            A-901: mit lease_generation – hintergrund-policy.mjs setzt die Lease in ingest_document des Helfers x-scan ein).
//            Drive get_file_permissions im Auftrag ablage: Ordner mit einem verbundenen Postfach als Eigentümer → lease.ordner (A-534, G7: Ordner anlegen und hochladen nur in eigene Ordner);
//            A-924 AM ORT: nur Eigentümer-Rechte (nicht geteilt) → lease.ungeteilt; arbeit_holen mit job.bezug.umbenennen → lease.umbenennen (die Policy lässt nur diese Namen am Ort zu).
//            A-924 Erweiterung: ebenso im Drive-Fenster (Konto aus job.bezug.verbindungen); heartbeat_job → Namen mit file_id aus der Antwort (dokumente.namen) nach lease.umbenennen;
//            download_file_content im Drive-Fenster → nur die Datei unter arbeit/ (Prüfsumme der Erstaufnahme, Office/Bild als .bin); bestätigter Ordner „WhatsApp“ → lease.whatsapp,
//            Upload dorthin nur für ein Dokument aus job.bezug.whatsapp_ids (lease.whatsapp_ids), WhatsApp-Dokumente nie nach lease.archiv.
//            A-930 (Weg A): ausfuehrung_liste (Helfer x-drive-batch) → Umbenennungen der Seite nach lease.umbenennen, WhatsApp-Dokumente nach lease.whatsapp_ids (arbeit_holen kürzt den
//            Bezug des Ausführungsauftrags); Lease-Änderungen paralleler Aufrufe nacheinander (mitLeaseSperre) und atomar (leaseSchreiben), Fenster von 300 Dateien statt Abbruch.
//            Gmail get_thread im Versandauftrag: Thread-Stand (IDs, sha256) → /api/x/quellen-beobachtung mit Lease (B10-HINTERGRUND: Antwort nur, wenn der Thread unverändert ist).
//            prepare_file_upload von „EXAVA Hintergrund“: Host der upload_url → lease.upload_hosts (A-531 COMPLIANCE H2: die Policy lässt curl PUT nur dorthin).
//            A-600 FOLGE: ebenso exava_datei_lesen – Host der download_url → lease.upload_hosts (die Policy lässt curl -o nur von dort zu).
//            A-608 BELEG-ORIGINAL (E-1120 Regel 1): Drive download_file_content im Auftrag belegsuche → der Hook selbst schreibt das Original (PDF/JPEG/PNG/TIFF, ≤ 20 MiB, Magic Bytes)
//            nach arbeit/drive-<fileId>.<endung> und merkt die SHA-256 in lease.originale; die Policy lässt curl PUT im Auftrag belegsuche nur für eine gemerkte Prüfsumme zu.
//            Ebenso Gmail get_message mit messageFormat RAW: PDF-/Bild-Anhänge (MIME, base64) nach arbeit/gmail-<messageId>-<n>.<endung>.
//            A-657 GO pdf.py: ohne solchen Anhang die Rohmail nach arbeit/gmail-<messageId>.eml (lease.rohmails); Bash pdf.py --mail dazu → erzeugte PDF in lease.originale.
//            A-846 (E-1143): ebenso in den Entwurfsaufträgen SPIEGEL_ARTEN (Original für den Anhang eines Entwurfs, EXAVA-Storage) – prepare_file_upload purpose dokument_original
//            merkt URL und Prüfsumme in lease.spiegel; die Policy lässt curl PUT dorthin nur für genau dieses gemerkte Original zu.
//            A-657/A-658: arbeit_holen eines Belegsuche-Auftrags mit job.bezug.csv → lease.csv (die Policy lässt dann Write und Upload der CSV zu).
//            A-993b Schritt 6 (Auftrag belegsuche; A-996 auch postfach_hygiene, Schutzschild): mail_archivieren mit selbst_retten → lease.korb_frei (IDs mit Frist, von EXAVA); Gmail search_threads/get_thread/get_message →
//            Nachrichten mit Label TRASH und Datum ≤ KORB_TAGE Tage → lease.korb_gesehen; untrash_message einer freigegebenen ID → lease.korb_raus; danach INBOX entfernt → lease.korb_fertig.
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
//   A-818 (G5): arbeit_holen eines Ablage-Auftrags mit job.bezug.datev_paket → lease.datev (Name, drei Ordner); get_file_metadata des bestätigten eigenen Monatsordners → lease.datev_ziel;
//            create_file mit "@arbeit/<name>.zip" → Inhalt per updatedInput nur als ZIP ≤ 7 MB mit der SHA-256 aus exava_datei_lesen (lease.anhaenge), Titel <name>__#<hash8>.zip, Ziel lease.datev_ziel.
//   pre, Bash (A-531 DATEI): nur die curl-PUT-Form (hintergrund-policy.mjs hat sie geprüft) – EXAVA gibt die Upload-URL frei (art upload: Auftrag, Lauf, angemeldete Datei), sonst Exit 2.
//            A-623 FOLGE: Laden (curl -o nach arbeit/, Skills x-eingang und x-ablage) lässt er in genau dieser Form durch – Host und Pfad prüft die Policy (BASH_LADEN, Host aus der Lease).
// Host fest (A-305: ein Host für alle Kunden) – nie aus einer Datei, die Claude beschreiben kann. Das Silo aus der Lease ist nur Wegweiser (wie im Token).
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
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
/** A-930: Lease atomar schreiben (temporäre Datei + rename) – ein paralleler Leser sieht nie eine halbe Datei. */
const leaseSchreiben = (env, text) => { const t = `${leasePfad(env)}.${process.pid}.tmp`; writeFileSync(t, text); renameSync(t, leasePfad(env)); };
/** A-930: Lease-Änderungen paralleler Aufrufe (x-drive-batch: 20–25 je Turn) nacheinander – Sperrordner .exava/lease.sperre (mkdir ist atomar), höchstens etwa 5 s warten,
 *  eine verwaiste Sperre (älter als 10 s) wird übernommen; ohne .exava bzw. nach der Frist ohne Sperre (die Policy prüft weiter jede Datei einzeln). */
export function mitLeaseSperre(env, f) {
  const p = join(projekt(env), ".exava", "lease.sperre"), warte = new Int32Array(new SharedArrayBuffer(4));
  for (let i = 0; i < 500; i++) {
    try { mkdirSync(p); } catch (x) {
      if (x?.code !== "EEXIST") return f();
      try { if (Date.now() - lstatSync(p).mtimeMs > 10_000) rmSync(p, { recursive: true, force: true }); } catch { /* schon frei */ }
      Atomics.wait(warte, 0, 0, 10); continue;
    }
    try { return f(); } finally { try { rmSync(p, { recursive: true, force: true }); } catch { /* frei */ } }
  }
  return f();
}
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
// A-944: --max-time 120 wie MAXZEIT der Policy; ÜBERGANG bis 11.11.2026 auch ohne (dann das „?“ entfernen, AUFGABEN A-944)
export const CURL_URL = /^\/usr\/bin\/curl -q -sSf(?: --max-time 120)? -X PUT --data-binary @\S+ -H "content-type: [^"]+" "(https:\/\/[^"\s]+)"$/;
export const CURL_LADEN = /^\/usr\/bin\/curl -q -sSfL(?: --max-time 120)? -o arbeit\/[A-Za-z0-9._#-]{1,160} "https:\/\/[^"\s$`\\]+"$/; // A-623 FOLGE: Form wie BASH_LADEN der Policy, ohne Dollar, Backtick und Backslash
export async function vorher(eingabe, { env = process.env, f = fetch } = {}) {
  const d = mcpTeile(eingabe?.tool_name);
  if (d && (d.server === "google_drive" || /^[0-9a-f]{8}_[0-9a-f]{4}_/.test(d.server)) && d.werkzeug === "create_file" && eingabe.tool_input?.base64Content !== undefined) return anhangEinsetzen(eingabe.tool_input, env);
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
    || ti.disableConversionToGoogleType !== true || ![l.archiv, l.whatsapp].some((z) => typeof z === "string" && ti.parentId === z)) return nein("Upload nur mit base64Content \"@arbeit/<datei>.<pdf|docx|xlsx|…>\" und passendem contentMimeType nach 00-EXAVA/Archiv (per get_file_permissions und get_file_metadata bestätigt).");
  const wa = Array.isArray(l.whatsapp_ids) ? l.whatsapp_ids : [], dok = basename(m[1]).replace(/__#[0-9a-f]{8}\.[^.]+$|\.[^.]+$/, "").toLowerCase(); // A-924 Erweiterung
  if ((typeof l.whatsapp === "string" && ti.parentId === l.whatsapp) !== wa.includes(dok)) return nein("WhatsApp-Dokumente (job.bezug.whatsapp_ids, Datei arbeit/<dokument_id>.<endung>) nur nach 00-EXAVA/WhatsApp, alle anderen nur nach 00-EXAVA/Archiv.");
  let buf; try { if (![join(projekt(env), "arbeit"), join(projekt(env), m[1])].some((x) => lstatSync(x).isSymbolicLink())) buf = readFileSync(join(projekt(env), m[1])); } catch { /* fehlt */ }
  if (!buf || buf.length > ORIGINAL_MAX || !anhangPasst(buf, m[2])) return nein("Datei unter arbeit/ fehlt, ist ein Verweis, passt nicht zur Endung (Magic Bytes) oder ist größer als 20 MiB.");
  const h8 = new RegExp(`__#([0-9a-f]{8})\\.${m[2]}$`).exec(String(ti.title ?? ""))?.[1];
  if (h8 !== createHash("sha256").update(buf).digest("hex").slice(0, 8)) return nein("__#hash8 im Titel passt nicht zur SHA-256 der Datei (G13).");
  return { code: 0, stdout: JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", permissionDecisionReason: "A-615 Anhang aus arbeit/", updatedInput: { ...ti, base64Content: buf.toString("base64") } } }) };
}
/** A-818: exava_datei_lesen im Auftrag ablage – sha256 und size_bytes der gelieferten Dateien (von EXAVA, nie vom Modell) → lease.anhaenge (höchstens 50; Prüfsumme des DATEV-Pakets). */
function anhangMerken(eingabe, env) {
  let l; try { l = JSON.parse(readFileSync(leasePfad(env), "utf8")); } catch { return; }
  if (!l || l.art !== "ablage" || !leaseLesen(env) || alleObjekte(eingabe.tool_response).some((x) => x.isError === true || x.is_error === true)) return;
  const liste = Array.isArray(l.anhaenge) ? l.anhaenge.filter((x) => x && /^[0-9a-f]{64}$/.test(String(x.sha256))) : [], vorher = liste.length;
  for (const o of antwortObjekte(eingabe.tool_response)) {
    const sha256 = String(o.sha256 ?? "").toLowerCase();
    if (/^[0-9a-f]{64}$/.test(sha256) && typeof o.download_url === "string" && !liste.some((x) => x.sha256 === sha256) && liste.length < 50) liste.push({ sha256, ...(Number.isSafeInteger(o.size_bytes) ? { groesse: o.size_bytes } : {}) });
  }
  if (liste.length > vorher) leaseSchreiben(env, JSON.stringify({ ...l, anhaenge: liste }));
}
/** A-615: Drive get_file_metadata im Auftrag ablage – ein bestätigter eigener Ordner (lease.ordner) namens „Archiv“ wird lease.archiv; sonst nichts (fail closed). */
function archivMerken(eingabe, env) {
  let l; try { l = JSON.parse(readFileSync(leasePfad(env), "utf8")); } catch { return; }
  const id = eingabe.tool_input?.fileId;
  if (!l || l.art !== "ablage" || !leaseLesen(env) || !Array.isArray(l.ordner) || !l.ordner.includes(id)) return;
  const o = alleObjekte(eingabe.tool_response);
  if (o.some((x) => x.isError === true || x.is_error === true)) return;
  const ordner = (name) => o.some((x) => x.id === id && (x.name ?? x.title) === name && x.mimeType === "application/vnd.google-apps.folder"), d = datevAus(l.datev);
  if (ordner("Archiv")) leaseSchreiben(env, JSON.stringify({ ...l, archiv: id }));
  else if (ordner("WhatsApp")) leaseSchreiben(env, JSON.stringify({ ...l, whatsapp: id })); // A-924 Erweiterung: Ablageordner der WhatsApp-Dokumente
  else if (d && ordner(d.ordner[2])) leaseSchreiben(env, JSON.stringify({ ...l, datev_ziel: id })); // A-818 (G5): bestätigter eigener Monatsordner des DATEV-Pakets
}
/** A-930d: Drive create_file eines Ordners im Auftrag ablage – „Archiv“ bzw. „WhatsApp“, angelegt in einem bestätigten eigenen Elternordner (lease.ordner; nur das lässt die Policy zu), ist eigen:
 *  seine ID aus der Antwort → lease.ordner und lease.archiv bzw. lease.whatsapp (sonst bleibt jeder Upload bis get_file_permissions und get_file_metadata gesperrt); sonst nichts (fail closed). */
function ordnerAngelegt(eingabe, env) {
  let l; try { l = JSON.parse(readFileSync(leasePfad(env), "utf8")); } catch { return; }
  const ti = eingabe.tool_input ?? {}, name = ti.title ?? ti.name, eltern = ti.parentId ?? (Array.isArray(ti.parents) ? ti.parents[0] : undefined);
  if (!l || l.art !== "ablage" || !leaseLesen(env) || ti.mimeType !== "application/vnd.google-apps.folder" || !["Archiv", "WhatsApp"].includes(name) || !Array.isArray(l.ordner) || !l.ordner.includes(eltern)) return;
  const o = alleObjekte(eingabe.tool_response);
  if (o.some((x) => x.isError === true || x.is_error === true)) return;
  const neu = o.filter((x) => typeof x.id === "string" && /^[A-Za-z0-9_-]{6,200}$/.test(x.id) && (x.name ?? x.title) === name && (x.mimeType === undefined || x.mimeType === "application/vnd.google-apps.folder"));
  if (neu.length !== 1 || (!l.ordner.includes(neu[0].id) && l.ordner.length >= 20)) return;
  leaseSchreiben(env, JSON.stringify({ ...l, ordner: l.ordner.includes(neu[0].id) ? l.ordner : [...l.ordner, neu[0].id], ...(name === "Archiv" ? { archiv: neu[0].id } : { whatsapp: neu[0].id }) }));
}
/** A-924 AM ORT: geplante Umbenennungen aus job.bezug.umbenennen (von EXAVA, nie vom Modell) – { file_id, titel } mit Drive-ID und Name ≤ 220 Zeichen, höchstens 20. */
const umbenennenAus = (u) => (Array.isArray(u) ? u : []).filter((x) => x && typeof x.file_id === "string" && /^[A-Za-z0-9_-]{6,200}$/.test(x.file_id) && typeof x.titel === "string" && x.titel.length > 0 && x.titel.length <= 220)
  .slice(0, 300).map((x) => ({ file_id: x.file_id, titel: x.titel })); // A-924 Erweiterung: Nachlauf ≤ 100 je Auftrag plus Namen aus dem Drive-Fenster
/** A-924 Erweiterung: Aufträge, die Drive-Dateien am Ort umbenennen (wortgleich in hintergrund-policy.mjs). */
export const UMBENENNEN_ARTEN = new Set(["ablage", "sync_aktuell", "sync_historisch"]);
/** A-924 Erweiterung: heartbeat_job (Ablage, Drive-Fenster) – Namen mit file_id aus der Antwort von EXAVA (dokumente.namen) nach lease.umbenennen; eine neue Zuordnung derselben Datei ersetzt die alte. */
function namenMerken(eingabe, env) {
  let l; try { l = JSON.parse(readFileSync(leasePfad(env), "utf8")); } catch { return; }
  if (!l || !UMBENENNEN_ARTEN.has(l.art) || !leaseLesen(env) || alleObjekte(eingabe.tool_response).some((x) => x.isError === true || x.is_error === true)) return;
  const neu = antwortObjekte(eingabe.tool_response).flatMap((x) => (Array.isArray(x?.dokumente?.namen) ? x.dokumente.namen : [])).filter((x) => typeof x?.file_id === "string").map((x) => ({ file_id: x.file_id, titel: x.name }));
  const liste = umbenennenAus(neu);
  if (!liste.length) return;
  const alt = umbenennenAus(l.umbenennen).filter((x) => !liste.some((y) => y.file_id === x.file_id));
  leaseSchreiben(env, JSON.stringify({ ...l, umbenennen: [...alt, ...liste].slice(-300) }));
}
/** A-930 (Weg A): ausfuehrung_liste – Einträge der Seite (von EXAVA, nie vom Modell): Umbenennungen nach lease.umbenennen, WhatsApp-Dokumente nach lease.whatsapp_ids (je die letzten 300 bzw. 150). */
function ausfuehrungMerken(eingabe, env) {
  let l; try { l = JSON.parse(readFileSync(leasePfad(env), "utf8")); } catch { return; }
  if (!l || l.art !== "ablage" || !leaseLesen(env) || alleObjekte(eingabe.tool_response).some((x) => x.isError === true || x.is_error === true)) return;
  const eintraege = antwortObjekte(eingabe.tool_response).flatMap((x) => (Array.isArray(x?.eintraege) ? x.eintraege : []));
  const um = umbenennenAus(eintraege.filter((x) => x?.art === "umbenennen")), wa = eintraege.filter((x) => x?.art === "whatsapp" && typeof x.dokument_id === "string" && UUID.test(x.dokument_id)).map((x) => x.dokument_id.toLowerCase());
  if (!um.length && !wa.length) return;
  const alt = umbenennenAus(l.umbenennen).filter((x) => !um.some((y) => y.file_id === x.file_id)), waAlt = (Array.isArray(l.whatsapp_ids) ? l.whatsapp_ids : []).filter((x) => typeof x === "string" && !wa.includes(x));
  leaseSchreiben(env, JSON.stringify({ ...l, umbenennen: [...alt, ...um].slice(-300), whatsapp_ids: [...waAlt, ...wa].slice(-150) }));
}
/** A-993b Schritt 6: Papierkorb der letzten KORB_TAGE Tage, höchstens KORB_MAX Rettungen je Lauf – wortgleich lib/postfach/einreihen.ts KORB_TAGE, KORB_MAX in hintergrund-policy.mjs. */
export const KORB_TAGE = 14, KORB_MAX = 10;
const GMAIL_NR = /^[0-9a-f]{10,24}$/i;
const korbFehler = (eingabe) => alleObjekte(eingabe.tool_response).some((x) => x.isError === true || x.is_error === true);
/** A-993b Schritt 6: Lease des Auftrags belegsuche bzw. (A-996, Schutzschild) postfach_hygiene für die Felder korb_* – sonst null; wortgleich KORB_ARTEN in hintergrund-policy.mjs. */
const korbLease = (env) => { let l; try { l = JSON.parse(readFileSync(leasePfad(env), "utf8")); } catch { return null; } return l && (l.art === "belegsuche" || l.art === "postfach_hygiene") && leaseLesen(env) ? l : null; };
const korbIds = (l, k) => (Array.isArray(l?.[k]) ? l[k].filter((x) => typeof x === "string") : []);
/** A-993b Schritt 6: Freigabe von EXAVA (mail_archivieren ohne konto → selbst_retten { ids, bis }) für genau diesen Auftrag → lease.korb_frei; Frist höchstens 60 Minuten. */
function korbFreigabeMerken(eingabe, env) {
  const l = korbLease(env), lease = leaseLesen(env);
  if (!l || korbFehler(eingabe) || String(eingabe.tool_input?.job_id ?? "").toLowerCase() !== String(lease?.job_id ?? "").toLowerCase()) return;
  const s = antwortObjekte(eingabe.tool_response).map((x) => x?.selbst_retten).find((x) => x && Array.isArray(x.ids)), bis = Date.parse(String(s?.bis ?? ""));
  if (!s || !Number.isFinite(bis)) return;
  const neu = s.ids.filter((id) => typeof id === "string" && GMAIL_NR.test(id)).slice(0, KORB_MAX).map((id) => ({ id, bis: new Date(Math.min(bis, Date.now() + 3_600_000)).toISOString() }));
  if (!neu.length) return;
  const alt = (Array.isArray(l.korb_frei) ? l.korb_frei : []).filter((x) => x && typeof x.id === "string" && !neu.some((y) => y.id === x.id));
  leaseSchreiben(env, JSON.stringify({ ...l, korb_frei: [...alt, ...neu].slice(-2 * KORB_MAX) }));
}
/** Zeitpunkt einer Gmail-Nachricht (internalDate in ms oder date als Text); unlesbar → -Infinity (nie im Fenster). */
const korbZeit = (m) => { const d = m.internalDate ?? m.internal_date ?? m.date; const z = typeof d === "number" || /^\d{12,14}$/.test(String(d ?? "")) ? Number(d) : Date.parse(String(d ?? "")); return Number.isFinite(z) ? z : -Infinity; };
/** A-993b Schritt 6: Nachrichten einer Gmail-Antwort nur in ihren festen Formen – die Nachricht selbst (get_message), messages (get_thread), threads[].messages (search_threads);
 *  JSON nur aus der MCP-Hülle (antwortObjekte), nie aus Feldern der Mail wie Text, Vorschau oder Anhang – so schleust kein Mailinhalt eine „gesehene“ Nachricht ein. */
const korbNachrichten = (r) => antwortObjekte(r).flatMap((o) => [o, ...(Array.isArray(o.messages) ? o.messages : []), ...(Array.isArray(o.threads) ? o.threads.flatMap((t) => (Array.isArray(t?.messages) ? t.messages : [])) : [])])
  .filter((m) => m && typeof m === "object");
/** A-993b Schritt 6: Gmail-Antworten im Auftrag belegsuche bzw. postfach_hygiene – Nachrichten mit Label TRASH und Datum in den letzten KORB_TAGE Tagen → lease.korb_gesehen (höchstens 200). */
function korbGesehenMerken(eingabe, env) {
  const l = korbLease(env); if (!l || korbFehler(eingabe)) return;
  const jetzt = Date.now(), grenze = jetzt - KORB_TAGE * 86_400_000;
  const ids = korbNachrichten(eingabe.tool_response).filter((m) => typeof m.id === "string" && GMAIL_NR.test(m.id) && [m.labelIds, m.label_ids].some((x) => Array.isArray(x) && x.includes("TRASH"))
    && korbZeit(m) >= grenze && korbZeit(m) <= jetzt + 86_400_000).map((m) => m.id);
  if (!ids.length) return;
  const neu = [...new Set(ids)], alt = korbIds(l, "korb_gesehen").filter((x) => !neu.includes(x));
  leaseSchreiben(env, JSON.stringify({ ...l, korb_gesehen: [...alt, ...neu].slice(-200) }));
}
/** A-993b Schritt 6: ausgeführte Rettungsschritte – untrash_message einer freigegebenen ID → lease.korb_raus; danach INBOX entfernt (unlabel_message bzw. update_message_labels mit
 *  genau INBOX) für eine zurückgeholte ID → lease.korb_fertig (nur dafür lässt die Policy gerettet: true an EXAVA zu). Fehlerantwort → nichts. */
function korbSchrittMerken(eingabe, env, werkzeug) {
  const l = korbLease(env), id = eingabe.tool_input?.messageId; if (!l || typeof id !== "string" || korbFehler(eingabe)) return;
  const inbox = (x) => Array.isArray(x) && x.length === 1 && x[0] === "INBOX", raus = korbIds(l, "korb_raus"), fertig = korbIds(l, "korb_fertig");
  if (werkzeug === "untrash_message") { if (raus.includes(id) || !(Array.isArray(l.korb_frei) && l.korb_frei.some((x) => x?.id === id))) return; leaseSchreiben(env, JSON.stringify({ ...l, korb_raus: [...raus, id].slice(-2 * KORB_MAX) })); return; }
  if (!raus.includes(id) || fertig.includes(id) || !(inbox(eingabe.tool_input?.labelIds) || inbox(eingabe.tool_input?.removeLabelIds))) return;
  leaseSchreiben(env, JSON.stringify({ ...l, korb_fertig: [...fertig, id].slice(-2 * KORB_MAX) }));
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
  const spiegel = Array.isArray(l.spiegel) ? l.spiegel.filter((x) => x && typeof x.url === "string" && typeof x.sha256 === "string") : [];
  for (const o of antwortObjekte(eingabe.tool_response)) {
    const url = o.upload_url ?? o.download_url; let u; try { u = new URL(String(url)); } catch { continue; } // A-600 FOLGE: download_url aus exava_datei_lesen
    if (typeof url === "string" && u.protocol === "https:" && /^[a-z0-9.-]{1,253}$/.test(u.host) && !hosts.includes(u.host) && hosts.length < 5) hosts.push(u.host);
    // A-846: Upload-URL eines Originals für einen Anhang (purpose dokument_original) mit seiner Prüfsumme – die Policy lässt curl PUT dorthin nur für genau dieses Original zu
    if (o.purpose === "dokument_original" && typeof o.upload_url === "string" && u.protocol === "https:" && /^[0-9a-f]{64}$/.test(String(o.sha256)) && spiegel.length < 10 && !spiegel.some((x) => x.url === o.upload_url)) spiegel.push({ url: o.upload_url, sha256: String(o.sha256) });
  }
  leaseSchreiben(env, JSON.stringify({ ...l, upload_hosts: hosts, ...(spiegel.length ? { spiegel } : {}) }));
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
/** A-846 (E-1143): Entwurfsaufträge, in denen der Hook Originale für Anhänge ablegt (dokument_original) – wortgleich in hintergrund-policy.mjs (scripts/test/a846-dokumente-anhaenge.ts). */
export const SPIEGEL_ARTEN = new Set(["arbeit", "mail_vorbereitung", "antwort"]);
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
  if (web.size > vorher) leaseSchreiben(env, JSON.stringify({ ...l, web: [...web] }));
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
/** A-944 Nachtrag (Bauherr 04.11.2026): höchstens 40 gemerkte Originale je Auftrag (eine Belegsuche hat 30–35 Umsätze); Rohmails bleiben bei 10. */
export const ORIGINALE_MAX = 40;
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
 *  (höchstens ORIGINALE_MAX); A-659: im Auftrag ablage nur die Drive-Datei unter arbeit/ (Prüfsumme per sha256sum, wenn Drive keine sha256Checksum liefert – nie ein Original); sonst nichts (fail closed). */
function originalMerken(eingabe, env, quelle) {
  let l; try { l = JSON.parse(readFileSync(leasePfad(env), "utf8")); } catch { return; }
  const id = quelle === "drive" ? eingabe.tool_input?.fileId : eingabe.tool_input?.messageId;
  const nurDatei = UMBENENNEN_ARTEN.has(l?.art) && quelle === "drive"; // A-659: Ablage braucht nur die Bytes für die Prüfsumme; A-924 Erweiterung: ebenso das Drive-Fenster (Erstaufnahme)
  if (!l || (l.art !== "belegsuche" && !SPIEGEL_ARTEN.has(l.art) && !nurDatei) || !leaseLesen(env) || typeof id !== "string" || !/^[A-Za-z0-9_-]{6,120}$/.test(id)) return; // A-846: SPIEGEL_ARTEN
  const objekte = alleObjekte(eingabe.tool_response);
  if (objekte.some((x) => x.isError === true || x.is_error === true)) return;
  const felder = quelle === "drive" ? ["blob", "data", "base64Content", "content", "contentBase64"] : ["raw"];
  const finden = (liste) => liste.flatMap((x) => felder.map((k) => x[k])).find((v) => typeof v === "string" && v.length >= 16 && v.length <= ORIGINAL_MAX * 1.4 && /^[A-Za-z0-9+/_-]+={0,2}$/.test(v));
  const b64 = finden(objekte) ?? finden(gespeicherteAusgabe(eingabe, id)); // A-642: über MAX_MCP_OUTPUT_TOKENS steht nur der Pfad in der Antwort
  if (!b64) return;
  const bufs = quelle === "drive" ? [Buffer.from(b64, "base64")] : mimeAnhaenge(Buffer.from(b64, "base64").toString("latin1"));
  if (quelle === "gmail" && !bufs.length) return l.art === "belegsuche" ? rohmailMerken(l, id, Buffer.from(b64, "base64"), env) : undefined; // A-657 GO pdf.py: Belegmail nur als HTML (nur Belegsuche)
  let originale = Array.isArray(l.originale) ? l.originale.filter((x) => x && typeof x.sha256 === "string" && typeof x.datei === "string") : [];
  const vorher = originale.length;
  bufs.forEach((buf, n) => {
    const endung = originalEndung(buf) ?? (nurDatei ? "bin" : null); // A-924 Erweiterung: Office, CSV, Bild ohne Signatur nur für die Prüfsumme (arbeit/drive-<id>.bin), nie ein Original
    if (!endung || buf.length > ORIGINAL_MAX || originale.length >= ORIGINALE_MAX) return;
    const datei = quelle === "drive" ? `arbeit/drive-${id}.${endung}` : `arbeit/gmail-${id}-${n + 1}.${endung}`, sha256 = createHash("sha256").update(buf).digest("hex");
    mkdirSync(join(projekt(env), "arbeit"), { recursive: true });
    if ([join(projekt(env), "arbeit"), join(projekt(env), datei)].some((x) => { try { return lstatSync(x).isSymbolicLink(); } catch { return false; } })) return; // nie über einen Verweis schreiben
    writeFileSync(join(projekt(env), datei), buf);
    if (!nurDatei && !originale.some((x) => x.sha256 === sha256 && x.datei === datei)) originale = [...originale, { datei, sha256 }];
  });
  if (originale.length > vorher) leaseSchreiben(env, JSON.stringify({ ...l, originale }));
}
/** A-657 GO pdf.py: Mail ohne PDF-/Bild-Anhang → Rohmail (≤ 2 MiB, Grenze von pdf.py) nach arbeit/gmail-<messageId>.eml, SHA-256 in lease.rohmails (höchstens 10) – nur sie darf pdf.py --mail lesen. */
function rohmailMerken(l, id, buf, env) {
  const datei = `arbeit/gmail-${id}.eml`, rohmails = Array.isArray(l.rohmails) ? l.rohmails.filter((x) => x && typeof x.datei === "string" && typeof x.sha256 === "string") : [];
  if (!buf.length || buf.length > 2 << 20 || rohmails.length >= 10) return;
  mkdirSync(join(projekt(env), "arbeit"), { recursive: true });
  if ([join(projekt(env), "arbeit"), join(projekt(env), datei)].some((x) => { try { return lstatSync(x).isSymbolicLink(); } catch { return false; } })) return; // nie über einen Verweis schreiben
  writeFileSync(join(projekt(env), datei), buf);
  const sha256 = createHash("sha256").update(buf).digest("hex");
  leaseSchreiben(env, JSON.stringify({ ...l, rohmails: [...rohmails.filter((x) => x.datei !== datei), { datei, sha256 }] }));
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
  if (originale.length < ORIGINALE_MAX) leaseSchreiben(env, JSON.stringify({ ...l, originale: [...originale, { datei: m[3], sha256: sha(pdf) }] }));
}
/** A-534 (G7): Ordner-ID aus get_file_permissions nur dann in lease.ordner, wenn ein verbundenes Postfach Eigentümer ist und die Lease-Art ablage lautet; sonst nichts (fail closed). */
function ordnerBestaetigen(eingabe, env) {
  let l; try { l = JSON.parse(readFileSync(leasePfad(env), "utf8")); } catch { return; }
  const id = eingabe.tool_input?.fileId;
  if (!l || !UMBENENNEN_ARTEN.has(l.art) || !leaseLesen(env) || !Array.isArray(l.adressen) || typeof id !== "string" || !/^[A-Za-z0-9_-]{6,200}$/.test(id)) return; // A-924 Erweiterung: auch Drive-Fenster
  if (alleObjekte(eingabe.tool_response).some((x) => x.isError === true || x.is_error === true)) return;
  const eigen = alleObjekte(eingabe.tool_response).some((x) => x.role === "owner" && typeof x.emailAddress === "string" && l.adressen.includes(x.emailAddress.toLowerCase()));
  const ordner = Array.isArray(l.ordner) ? l.ordner.filter((x) => typeof x === "string") : [];
  if (!eigen) return;
  // A-924 AM ORT: nicht geteilt = jedes Recht der Antwort ist ein Eigentümer-Recht (keine weitere Person, Gruppe, Domain, kein Link) – sonst darf die Datei nicht umbenannt werden
  const rechte = alleObjekte(eingabe.tool_response).filter((x) => typeof x.role === "string"); // Rechte samt permissionDetails (geerbte Freigaben eines Ordners stehen als eigene Rechte darin)
  const ungeteilt = Array.isArray(l.ungeteilt) ? l.ungeteilt.filter((x) => typeof x === "string") : [];
  const nurEigen = rechte.length > 0 && rechte.every((x) => x.role === "owner" && (x.type === undefined || x.type === "user") && (typeof x.emailAddress !== "string" || l.adressen.includes(x.emailAddress.toLowerCase())));
  const datei = Array.isArray(l.umbenennen) && l.umbenennen.some((u) => u?.file_id === id); // A-930 Nachtrag: eine Datei zum Umbenennen ist kein Ordner – sonst füllen 20 Umbenennungen lease.ordner und 00-EXAVA ist nicht mehr bestätigbar
  const neu = { ...(l.art !== "ablage" || datei || ordner.includes(id) || ordner.length >= 20 ? {} : { ordner: [...ordner, id] }), ...(nurEigen && !ungeteilt.includes(id) ? { ungeteilt: [...ungeteilt, id].slice(-300) } : {}) }; // A-924 Erweiterung: Ordner nur in der Ablage; A-930: die letzten 300 Dateien (Ausführungslauf ≤ 500)
  if (Object.keys(neu).length) leaseSchreiben(env, JSON.stringify({ ...l, ...neu }));
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
    leaseSchreiben(env, JSON.stringify(o ? { job_id: o.job.id, lauf_id: o.lauf_id, lease_token: o.lease_token, ...(Number.isInteger(o.lease_generation) ? { lease_generation: o.lease_generation } : {}) /* A-901: Lease-Weitergabe an x-scan */, ...(typeof o.silo === "string" ? { silo: o.silo } : {}), ...(typeof o.job.art === "string" ? { art: o.job.art } : {}), ...(o.job.art === "belegsuche" && o.job.bezug?.csv === true ? { csv: true } : {}), ...(o.job.art === "ablage" && datevAus(o.job.bezug?.datev_paket) ? { datev: datevAus(o.job.bezug.datev_paket) } : {}) /* A-818 */, ...(o.job.art === "ablage" && umbenennenAus(o.job.bezug?.umbenennen).length ? { umbenennen: umbenennenAus(o.job.bezug.umbenennen) } : {}) /* A-924 AM ORT */, adressen: adressen(o.job),
      ...(Array.isArray(o.job.bezug?.whatsapp_ids) ? { whatsapp_ids: o.job.bezug.whatsapp_ids.filter((x) => typeof x === "string" && UUID.test(x)).map((x) => x.toLowerCase()).slice(0, 50) } : {}) /* A-924 Erweiterung */,
      ...(WEB_ARTEN.has(o.job.art) ? { web: [...new Set(textAdressen(o.job.eingabe))] } : {}) } : {})); // A-534: art und Postfächer für die Ausnahmen der Policy; A-626 WEB: Adressen aus dem Auftrag
    return { code: 0 };
  }
  if (t && (t.server === "google_drive" || /^[0-9a-f]{8}_[0-9a-f]{4}_/.test(t.server)) && t.werkzeug === "get_file_permissions") { mitLeaseSperre(env, () => ordnerBestaetigen(eingabe, env)); return { code: 0 }; } // A-930: parallel sicher
  if (t && (t.server === "google_drive" || /^[0-9a-f]{8}_[0-9a-f]{4}_/.test(t.server)) && t.werkzeug === "get_file_metadata") { mitLeaseSperre(env, () => archivMerken(eingabe, env)); return { code: 0 }; } // A-615
  if (t && (t.server === "google_drive" || /^[0-9a-f]{8}_[0-9a-f]{4}_/.test(t.server)) && t.werkzeug === "create_file" && eingabe.tool_input?.base64Content === undefined) { mitLeaseSperre(env, () => ordnerAngelegt(eingabe, env)); return { code: 0 }; } // A-930d: im Lauf angelegter Ablageordner
  if (t && (t.server === EXAVA_SERVER || /^[0-9a-f]{8}_[0-9a-f]{4}_/.test(t.server)) && t.werkzeug === "heartbeat_job") { mitLeaseSperre(env, () => namenMerken(eingabe, env)); return { code: 0 }; } // A-924 Erweiterung: Namen zum Umbenennen am Ort
  if (t && (t.server === EXAVA_SERVER || /^[0-9a-f]{8}_[0-9a-f]{4}_/.test(t.server)) && t.werkzeug === "ausfuehrung_liste") { mitLeaseSperre(env, () => ausfuehrungMerken(eingabe, env)); return { code: 0 }; } // A-930 (Weg A)
  if (t && (t.server === "google_drive" || /^[0-9a-f]{8}_[0-9a-f]{4}_/.test(t.server)) && t.werkzeug === "download_file_content") { originalMerken(eingabe, env, "drive"); return { code: 0 }; } // A-608 BELEG-ORIGINAL
  if (t && (t.server === EXAVA_SERVER || /^[0-9a-f]{8}_[0-9a-f]{4}_/.test(t.server)) && (t.werkzeug === "browser_lesen" || t.werkzeug === "browser_beenden")) { uploadHostMerken(eingabe, env); return { code: 0 }; } // A-882: download_url der Eingangsbestätigung (Speicher-Host wie exava_datei_lesen)
  if (t && (t.server === EXAVA_SERVER || /^[0-9a-f]{8}_[0-9a-f]{4}_/.test(t.server)) && (t.werkzeug === "prepare_file_upload" || t.werkzeug === "exava_datei_lesen")) { mitLeaseSperre(env, () => { uploadHostMerken(eingabe, env); if (t.werkzeug === "exava_datei_lesen") anhangMerken(eingabe, env); }); return { code: 0 }; } // A-818: Prüfsummen der geladenen Dateien; A-930: parallel sicher
  if (t && (t.server === "gmail" || /^[0-9a-f]{8}_[0-9a-f]{4}_/.test(t.server)) && t.werkzeug === "get_message" && eingabe.tool_input?.messageFormat === "RAW") { originalMerken(eingabe, env, "gmail"); return { code: 0 }; } // A-608 BELEG-ORIGINAL (Gmail-Anhang)
  if (t && (t.server === EXAVA_SERVER || /^[0-9a-f]{8}_[0-9a-f]{4}_/.test(t.server)) && t.werkzeug === "mail_archivieren") { mitLeaseSperre(env, () => korbFreigabeMerken(eingabe, env)); return { code: 0 }; } // A-993b Schritt 6
  if (t && (t.server === "gmail" || /^[0-9a-f]{8}_[0-9a-f]{4}_/.test(t.server)) && ["untrash_message", "unlabel_message", "update_message_labels"].includes(t.werkzeug)) { mitLeaseSperre(env, () => korbSchrittMerken(eingabe, env, t.werkzeug)); return { code: 0 }; } // A-993b Schritt 6
  if (t && (t.server === "gmail" || /^[0-9a-f]{8}_[0-9a-f]{4}_/.test(t.server)) && ["search_threads", "get_thread", "get_message"].includes(t.werkzeug) && korbLease(env)) mitLeaseSperre(env, () => korbGesehenMerken(eingabe, env)); // A-993b Schritt 6 (Sperre nur im Auftrag belegsuche)
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
