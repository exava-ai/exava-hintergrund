#!/usr/bin/env node
// PreToolUse-Hook „hintergrund-policy“ (A-529 VORLAGE) für JEDES Werkzeug (Matcher .*), erster PreToolUse-Eintrag in settings.json des Repos exava-hintergrund.
// Herkunft: docs/x2/spike/mandant-repo/_claude/hooks/symbiose-policy.mjs (mcpTeile, vertragPruefen, Hauptprogramm mit Frist; Vertragsprüfung Klasse/Profil/Felder) und die
// UUID-Zuordnung aus Entwurf #1182 (Zweig a528-hook-namen, UUID_SERVER und Treffer über den eindeutigen Werkzeugnamen; per UUID zusätzlich die EXAVA-Werkzeuge aus EXAVA_WERKZEUGE), kopiert und angepasst; das Original bleibt unverändert (Altweg).
// Unterschied: kein Token und kein Profil aus der Umgebung – die Routine arbeitet immer im Profil recherche (Werkzeugvertrag provider-vertrag.json, Klasse lesen).
// ALLOWLIST (alles andere Exit 2 mit Klartext, auch unbekannte Server und Werkzeuge – fail closed):
//   eingebaut: Read, Glob, Grep, Skill, ToolSearch (lädt aufgeschobene Connector-Werkzeuge), TodoWrite; Bash, Write und Edit nur nach bashPruefen/schreibPruefen (A-531 DATEI),
//   weil die Shell im Netz „Trusted“ sonst ein Weg nach draußen und an .claude/ vorbei wäre;
//   A-534 (Kernregeln 9–11): Ablage (Drive umbenennen/verschieben, Ordner anlegen) und Postfach-Hygiene (Spam aufheben, INBOX entfernen) nur mit einer Lease der passenden Auftragsart
//   aus .exava/lease.json (schreibt nur x-ausfuehrung.mjs) und nur in engster Form (hygieneAusnahme); Löschen, Papierkorb, Teilen und Senden bleiben gesperrt;
//   A-532/A-914: Helfer (Agent, früher Task) nur mit subagent_type x-scan oder x-triage; im Helfer nur Read, ToolSearch und Lesewerkzeuge von Drive und Gmail (ingest_document nur x-scan), sonst kein Subagent;
//   und im Netz „Trusted“ wäre sie ein Weg nach draußen und an .claude/ vorbei;
//   A-901 (Bauherr 02.11.2026): dazu im Helfer genau ingest_document von „EXAVA Hintergrund“ (scanIngest) – die Lease setzt dieser Hook per updatedInput aus .exava/lease.json, der Helfer bekommt sie nie;
//   A-901 Teil 2: den Helfer nur im Vordergrund (run_in_background: false) und nur mit subagent_type, prompt, description starten (SCAN_AGENT_FELDER); sein erster Aufruf bindet
//   ihn an den laufenden Auftrag (.exava/helfer-<sha256>.json, einzige Datei, die dieser Hook schreibt) – nach einem Auftragswechsel keine Lease mehr für ihn;
//   EXAVA nur vom Connector „EXAVA Hintergrund“ und nur die Werkzeuge in EXAVA_WERKZEUGE (der Server prüft Profil, Auftrag und Lease zusätzlich);
//   Gmail, Google Drive, Google Calendar nur Werkzeuge der Klasse „lesen“ mit Profil recherche und nur geprüfte Eingabefelder;
//   A-531 F1 (Grundregel 7, A-498/E-1109: „Lesen frei“): jeder andere Connector lesend nach lesend() aus sperre.mjs (wortgleich); schreibend nur gesteuert (MCP-1, unten), UUID-Namen und ungültige Zeichen sonst capability_missing; EXAVA-Namen bleiben gesperrt;
//   COMPLIANCE H1: fetch nur ohne method/mit GET/HEAD und ohne Body, query nur mit einer select/with-Anweisung ohne Schreibwörter (eingabeLesend); H2: curl PUT nur an lease.upload_hosts.
//   A-608 BELEG-ORIGINAL (E-1120 Regel 1): im Auftrag belegsuche ist ein Upload nur das Original, das x-ausfuehrung.mjs aus Drive download_file_content geschrieben hat (SHA-256 in
//   lease.originale, hier über die Datei neu gerechnet); Write/Edit und pdf.py sind dort gesperrt – ein selbst erzeugtes Dokument ist nie ein Belegoriginal.
//   A-657/A-658 (Go Bauherr 22.10.2026) dort nur: im CSV-Modus (lease.csv) einmal Write von arbeit/belegsuche-<kürzel>.csv und curl PUT dieser CSV; pdf.py --mail nur für eine vom Hook
//   gesicherte Rohmail (lease.rohmails) – die PDF wird erst nach dem Lauf von pdf.py zum Original (PostToolUse in x-ausfuehrung.mjs). Edit, andere Ziele und Skripte bleiben gesperrt.
//   A-846 (E-1143): in den Entwurfsaufträgen SPIEGEL_ARTEN ist ein curl PUT an eine gemerkte Upload-URL eines Originals (lease.spiegel, purpose dokument_original) nur für genau die Datei frei,
//   die x-ausfuehrung.mjs aus Drive bzw. Gmail abgelegt hat (lease.originale, Prüfsumme hier neu gerechnet und gleich der angemeldeten).
//   A-818 (G5, Go Bauherr 28.10.2026): im Ablage-Auftrag mit job.bezug.datev_paket zusätzlich curl -o und sha256sum genau dieser Paket-ZIP, die drei Ordner aus lease.datev und der ZIP-Platzhalter
//   nur in den bestätigten Monatsordner (lease.datev_ziel); Löschen, Papierkorb, Teilen und Senden bleiben gesperrt.
//   A-626 WEB (Go Bauherr 21.10.2026), A-782 (Go 26.10.2026): WebSearch und WebFetch nur in den Aufträgen aus WEB_ARTEN (webPruefen) – Suchtext ohne Mailadresse, IBAN und lange Nummer; WebFetch und curl -o aus dem Web
//   (BASH_WEB) nur mit einer Adresse aus lease.web (Auftragstext, WebSearch-Treffer, Links einer geöffneten Seite; schreibt nur x-ausfuehrung.mjs), nie mit einer selbst gebauten –
//   so gelangen keine Mandantendaten an fremde Domains.
//   A-905 (E-1166, Bauherr 02.11.2026): die Startadresse von browser_starten darf Claude selbst bestimmen (startFrei: https mit Domain, ohne Mailadresse, IBAN und lange Nummer,
//   auch mehrfach kodiert oder in Vollbreite; Freitext wie Namen erkennt keine Regel) – kein WebSearch-Umweg mehr; WebFetch und curl -o bleiben bei lease.web.
//   A-531 AUSFUEHRUNG (PR 3): gesteuert() – Gmail send_message/reply und jeder fremde Connector schreibend (MCP-1; nicht Gmail/Drive/Kalender, nicht exava*, kein UUID-Name) – entscheidet NICHT dieser Hook, sondern x-ausfuehrung.mjs (Lease + Freigabe in
//   EXAVA, fail closed); hier frei, damit genau dieser zweite Hook zuständig ist (settings.json führt beide mit Prüfsumme; fehlt er, sperrt die Integritätsprüfung).
//   A-907 Fehler-Radar: jeder Exit 2 hängt eine kleine Zeile an arbeit/hook-blocks.jsonl (blockZeile/blockMerken: Zeit, Werkzeug, Sperrgrund, bei Bash der geschwärzte Kurzbefehl) –
//   nur im Hook-Lauf von Claude Code (CLAUDE_PROJECT_DIR gesetzt), Fehler beim Schreiben werden ignoriert, der Block bleibt Exit 2; die Routine meldet die Zeilen mit hook_blocks.
// Rein lokal, ohne Netz, ohne Umgebungsvariable. Fail closed: unlesbare Eingabe, Vertrag nicht lesbar, Absturz und Frist → Exit 2.
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const FRIST_MS = 10_000; // Skript endet spätestens nach 10 s (Hook-Timeout 30 s)
export const PROFIL = "recherche";
/** Kern-Server mit Werkzeugvertrag (wie symbiose-policy.mjs). */
export const VERTRAG_SERVER = new Set(["gmail", "google_drive", "google_calendar"]);
/** Servername des Connectors „EXAVA Hintergrund“ nach mcpTeile: Anzeigename klein, Leerzeichen und „-“ → „_“ (beobachtet: mcp__Google_Drive__ aus „Google Drive“, mcp__Google-Drive__ aus Routinen der Oberfläche). */
export const EXAVA_SERVER = "exava_hintergrund";
/** Werkzeugvertrag ABHOLEN (PROFIL_WERKZEUGE.hintergrund): arbeit_holen + recherche ohne claim_job und ohne prepare_file_upload; A-531 + genau ingest_document, ingest_facts, ingest_wiki (Profil ingest; welcher Auftrag sie nutzen darf, prüft der Server) und whatsapp_lesen (nur lesend, #1239); A-531 AUSFUEHRUNG get_approved_draft (nur lesend, nur im Versandauftrag – der Server prüft Profil und Lease); A-531 OFFENE-POSTEN-HG get_open_items (nur lesend wie read_knowledge; Profil, Auftrag, Lease prüft der Server); A-549 mail_lesen (nur lesend, nur IMAP); A-597 mail_archivieren (nur im Auftrag Postfach-Hygiene, Label Posteingang entfernen – Auftrag, Lease und Rechte prüft der Server). */
export const EXAVA_WERKZEUGE = new Set(["arbeit_holen", "heartbeat_job", "read_knowledge", "get_unmatched_transactions", "submit_evidence", "propose_booking", "save_draft", "ask_user", "complete_job", "ingest_document", "ingest_facts", "ingest_wiki", "whatsapp_lesen", "anrufnotizen_lesen", "get_approved_draft", "prepare_file_upload", "get_open_items", "mail_lesen", "mail_archivieren", "support_offen_lesen", "support_zuordnen", "regel_vorschlagen", "regel_postfaecher", "exava_datei_lesen", "rueckfragen_pruefen", "rueckfrage_im_postfach_erledigt", "belegsuche_ergebnis", "projekt_stand_lesen", "projekt_stand_setzen", "browser_starten", "browser_lesen", "browser_handeln", "browser_werte_melden", "browser_beenden"]); // A-882 S3 browser_*: nur recherche-Auftrag mit job.bezug.browser, Absenden nur als Freigabe-Anforderung (prüft der Server) // A-787 regel_postfaecher: nur Arbeitsauftrag, Postfächer einer Mail-Automatisierung (prüft der Server) // A-706: Projektstand im Auftrag (Lease, Rechte und Gesellschaftsrecht prüft der Server) // A-607: Rückfragen nur im Auftrag Postfach-Hygiene abgleichen (prüft der Server); A-578 P4: nur Betreiber und nur Auftrag skill x-support (prüft der Server); A-600 FOLGE regel_vorschlagen: nur Arbeitsauftrag, Regel immer aus (prüft der Server); A-600 FOLGE exava_datei_lesen: nur Eingangsauftrag, nur lesend (Lease und Bezug prüft der Server)
/** A-531 F1: bekannte EXAVA-Werkzeuge außerhalb von EXAVA_WERKZEUGE – über fremde oder UUID-Connectoren nie frei, auch wenn der Name lesend klingt (get_approved_draft). */
export const EXAVA_BEKANNT = new Set(["claim_job", "claim_sync_window", "prepare_file_upload", "get_open_items", "get_financial_overview"]);
/** Wortgleich aus sperre.mjs (scripts/test/a529-vorlage.ts prüft die Gleichheit). */
export const LESEN = new Set(["get", "list", "search", "read", "fetch", "find", "describe", "download", "estimate", "check", "query", "compute", "preview", "count", "lookup", "view", "show", "inspect", "guide", "suggest"]);
export const SCHREIBEN = new Set(["create", "update", "delete", "remove", "send", "publish", "upload", "add", "set", "put", "patch", "write", "share", "invite", "move", "rename", "copy", "archive",
  "merge", "push", "fire", "trigger", "approve", "submit", "cancel", "pause", "resume", "enable", "disable", "mark", "apply", "assign", "transfer", "pay", "duplicate", "manage", "run", "execute",
  "start", "stop", "reply", "forward", "respond", "edit", "insert", "replace", "import", "export", "sync", "subscribe", "unsubscribe", "label", "trash", "spam", "comment", "resolve", "revoke", "grant",
  "deploy", "close", "lock", "schedule", "save", "reset", "clear", "purge", "drop", "destroy", "kill", "terminate"]);
/** A-531 HOOK-WORTLISTE: nach einem Verbindungswort muss wieder ein Lesewort stehen (fetch_and_post, get_or_upsert → nicht lesend). */
export const VERBINDUNG = new Set(["and", "or", "then", "plus"]);
export const woerter = (name) => String(name ?? "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").split(/[\s_.-]+/).filter(Boolean).map((w) => w.toLowerCase());
export function lesend(name) {
  const w = woerter(name);
  if (w[0] === "bulk") w.shift();
  return w.length > 0 && LESEN.has(w[0]) && !w.some((x) => SCHREIBEN.has(x)) && w.every((x, i) => !VERBINDUNG.has(w[i - 1]) || LESEN.has(x));
}
/** A-531 COMPLIANCE H1: fetch und query sind nur mit lesender Eingabe lesend – fetch ohne method oder GET/HEAD und ohne Body, query nur SQL mit select/with, eine Anweisung, keine Schreibwörter. */
const BODY = new Set(["body", "data", "json", "form", "payload"]);
const SQL_ARTIG = /\b(select|insert|update|delete|merge|drop|alter|create|truncate|grant|copy|call)\b|^\s*(with\b|--|\/\*)/i;
const SQL_SCHREIBEN = /\b(insert|update|delete|merge|drop|alter|create|truncate|grant|copy|call|into)\b/i; // into: select … into legt eine Tabelle an
/** A-531 HOOK-AUDIT-2 G1: schreibende Abfragen ohne SQL-Wort (GraphQL mutation, MongoDB deleteMany/findOneAndUpdate/bulkWrite, Cypher MATCH … SET/REMOVE) – in Text und Schlüssel. */
const QUERY_SCHREIBEN = /\bmutation\b|\b(insert|update|delete|replace|remove|upsert)(one|many)\b|\bfindoneand|\bfindandmodify\b|\bbulkwrite\b|\bmatch\b[\s\S]*\b(set|remove|detach)\b/i;
/** A-531 HOOK-AUDIT-2 G2: Methode auch als httpMethod, _method, X-HTTP-Method-Override (Schlüssel) oder als Kopfzeile im Text. */
const METHODE = /^(x-http-|x-|http_?|request_?|_)?method(-override)?$/;
/** Alle [Schlüssel, Wert] und Texte der Eingabe; zu tief oder zu groß → null (fail closed). */
function teileDer(x, out = { paare: [], texte: [] }, t = 0) {
  if (!out || t > 8 || out.paare.length + out.texte.length > 2000) return null;
  if (typeof x === "string") out.texte.push(x);
  else if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) { out.paare.push([k.toLowerCase(), v]); if (!teileDer(v, out, t + 1)) return null; }
  return out;
}
export function eingabeLesend(werkzeug, ti) {
  const w = woerter(werkzeug); if (w[0] === "bulk") w.shift();
  if (w[0] !== "fetch" && w[0] !== "query") return true;
  const e = teileDer(ti ?? {}); if (!e) return false;
  if (w[0] === "fetch") return !e.paare.some(([k, v]) => (METHODE.test(k) && !/^(get|head)$/i.test(String(v))) || (BODY.has(k) && v !== undefined && v !== null && v !== "")) && !e.texte.some((s) => /method[-_]?override/i.test(s));
  return !e.paare.some(([k]) => QUERY_SCHREIBEN.test(k) || SQL_SCHREIBEN.test(k))
    && e.texte.every((s) => !QUERY_SCHREIBEN.test(s) && (!SQL_ARTIG.test(s) || (/^\s*\(?\s*(select|with)\b/i.test(s) && !s.replace(/;\s*$/, "").includes(";") && !SQL_SCHREIBEN.test(s))));
}
/** A-532: einziger Helfer (Scans mit günstigem Modell, .claude/agents/x-scan.md) und was er darf. */
export const SCAN_AGENT = "x-scan";
/** A-914: zweiter Helfer x-triage (Vorsortierung, .claude/agents/x-triage.md) – gleiche Startregeln, im Helfer nur Read, ToolSearch, Drive/Gmail lesend, kein EXAVA-Werkzeug. */
export const TRIAGE_AGENT = "x-triage";
const HELFER = new Set([SCAN_AGENT, TRIAGE_AGENT]);
const SCAN_EINGEBAUT = new Set(["Read", "ToolSearch", "SubagentHandback"]), SCAN_SERVER = new Set(["gmail", "google_drive"]); // A-919: SubagentHandback = Rückgabeweg des Helfers an die Routine (Claude Code), ohne ihn kommt kein Ergebnis an
/** A-901: das eine EXAVA-Werkzeug des Helfers und seine Felder (Vertrag ingest_document, lib/x/connector/symbiose-schemata.ts); die vier Lease-Felder überschreibt scanIngest immer. */
export const SCAN_EXAVA = "ingest_document";
export const SCAN_INGEST_FELDER = ["job_id", "lauf_id", "lease_generation", "lease_token", "idempotency_key", "pipeline_version", "source_ref", "provider_version", "expected_source_version", "source_timestamp",
  "content_sha256", "extraction_id", "part_number", "pages", "total_pages", "final_part", "metadata"];
/** A-901 Teil 2 (Gegenprüfung #2113): den Helfer nur im Vordergrund starten – ohne run_in_background: false startet Claude Code ihn im Hintergrund, dann könnte er seinen Auftrag
 *  überdauern und ingest_document unter der Lease des Folgeauftrags rufen (scanIngest liest die Lease beim Aufruf). Nur diese Felder: kein model/effort (Haiku aus x-scan.md), keine isolation/name. */
export const SCAN_AGENT_FELDER = ["subagent_type", "prompt", "description", "run_in_background"];
/** A-531 DATEI: die drei erlaubten Shell-Formen (datei-upload.md §3.2), ganzer Befehl verankert; Prüfsumme des Renderers setzt der Generator. */
export const PDF_RENDERER_SHA256 = "de8c478a47dddaf9999b2f5e8b2c55c1f7c30684b3f4b08f0f4d6d734aba2fef", XLSX_RENDERER_SHA256 = "0643294b441c03a9948810b953ad65cf21ecde7184e0e24111a480c5aab95582"; // A-622 P3-A: Listen als .xlsx
const NAME = String.raw`[A-Za-z0-9._-]{1,140}(?:__#[0-9a-f]{8})?`, DATEI = String.raw`arbeit/${NAME}\.(?:pdf|json|csv|docx|xlsx)`;
const MIME = String.raw`(?:application/pdf|text/csv|application/vnd\.openxmlformats-officedocument\.(?:wordprocessingml\.document|spreadsheetml\.sheet))`;
export const BASH_PDF_MAIL = /^\/usr\/bin\/python3 -I \.claude\/tools\/pdf\.py --mail (arbeit\/gmail-([A-Za-z0-9_-]{6,120})\.eml) arbeit\/gmail-\2-mail\.pdf$/; // A-657 GO pdf.py: HTML-Belegmail 1:1
export const BASH_PDF = new RegExp(String.raw`^/usr/bin/python3 -I \.claude/tools/pdf\.py arbeit/${NAME}\.json arbeit/${NAME}\.pdf$`);
export const BASH_XLSX = new RegExp(String.raw`^/usr/bin/python3 -I \.claude/tools/xlsx\.py arbeit/${NAME}\.json arbeit/${NAME}\.xlsx$`);
const GELADEN = String.raw`arbeit/${NAME}\.(?:pdf|jpe?g|png|webp|heic|tiff?|docx?|xlsx?|csv|txt|odt|ods|rtf)`; // A-600 FOLGE: Eingang (x-eingang) – geladene Datei aus exava_datei_lesen; A-642 OFFICE: Formate der Anhang-Ablage
export const BASH_SHA = new RegExp(String.raw`^/usr/bin/sha256sum (?:${DATEI}|${GELADEN})$`);
export const BASH_LADEN = new RegExp(String.raw`^/usr/bin/curl -q -sSfL -o ${GELADEN} "https://([A-Za-z0-9.-]+)/storage/v1/object/sign/belege/[A-Za-z0-9/._%-]+\?token=[A-Za-z0-9._-]+(?:&download=[A-Za-z0-9._%()~+-]*)?"$`); // A-632 FOLGE: „+“ = Leerzeichen im Dateinamen
export const BASH_CURL = new RegExp(String.raw`^/usr/bin/curl -q -sSf -X PUT --data-binary @${DATEI} -H "content-type: ${MIME}" "https://([A-Za-z0-9.-]+)/storage/v1/object/upload/sign/belege/[A-Za-z0-9/._%-]+\?token=[A-Za-z0-9._-]+"$`);
/** A-608 BELEG-ORIGINAL: Upload des Originals (Datei vom Hook unter arbeit/drive-<fileId>.<endung> bzw. arbeit/gmail-<messageId>-<n>.<endung>, Typ wie beleg_original; A-657: …-mail.pdf aus pdf.py --mail). */
export const BASH_CURL_ORIGINAL = new RegExp(String.raw`^/usr/bin/curl -q -sSf -X PUT --data-binary @(arbeit/(?:drive-[A-Za-z0-9_-]{6,120}|gmail-[A-Za-z0-9_-]{6,120}-(?:\d{1,2}|mail))\.(?:pdf|jpg|png|tif)) -H "content-type: (?:application/pdf|image/jpeg|image/png|image/tiff)" "https://([A-Za-z0-9.-]+)/storage/v1/object/upload/sign/belege/[A-Za-z0-9/._%-]+\?token=[A-Za-z0-9._-]+"$`);
/** A-657/A-658: ausgefüllte CSV der Belegsuche (eine Gesellschaft je Auftrag) – nur im CSV-Modus (lease.csv). */
const CSV_BELEG = String.raw`arbeit/belegsuche-[A-Za-z0-9._-]{1,60}\.csv`;
export const BASH_CURL_CSV = new RegExp(String.raw`^/usr/bin/curl -q -sSf -X PUT --data-binary @(${CSV_BELEG}) -H "content-type: text/csv" "https://([A-Za-z0-9.-]+)/storage/v1/object/upload/sign/belege/[A-Za-z0-9/._%-]+\?token=[A-Za-z0-9._-]+"$`);
/** A-626 WEB: öffentliche Datei laden – dieselbe Form wie BASH_LADEN, Adresse aus lease.web (webPruefen); URL ohne Leerraum, Anführungszeichen, Dollar, Backtick und Backslash. */
export const BASH_WEB = new RegExp(String.raw`^/usr/bin/curl -q -sSfL -o ${GELADEN} "(https://[^"\s$\x60\\]{1,2000})"$`);
/** A-818 (G5, Go Bauherr 28.10.2026): DATEV-Paket im Ablage-Auftrag – Name und Ordner nur aus lease.datev (x-ausfuehrung.mjs übernimmt job.bezug.datev_paket, nie vom Modell); Laden vom
 *  Speicher-Host der Lease (Bucket belege oder ablage, Pfadzeichen der Netzlaufwerk-Ablage, ohne Dollar, Backtick, Backslash), Prüfsumme, Upload als Platzhalter in den bestätigten Monatsordner.
 *  DATEV_ZIP_MAX, DATEV_STAMM, DATEV_ORDNER und datevAus wortgleich in x-ausfuehrung.mjs (scripts/test/a529-vorlage.ts prüft die Gleichheit). */
export const DATEV_ZIP_MAX = 7_000_000; // Grenze des Drive-Connectors (A-638) – größere Pakete bleiben Download in EXAVA (lib/datev/drive.ts DRIVE_MAX_BYTES)
export const DATEV_STAMM = /^DATEV_[A-Z0-9_-]{1,20}_(\d{4}-(?:0[1-9]|1[0-2]))(?:_Nachtrag-\d{1,2})?$/, DATEV_ORDNER = /^(?!\.{1,2}$)[^<>:"/\\|?*\x00-\x1f]{1,80}$/;
export function datevAus(d) {
  const m = DATEV_STAMM.exec(String(d?.name ?? "")), o = d?.ordner;
  return m && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(String(d.export_id)) && Number.isInteger(d.nr) && d.nr >= 1 && d.nr <= 99 && Array.isArray(o) && o.length === 3
    && o[0] === "DATEV-Exporte" && o[2] === m[1] && o.every((x) => typeof x === "string" && x.trim() === x && DATEV_ORDNER.test(x)) ? { export_id: d.export_id, nr: d.nr, name: d.name, ordner: [...o] } : null;
}
const DATEV_ZIP = String.raw`arbeit/DATEV_[A-Z0-9_-]{1,20}_\d{4}-(?:0[1-9]|1[0-2])(?:_Nachtrag-\d{1,2})?\.zip`;
export const BASH_SHA_DATEV = new RegExp(String.raw`^/usr/bin/sha256sum (${DATEV_ZIP})$`);
export const BASH_LADEN_DATEV = new RegExp(String.raw`^/usr/bin/curl -q -sSfL -o (${DATEV_ZIP}) "https://([A-Za-z0-9.-]+)/storage/v1/object/sign/(?:belege|ablage)/[A-Za-z0-9/._%&()',;=+@!-]+\?token=[A-Za-z0-9._-]+(?:&download=[A-Za-z0-9._%()~+-]*)?"$`);
const projektDir = () => resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd());
/** Bash: nur command/description/timeout, kein Hintergrund, kein „..“, genau eine der vier Formen; pdf.py nur mit unveränderter Prüfsumme; curl nur an Speicher-Hosts aus EXAVA-Antworten (Lease). */
export function bashPruefen(ti) {
  if (!ti || typeof ti !== "object" || Object.keys(ti).some((k) => !["command", "description", "timeout"].includes(k))) return nein("Bash", "nur command, description, timeout (kein Hintergrund, keine Sandbox-Ausnahme).");
  const c = String(ti.command ?? "");
  if (leaseArt() === "belegsuche") return originalPruefen(c); // A-608 BELEG-ORIGINAL
  const sp = spiegelPruefen(c); if (sp) return sp; // A-846: Original für einen Anhang
  const dl = BASH_LADEN_DATEV.exec(c), ds = BASH_SHA_DATEV.exec(c), d = leaseDatev(); // A-818 (G5): nur die Datei aus lease.datev, Laden nur vom Speicher-Host der Lease
  if (dl || ds) return !c.includes("..") && d && (dl ?? ds)[1] === `arbeit/${d.name}.zip` && (!dl || leaseUploadHosts().includes(dl[2].toLowerCase())) ? frei()
    : nein("Bash", "DATEV-Paket nur im Ablage-Auftrag mit job.bezug.datev_paket: curl -o arbeit/<name>.zip von der download_url aus exava_datei_lesen (Speicher-Host der Lease) und sha256sum dieser Datei.");
  if (c.includes("..") || !(BASH_PDF.test(c) || BASH_XLSX.test(c) || BASH_SHA.test(c) || BASH_CURL.test(c) || BASH_LADEN.test(c) || BASH_WEB.test(c))) return nein("Bash", "nur die Formen pdf.py, xlsx.py, sha256sum, curl PUT (Skill x-arbeitsauftrag) und curl -o (Skills x-eingang, x-arbeitsauftrag).");
  for (const [re, datei, soll] of [[BASH_PDF, "pdf.py", PDF_RENDERER_SHA256], [BASH_XLSX, "xlsx.py", XLSX_RENDERER_SHA256]]) if (re.test(c)) { let h = ""; try { h = createHash("sha256").update(readFileSync(join(projektDir(), ".claude/tools", datei))).digest("hex"); } catch { /* fehlt */ }
    if (h !== soll) return nein("Bash", `${datei} verändert oder nicht lesbar.`); }
  if (BASH_CURL.test(c) && !leaseUploadHosts().includes(BASH_CURL.exec(c)[1].toLowerCase())) return nein("Bash", "curl PUT nur an den Host der Upload-URL aus prepare_file_upload (Lease)."); // COMPLIANCE H2
  if (BASH_LADEN.test(c) && !leaseUploadHosts().includes(BASH_LADEN.exec(c)[1].toLowerCase())) return nein("Bash", "curl -o nur vom Host der download_url aus exava_datei_lesen (Lease)."); // A-600 FOLGE wie H2
  if (!BASH_LADEN.test(c) && BASH_WEB.test(c) && (!WEB_ARTEN.has(leaseArt()) || !leaseWeb().includes(webAdresse(BASH_WEB.exec(c)[1])))) return nein("Bash", "curl -o aus dem Web nur in Arbeits-, Prüf- und Antwortaufträgen und nur von einer Adresse aus dem Auftrag, aus WebSearch-Treffern oder einem Link einer geöffneten Seite."); // A-626 WEB
  return frei();
}
/** A-608 BELEG-ORIGINAL: Auftrag belegsuche – nur sha256sum und curl PUT des Originals; die Prüfsumme der Datei (kein Verweis) muss in lease.originale stehen, der Host in lease.upload_hosts. */
export function originalPruefen(c) {
  const m = BASH_CURL_ORIGINAL.exec(c), k = BASH_CURL_CSV.exec(c), pm = BASH_PDF_MAIL.exec(c);
  if (c.includes("..") || !(BASH_SHA.test(c) || m || k || pm)) return nein("Bash", "im Auftrag belegsuche nur sha256sum, curl PUT des aus Drive oder Gmail geladenen Originals bzw. der CSV (CSV-Modus) und pdf.py --mail.");
  if (pm) return dateiSha(".claude/tools/pdf.py") !== PDF_RENDERER_SHA256 ? nein("Bash", "pdf.py verändert oder nicht lesbar.") // A-657 GO pdf.py: Eingang nur die vom Hook gesicherte Rohmail
    : leaseRohmails().some((o) => o.datei === pm[1] && o.sha256 === dateiSha(pm[1])) ? frei() : nein("Bash", "pdf.py --mail nur für die Rohmail, die der Hook aus Gmail get_message RAW gesichert hat (Prüfsumme).");
  if (k) return leaseRoh()?.csv !== true || !dateiSha(k[1]) ? nein("Bash", "CSV-Upload nur im CSV-Modus der Belegsuche (job.bezug.csv) und nur für arbeit/belegsuche-<kürzel>.csv.") // A-657
    : leaseUploadHosts().includes(k[2].toLowerCase()) ? frei() : nein("Bash", "curl PUT nur an den Host der Upload-URL aus prepare_file_upload (Lease).");
  if (!m) return frei();
  const p = join(projektDir(), m[1]); let h = "";
  try { if (!lstatSync(p).isSymbolicLink()) h = createHash("sha256").update(readFileSync(p)).digest("hex"); } catch { /* fehlt */ }
  if (!h || !leaseOriginale().some((o) => o.sha256 === h && o.datei === m[1])) return nein("Bash", "Upload nur für das Original, das der Hook aus Drive download_file_content bzw. Gmail get_message RAW gemerkt hat (Prüfsumme).");
  return leaseUploadHosts().includes(m[2].toLowerCase()) ? frei() : nein("Bash", "curl PUT nur an den Host der Upload-URL aus prepare_file_upload (Lease).");
}
/** A-846 (E-1143): curl PUT an eine gemerkte Upload-URL eines Originals (lease.spiegel) nur in SPIEGEL_ARTEN und nur für genau das Original, das der Hook abgelegt hat (lease.originale)
 *  und dessen Prüfsumme der Anmeldung entspricht. Erkannt am signierten Token der URL (nicht an der Schreibweise des Pfads); kein gemerkter Token → null (die übrigen Regeln gelten). */
const uploadToken = (u) => { try { return new URL(u).searchParams.get("token") ?? ""; } catch { return ""; } };
export function spiegelPruefen(c) {
  const t = uploadToken(/"(https:\/\/[^"\s]+)"$/.exec(c)?.[1] ?? ""), z = t ? leaseSpiegel().find((x) => uploadToken(x.url) === t) : null;
  if (!z) return null;
  const m = BASH_CURL_ORIGINAL.exec(c);
  if (!m || c.includes("..") || !SPIEGEL_ARTEN.has(leaseArt())) return nein("Bash", "Upload eines Originals für einen Anhang nur für die Datei, die der Hook aus Drive download_file_content bzw. Gmail get_message RAW abgelegt hat.");
  const h = dateiSha(m[1]);
  if (!h || h !== z.sha256 || !leaseOriginale().some((o) => o.sha256 === h && o.datei === m[1])) return nein("Bash", "Upload nur für das gemerkte Original mit genau der angemeldeten Prüfsumme.");
  return leaseUploadHosts().includes(m[2].toLowerCase()) ? frei() : nein("Bash", "curl PUT nur an den Host der Upload-URL aus prepare_file_upload (Lease).");
}
/** SHA-256 einer regulären Datei im Projekt (kein Verweis); sonst "". */
const dateiSha = (datei) => { try { const p = join(projektDir(), datei); return lstatSync(p).isFile() ? createHash("sha256").update(readFileSync(p)).digest("hex") : ""; } catch { return ""; } };
/** Write/Edit: nur Dateien direkt unter arbeit/ im Projekt (kein Symlink, nichts unter .claude/); im Auftrag belegsuche nie (A-608 BELEG-ORIGINAL) –
 *  außer A-657: im CSV-Modus (lease.csv) genau ein Write der neuen Datei arbeit/belegsuche-<kürzel>.csv (kein Edit, kein Überschreiben, kein Verweis). */
export function schreibPruefen(name, ti) {
  const p = resolve(projektDir(), String(ti?.file_path ?? "")), r = relative(projektDir(), p);
  if (leaseArt() === "belegsuche") { let neu = false; try { lstatSync(p); } catch { neu = true; }
    return name === "Write" && leaseRoh()?.csv === true && NUR(ti, ["file_path", "content"]) && typeof ti.content === "string" && new RegExp(`^${CSV_BELEG}$`).test(r) && neu
      && existsSync(dirname(p)) && realpathSync(dirname(p)) === join(realpathSync(projektDir()), "arbeit") ? frei()
      : nein(name, "im Auftrag belegsuche wird nichts geschrieben – ein selbst erzeugtes Dokument ist nie ein Belegoriginal; nur im CSV-Modus einmal die neue Datei arbeit/belegsuche-<kürzel>.csv."); }
  const ok = /^arbeit\/[A-Za-z0-9._#-]{1,160}$/.test(r) && !r.includes("..") && (!existsSync(dirname(p)) || realpathSync(dirname(p)) === join(realpathSync(projektDir()), "arbeit")) && !(existsSync(p) && lstatSync(p).isSymbolicLink());
  return ok ? frei() : nein(name, "schreiben nur unter arbeit/ (z. B. arbeit/<name>.json).");
}
/** A-534: Auftragsart aus der Lease (.exava/lease.json, nur von x-ausfuehrung.mjs geschrieben); ohne gültige Lease null. */
export function leaseArt() { return leaseRoh()?.art ?? null; }
/** A-818 (G5): DATEV-Paket des Ablage-Auftrags (lease.datev, erneut geprüft); sonst null. */
export function leaseDatev() { return leaseArt() === "ablage" ? datevAus(leaseRoh()?.datev) : null; }
/** A-534: vom PostToolUse-Hook bestätigte eigene Ordner (get_file_permissions, Eigentümer ist ein verbundenes Postfach); sonst leer. */
export function leaseOrdner() { const o = leaseRoh()?.ordner; return Array.isArray(o) ? o.filter((x) => typeof x === "string") : []; }
/** A-531 COMPLIANCE H2: Hosts der Upload-URLs, die x-ausfuehrung.mjs (PostToolUse) aus der Antwort von prepare_file_upload in die Lease schreibt; sonst leer. */
export function leaseUploadHosts() { const h = leaseRoh()?.upload_hosts; return Array.isArray(h) ? h.filter((x) => typeof x === "string") : []; }
/** A-608 BELEG-ORIGINAL: von x-ausfuehrung.mjs gemerkte Originale { datei, sha256 }; sonst leer. */
/** A-846: gemerkte Upload-URLs der Originale für Anhänge (x-ausfuehrung.mjs uploadHostMerken, purpose dokument_original). */
export function leaseSpiegel() { const o = leaseRoh()?.spiegel; return Array.isArray(o) ? o.filter((x) => x && typeof x.url === "string" && /^[0-9a-f]{64}$/.test(String(x.sha256))) : []; }
export function leaseOriginale() { const o = leaseRoh()?.originale; return Array.isArray(o) ? o.filter((x) => x && typeof x.datei === "string" && /^[0-9a-f]{64}$/.test(String(x.sha256))) : []; }
/** A-657 GO pdf.py: von x-ausfuehrung.mjs gesicherte Rohmails { datei, sha256 } (Gmail get_message RAW ohne PDF-/Bild-Anhang); sonst leer. */
export function leaseRohmails() { const o = leaseRoh()?.rohmails; return Array.isArray(o) ? o.filter((x) => x && typeof x.datei === "string" && /^[0-9a-f]{64}$/.test(String(x.sha256))) : []; }
/** A-626 WEB: Adressen, die die Routine öffnen darf – x-ausfuehrung.mjs merkt sie aus job.eingabe, WebSearch-Treffern und Links geöffneter Seiten; sonst leer. */
export function leaseWeb() { const w = leaseRoh()?.web; return Array.isArray(w) ? w.filter((x) => typeof x === "string") : []; }
/** A-782 (Go Bauherr 26.10.2026): Auftragsarten mit Web – Arbeitsauftrag, Ablage-Prüfung, Mail-Vorbereitung, Antwort; alle anderen (Hygiene, Sync, Belegsuche …) ohne.
 *  Wortgleich in x-ausfuehrung.mjs (scripts/test/a782-entschlackung.ts prüft die Gleichheit). */
export const WEB_ARTEN = new Set(["arbeit", "ablage", "mail_vorbereitung", "antwort"]);
/** A-846 (E-1143): Entwurfsaufträge, in denen der Hook Originale für Anhänge ablegt – wortgleich in x-ausfuehrung.mjs (scripts/test/a846-dokumente-anhaenge.ts prüft die Gleichheit). */
export const SPIEGEL_ARTEN = new Set(["arbeit", "mail_vorbereitung", "antwort"]);
/** A-626 WEB: vergleichbare Web-Adresse – nur https (http wird https wie bei WebFetch), ohne Anmeldedaten, Port und #, Host mit Buchstaben und Punkt, kein internes Netz; sonst null.
 *  Wortgleich in x-ausfuehrung.mjs (scripts/test/a529-vorlage.ts prüft die Gleichheit). */
export function webAdresse(x) {
  let u; try { u = new URL(String(x ?? "")); } catch { return null; }
  if (u.protocol === "http:") u.protocol = "https:";
  u.hash = "";
  return u.protocol === "https:" && !u.username && !u.password && !u.port && /^(?=[a-z0-9.-]*[a-z])[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(u.hostname)
    && !/\.(internal|local|localhost|lan|home|arpa|corp|intranet)$/.test(u.hostname) && u.href.length <= 2000 ? u.href : null;
}
/** A-626 WEB: Suchtext ohne Mailadresse, IBAN und lange Nummer (Kunden-, Steuer-, Kontonummer) – keine Mandantendaten an den Suchdienst. */
export const SUCHE_VERTRAULICH = /[^\s@]+@[^\s@]+\.[^\s@]+|\b[a-z]{2}\d{2}(?: ?[a-z0-9]{4}){3,}|\d{8,}/i;
/** A-905 (E-1166, Bauherr 02.11.2026): Startadresse, die Claude für den Browser-Auftrag selbst bestimmt (nicht mehr nur aus lease.web) – https mit Domain wie webAdresse (ohne
 *  Anmeldedaten, Port, IP und internen Host), ohne #-Teil, und in Host, Pfad und Query ohne Mailadresse, IBAN (Prüfziffer und Länge je Land, ASCII-Grenzen, „_“ und „/“ trennen nicht –
 *  wie START_URL in lib/x/connector/symbiose-schemata.ts) und lange Nummer (8 Ziffern \p{N}, jedes Zeichen außer Buchstabe/Ziffer als Trenner – 1234-5678-90, 1,2,…, %2B, Geburtsdatum).
 *  Geprüft wird jede Stufe (dekodierStufen): roh, dann bis zu drei Runden „jede %XX-Folge per TextDecoder (ungültige Bytes → U+FFFD), NFKC, auch ohne Formatzeichen“; bleibt danach
 *  eine %XX-Folge, gilt die Adresse als verschleiert (gesperrt). Restrisiko: Freitext (Name, Anschrift) in Pfad, Query oder Subdomain der selbst bestimmten Startadresse erreicht deren
 *  Host ungeprüft – Site-Bindung T9, Netzschicht der Browser-Maschine und die Freigabe beim Absenden (E-1160) greifen erst danach. */
const IBAN_LAENGE = { AD: 24, AT: 20, BE: 16, BG: 22, CH: 21, CY: 28, CZ: 24, DE: 22, DK: 18, EE: 20, ES: 24, FI: 18, FR: 27, GB: 22, GI: 23, GR: 27, HR: 21, HU: 28, IE: 22, IS: 26, IT: 27,
  LI: 21, LT: 20, LU: 20, LV: 21, MC: 27, MT: 31, NL: 18, NO: 15, PL: 28, PT: 25, RO: 24, SE: 24, SI: 19, SK: 24, SM: 27, VA: 22 };
const IBAN_KANDIDAT = /(?<![A-Za-z0-9])[a-z]{2}\d{2}(?:[^\p{L}\p{N}_/]{0,3}[a-z0-9]{4}){2,7}(?:[^\p{L}\p{N}_/]{0,3}[a-z0-9]{1,3})?(?![A-Za-z0-9])/giu;
const ibanGueltig = (t) => { const k = t.replace(/[^A-Za-z0-9]/g, "").toUpperCase(); if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(k) || (IBAN_LAENGE[k.slice(0, 2)] ?? k.length) !== k.length) return false;
  let m = 0; for (const c of k.slice(4) + k.slice(0, 4)) for (const d of /\d/.test(c) ? c : String(c.charCodeAt(0) - 55)) m = (m * 10 + Number(d)) % 97; return m === 1; };
const START_MAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/u, START_ZIFFERN = /\p{N}(?:[^\p{L}\p{N}]*\p{N}){7}/u;
const prozentEinmal = (t) => t.replace(/(?:%[0-9a-f]{2})+/gi, (lauf) => new TextDecoder("utf-8").decode(Uint8Array.from(lauf.match(/[0-9a-f]{2}/gi) ?? [], (h) => parseInt(h, 16))));
/** Dekodierstufen (wortgleich als stufen in symbiose-schemata.ts): roh, NFKC, je Runde dekodiert, NFKC und ohne Formatzeichen (\p{Cf}); null = nach drei Runden noch %XX. */
const dekodierStufen = (t) => { let x = t.normalize("NFKC"); const s = new Set([t, x, x.replace(/\p{Cf}/gu, "")]);
  for (let i = 0; i < 3 && /%[0-9a-f]{2}/i.test(x); i++) { const d = prozentEinmal(x); x = d.normalize("NFKC"); s.add(d).add(x).add(x.replace(/\p{Cf}/gu, "")); }
  return /%[0-9a-f]{2}/i.test(x) ? null : [...s]; };
export function startFrei(url) {
  const roh = String(url ?? ""), w = /^https:\/\/[^\s"<>\\#]+$/.test(roh) ? webAdresse(roh) : null, stufen = w ? dekodierStufen(w.slice(8).replace(/\+/g, " ")) : null;
  return !!stufen && !stufen.some((t) => START_MAIL.test(t) || START_ZIFFERN.test(t) || [...t.matchAll(IBAN_KANDIDAT)].some((m) => ibanGueltig(m[0])));
}
/** A-626 WEB (Go Bauherr 21.10.2026): nur in den Aufträgen aus WEB_ARTEN (A-782), nur lesen. WebSearch mit unverfänglichem Suchtext (mode = Suchstufe des Werkzeugs, z. B. standard/extended, erster Live-Lauf 21.10.); WebFetch nur mit einer Adresse aus lease.web – nie selbst gebaut. */
export function webPruefen(name, ti) {
  if (!WEB_ARTEN.has(leaseArt())) return nein(name, "Web nur in Arbeits-, Prüf- und Antwortaufträgen (Lease aus arbeit_holen).");
  if (name === "WebSearch") return NUR(ti, ["query", "allowed_domains", "blocked_domains", "mode"]) && (ti.mode === undefined || (typeof ti.mode === "string" && /^[a-z_]{1,20}$/.test(ti.mode))) && typeof ti.query === "string" && ti.query.trim() !== "" && ti.query.length <= 200 && !SUCHE_VERTRAULICH.test(ti.query)
    && [ti.allowed_domains, ti.blocked_domains].every((d) => d === undefined || (Array.isArray(d) && d.length <= 20 && d.every((x) => typeof x === "string" && /^[a-z0-9.-]{1,253}$/i.test(x))))
    ? frei() : nein(name, "Suchtext 1–200 Zeichen ohne Mailadresse, IBAN oder lange Nummer – keine Mandantendaten an den Suchdienst.");
  return NUR(ti, ["url", "prompt", "offset"]) && (ti.offset === undefined || (Number.isInteger(ti.offset) && ti.offset >= 0)) && leaseWeb().includes(webAdresse(ti.url)) ? frei()
    : nein(name, "nur Adressen aus dem Auftrag, aus WebSearch-Treffern oder Links einer schon geöffneten Seite – unverändert übernommen, nie selbst gebaut.");
}
function leaseRoh() {
  try { const l = JSON.parse(readFileSync(join(projektDir(), ".exava", "lease.json"), "utf8")); return /^[0-9a-f-]{36}$/i.test(String(l.job_id)) && typeof l.lease_token === "string" && typeof l.art === "string" ? l : null; } catch { return null; }
}
const NUR = (ti, felder) => ti && typeof ti === "object" && !Array.isArray(ti) && Object.keys(ti).every((k) => felder.includes(k));
const ID = (x) => typeof x === "string" && /^[A-Za-z0-9_-]{6,200}$/.test(x), INBOX = (x) => Array.isArray(x) && x.length === 1 && x[0] === "INBOX";
/** A-534: Dateiname exakt nach buildFilename_ der Pipeline v3.4 (docs/pipeline_v34.gs): Datum__Entity__TYP__Partner__Details[__Nr_x][__WÄHRUNG_Betrag]__#hash8.pdf,
 *  Blöcke wie sanitizeBlock_ (kein „__“, kein Leerraum, keine <>:"/\|?*), Entity ≤ 48, Nr ≤ 24, gesamt ≤ 200 + Endung. */
export const ABLAGE_TYPEN = ["RECHNUNG", "MAHNUNG", "LIEFERSCHEIN", "BESCHEID", "VERTRAG", "BANK", "STEUER", "GERICHT", "BEHOERDE", "PERSONAL", "NOTAR", "ASSET", "VERSICHERUNG", "MEDIZIN", "KORRESPONDENZ"];
// A-536 Punkt 7: JJJJ-MM-TT_Gesellschaft_Absender_Dokumenttyp[_Betrag]__#hash8.pdf – Blöcke ohne „_“ (Leerraum wird „-“), Betrag z. B. EUR1.234,56
const TEIL = String.raw`[^_/\\<>:"|?*\x00-\x20]+`;
const ABLAGE_RE = new RegExp(String.raw`^\d{4}-\d{2}-\d{2}_(${TEIL})_(${TEIL})_(?:${ABLAGE_TYPEN.join("|")})(?:_[A-Z]{3}-?\d{1,3}(?:\.\d{3})*,\d{2})?__#[0-9a-f]{8}\.([A-Za-z]{3,4})$`);
/** A-531 HOOK-AUDIT O1: Ordner, die die Ablage anlegen darf (Eingang wie bisher; Archiv/03_FINAL_ARCHIV nur in einem bestätigten eigenen Ordner). */
export const ABLAGE_ORDNER = ["Eingang", "Archiv", "03_FINAL_ARCHIV"];
export const ablageName = (n, endung) => { const m = ABLAGE_RE.exec(String(n)); return !!m && n.length <= 201 + m[3].length && m[1].length <= 48 && m[2].length <= 60 && (endung ? m[3] === endung : /^(?:pdf|PDF)$/.test(m[3])); };
/** A-642 OFFICE: Endung → MIME eines Mail-Anhangs für den Upload-Platzhalter (wie ANHANG_MIME in x-ausfuehrung.mjs, dort mit Magic Bytes); keine Makro-Formate. */
export const ANHANG_MIME = { pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", csv: "text/csv", odt: "application/vnd.oasis.opendocument.text", ods: "application/vnd.oasis.opendocument.spreadsheet", rtf: "application/rtf",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic" }; // A-655: Beleg-Fotos und Scans (nie .ics/.vcf)
const anhangEndung = (b) => /^@arbeit\/[A-Za-z0-9._-]{1,140}(?:__#[0-9a-f]{8})?\.(pdf|docx?|xlsx?|csv|odt|ods|rtf|jpe?g|png|webp|heic)$/.exec(String(b))?.[1];
/** A-534: enge Ausnahmen für Kernregeln 9–11; null = Werkzeug nicht betroffen (dann gilt der Vertrag), sonst frei/nein. */
export function hygieneAusnahme(server, werkzeug, ti) {
  const art = { gmail: ["unmark_message_spam", "unmark_thread_spam", "unlabel_message", "unlabel_thread", "update_message_labels"], google_drive: ["update_file", "create_file", "copy_file"] }[server]?.includes(werkzeug)
    ? (server === "gmail" ? "postfach_hygiene" : "ablage") : null;
  if (!art) return null;
  const n = `${server}/${werkzeug}`;
  if (leaseArt() !== art) return nein(n, `nur in einem Auftrag „${art}“ (Lease aus arbeit_holen).`);
  const ok = werkzeug === "unmark_message_spam" ? NUR(ti, ["messageId"]) && ID(ti.messageId)
    : werkzeug === "unmark_thread_spam" ? NUR(ti, ["threadId"]) && ID(ti.threadId)
    : werkzeug === "unlabel_message" ? NUR(ti, ["messageId", "labelIds"]) && ID(ti.messageId) && INBOX(ti.labelIds)
    : werkzeug === "unlabel_thread" ? NUR(ti, ["threadId", "labelIds"]) && ID(ti.threadId) && INBOX(ti.labelIds)
    : werkzeug === "update_message_labels" ? NUR(ti, ["messageId", "removeLabelIds"]) && ID(ti.messageId) && INBOX(ti.removeLabelIds)
    : werkzeug === "update_file" ? NUR(ti, ["fileId", "name", "title", "addParents", "removeParents", "parentId"]) && ID(ti.fileId) // A-659: der Drive-Connector nimmt title/parentId (wie copy_file), name/addParents bleiben gültig
      && (ti.name === undefined || ti.title === undefined) && (ti.addParents === undefined || ti.parentId === undefined) && [ti.name, ti.title].every((x) => x === undefined || ablageName(x))
      && [ti.addParents, ti.removeParents, ti.parentId].every((x) => x === undefined || ID(x)) && [ti.name, ti.title, ti.addParents, ti.parentId].some((x) => x !== undefined)
      && (ti.removeParents === undefined || ti.addParents !== undefined) && [ti.addParents, ti.parentId].every((x) => x === undefined || leaseOrdner().includes(x)) // G7: nur in bestätigte eigene Ordner
    : werkzeug === "copy_file" ? NUR(ti, ["fileId", "title", "name", "parentId", "parents"]) && ID(ti.fileId) && (ti.title === undefined) !== (ti.name === undefined) && ablageName(ti.title ?? ti.name) // A-638: Anhang über ~7 MB als Kopie derselben Datei (gleicher __#hash8; Bindung prüft x-ausfuehrung.mjs), Feldnamen wie create_file oder update_file
      && (ti.parentId === undefined) !== (ti.parents === undefined) && typeof leaseRoh()?.archiv === "string" && (ti.parentId ?? (Array.isArray(ti.parents) && ti.parents.length === 1 ? ti.parents[0] : null)) === leaseRoh().archiv
    : /\.zip$/i.test(String(ti.base64Content ?? "")) ? NUR(ti, ["title", "parentId", "contentMimeType", "base64Content", "disableConversionToGoogleType"]) && !!leaseDatev() // A-818 (G5): DATEV-Paket nur als Platzhalter
      && ti.base64Content === `@arbeit/${leaseDatev().name}.zip` && String(ti.title).startsWith(`${leaseDatev().name}__#`) && /^__#[0-9a-f]{8}\.zip$/.test(String(ti.title).slice(leaseDatev().name.length)) // (Inhalt, Hash und Größe prüft x-ausfuehrung.mjs)
      && ti.contentMimeType === "application/zip" && ti.disableConversionToGoogleType === true && typeof leaseRoh()?.datev_ziel === "string" && ti.parentId === leaseRoh().datev_ziel // nur der bestätigte Monatsordner
    : ti.base64Content !== undefined ? NUR(ti, ["title", "parentId", "contentMimeType", "base64Content", "disableConversionToGoogleType"]) && ablageName(ti.title, anhangEndung(ti.base64Content)) // A-615: Mail-Anhang nur als Platzhalter (Inhalt setzt x-ausfuehrung.mjs), nur nach 00-EXAVA/Archiv
      && !!anhangEndung(ti.base64Content) && ti.contentMimeType === ANHANG_MIME[anhangEndung(ti.base64Content)] && ti.disableConversionToGoogleType === true // A-642 OFFICE: Endung, Titel und MIME passen zusammen
      && typeof leaseRoh()?.archiv === "string" && ti.parentId === leaseRoh().archiv
    : NUR(ti, ["name", "mimeType", "parents", "parentId"]) && ti.mimeType === "application/vnd.google-apps.folder" && (ABLAGE_ORDNER.includes(ti.name) || !!leaseDatev()?.ordner.includes(ti.name)) // A-818: die drei Ordner des DATEV-Pakets
      && (ti.parentId === undefined || ID(ti.parentId)) && (ti.parents === undefined || (Array.isArray(ti.parents) && ti.parents.length === 1 && ID(ti.parents[0])))
      && [ti.parentId, ti.parents?.[0]].every((x) => x === undefined || leaseOrdner().includes(x)) // HOOK-AUDIT F3 (G7): Elternordner nur ein bestätigter eigener Ordner
      && (ti.name === "Eingang" || ti.parentId !== undefined || ti.parents !== undefined); // O1: Archiv/03_FINAL_ARCHIV nie ohne Elternordner
  return ok ? frei() : nein(n, "nur in engster Form: Spam aufheben, INBOX entfernen, Datei umbenennen/verschieben (Namensschema JJJJ-MM-TT_Gesellschaft_Absender_Dokumenttyp[_Betrag]__#hash8, Ziel nur ein per get_file_permissions bestätigter eigener Ordner), Ordner „Eingang“, „Archiv“ oder „03_FINAL_ARCHIV“ anlegen (Elternordner nur ein bestätigter eigener), Mail-Anhang als „@arbeit/<datei>.<pdf|docx|xlsx|…>“ nach 00-EXAVA/Archiv hochladen oder über ~7 MB als Kopie derselben eigenen Drive-Datei (gleicher __#hash8) dorthin kopieren, DATEV-Paket als „@arbeit/<name>.zip“ in seinen bestätigten Monatsordner (Ordner nur aus job.bezug.datev_paket) – kein anderer Inhalt, keine Rechte.");
}
export const EINGEBAUT = new Set(["Read", "Glob", "Grep", "Skill", "ToolSearch", "TodoWrite", "SubagentHandback"]); // A-919: Rückgabe eines Helfers – trägt im Hook nicht immer agent_type, gibt nur Text an den Aufrufer
/** Entwurf #1182: claude.ai-Connectoren können statt eines Namens eine UUID tragen (`mcp__4553787f-…__send_message`, nach mcpTeile mit „_“). */
export const UUID_SERVER = /^[0-9a-f]{8}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{12}$/;

/** `mcp__EXAVA Hintergrund__arbeit_holen` / `mcp__Google-Drive__share_file` → { server: "exava_hintergrund" | "google_drive", werkzeug } (Werkzeugname exakt); sonst null. */
export function mcpTeile(name) {
  const t = /^mcp__(.+?)__(.+)$/.exec(String(name ?? ""));
  return t ? { server: t[1].toLowerCase().replace(/[\s-]/g, "_"), werkzeug: t[2] } : null;
}

/** A-531 AUSFUEHRUNG: wortgleich in x-ausfuehrung.mjs (scripts/test/a529-vorlage.ts prüft die Gleichheit). */
export function gesteuert(t) { return !!t && ((t.server === "gmail" && (t.werkzeug === "send_message" || t.werkzeug === "reply")) || (!/(^|_)(gmail|(google_)?drive|google_calendar)$/.test(t.server) && !t.server.startsWith("exava") && !/^[0-9a-f]{8}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{12}$/.test(t.server) && /^[a-z0-9_]+$/.test(t.server) && /^[A-Za-z0-9_.-]+$/.test(t.werkzeug) && !lesend(t.werkzeug))); }

/** Werkzeugvertrag prüfen und liefern; wirft bei jeder Abweichung (fail closed). Wortgleich mit symbiose-policy.mjs. */
export function vertragPruefen(v) {
  if (!v || typeof v !== "object" || typeof v.version !== "string" || !v.server || typeof v.server !== "object") throw new Error("Werkzeugvertrag ohne version/server");
  for (const s of VERTRAG_SERVER) {
    const w = v.server[s];
    if (!w || typeof w !== "object") throw new Error(`Werkzeugvertrag ohne Server ${s}`);
    for (const [n, e] of Object.entries(w)) {
      if (!e || !["lesen", "versand", "gesperrt"].includes(e.klasse) || !Array.isArray(e.profile) || !Array.isArray(e.felder)) throw new Error(`Werkzeugvertrag: Eintrag ${s}/${n} unlesbar`);
    }
  }
  return v;
}
export const vertragLesen = (url = new URL("./provider-vertrag.json", import.meta.url)) => vertragPruefen(JSON.parse(readFileSync(url, "utf8")));

const hat = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const frei = () => ({ code: 0 });
const nein = (werkzeug, grund) => ({ code: 2, stderr: `Gesperrt (EXAVA-Hintergrund): ${String(werkzeug).slice(0, 120)} – ${grund}` });
/** A-531 F1: fremder Connector (auch UUID) – EXAVA-Name gesperrt, lesend frei, sonst capability_missing (fail closed). */
const fremdLesend = (name, werkzeug, ti) => EXAVA_BEKANNT.has(werkzeug) || EXAVA_WERKZEUGE.has(werkzeug) ? nein(name, "EXAVA-Werkzeug nur vom Connector „EXAVA Hintergrund“.")
  : !lesend(werkzeug) ? nein(name, "capability_missing: fremder Connector nur lesend; schreiben, senden, anlegen und löschen sind gesperrt.")
  : eingabeLesend(werkzeug, ti) ? frei() : nein(name, "capability_missing: fetch/query mit schreibender Eingabe (Methode ≠ GET/HEAD, Body, SQL außer einer select/with-Anweisung) – nur als Werkzeug-Entwurf (save_draft, Entwurfsart werkzeug) mit Freigabe im Dashboard.");

/** A-882 S3 (A-626, G8), A-905 (E-1166): browser_starten öffnet die Adresse auf EXAVAs Browser-Maschine und legt die Site fest, auf der getippt wird – nur in Aufträgen mit Web,
 *  ohne #-Teil (webAdresse vergleicht ohne ihn); unverändert aus lease.web (Auftrag, WebSearch-Treffer, Links einer geöffneten Seite) oder von Claude bestimmt nach startFrei;
 *  jedes andere EXAVA-Werkzeug unverändert frei. */
const startAdresse = (name, werkzeug, ti) => werkzeug !== "browser_starten" || (WEB_ARTEN.has(leaseArt()) && !String(ti?.url ?? "").includes("#") && (leaseWeb().includes(webAdresse(ti?.url)) || startFrei(ti?.url))) ? frei()
  : nein(name, "Startadresse nur https mit Domain (keine IP, kein interner Host, kein Port, keine Anmeldedaten), ohne #-Teil und ohne Mailadresse, IBAN oder lange Nummer (A-905) – sonst die Startseite ohne solche Teile wählen, Unterseiten per browser_handeln.");
/** A-901 Lease-Weitergabe: ingest_document aus dem Helfer x-scan nur mit vollständiger Lease des laufenden Auftrags (.exava/lease.json, schreibt nur x-ausfuehrung.mjs nach arbeit_holen)
 *  und nur mit den Feldern des Werkzeugs; job_id, lauf_id, lease_generation und lease_token setzt der Hook per updatedInput (Werte des Helfers werden ersetzt). Profil, Auftrag,
 *  Lease und Quelle prüft der Server (hintergrundBindung, brain_lease_pruefen). Ohne gültige Lease gesperrt (fail closed). */
const UUID_LEASE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A-901 Teil 2 (Gegenprüfung #2125): Bindung Helfer → Auftrag. Beim ersten Aufruf eines Helfers (agent_id) merkt der Hook die job_id der laufenden Lease in .exava/helfer-<sha256>.json
 *  (exklusiv angelegt, nie überschrieben). scanIngest gibt die Lease nur an einen Helfer dieses Auftrags weiter – auch wenn Claude Code einen synchronen Helfer nach 120 s in den
 *  Hintergrund schiebt (CLAUDE_AUTO_BACKGROUND_TASKS), übergibt er nach dem Auftragswechsel nichts unter der Lease des Folgeauftrags. */
const helferDatei = (agentId) => join(projektDir(), ".exava", `helfer-${createHash("sha256").update(String(agentId)).digest("hex").slice(0, 32)}.json`);
export function helferBinden(agentId) {
  const l = leaseRoh();
  if (typeof agentId !== "string" || !agentId || !l || !UUID_LEASE.test(String(l.job_id)) || !existsSync(join(projektDir(), ".exava"))) return;
  try { writeFileSync(helferDatei(agentId), JSON.stringify({ job_id: l.job_id }), { flag: "wx" }); } catch { /* schon gebunden (EEXIST) oder nicht schreibbar: die erste Bindung gilt */ }
}
export const helferAuftrag = (agentId) => { try { const p = helferDatei(agentId); return typeof agentId === "string" && agentId && lstatSync(p).isFile() ? JSON.parse(readFileSync(p, "utf8"))?.job_id ?? null : null; } catch { return null; } };
export function scanIngest(name, ti, agentId) {
  const l = leaseRoh();
  if (!NUR(ti, SCAN_INGEST_FELDER)) return nein(name, `im Helfer ${SCAN_AGENT} nur ${SCAN_EXAVA} mit den Feldern des Werkzeugs.`);
  if (!l || !UUID_LEASE.test(String(l.job_id)) || !UUID_LEASE.test(String(l.lauf_id)) || !Number.isInteger(l.lease_generation) || l.lease_generation < 1 || !/^[A-Za-z0-9_-]{20,200}$/.test(l.lease_token))
    return nein(name, `im Helfer ${SCAN_AGENT} nur mit der Lease des laufenden Auftrags (arbeit_holen).`);
  if (helferAuftrag(agentId) !== l.job_id) return nein(name, `im Helfer ${SCAN_AGENT} nur für den Auftrag, unter dem er gestartet wurde – nach einem Auftragswechsel übergibt er nichts mehr.`); // A-901 Teil 2
  return { code: 0, stdout: JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", permissionDecisionReason: "A-901 Lease aus .exava/lease.json",
    updatedInput: { ...ti, job_id: l.job_id, lauf_id: l.lauf_id, lease_generation: l.lease_generation, lease_token: l.lease_token } } }) };
}
/** Entscheidung für eine Hook-Eingabe (JSON-Text). `vertrag` ist austauschbar (Test). Liefert { code, stderr?, stdout? } (stdout nur für die Lease-Weitergabe an x-scan, A-901). */
export function entscheide(roh, { vertrag } = {}) {
  let eingabe;
  try { eingabe = JSON.parse(roh); } catch { return { code: 2, stderr: "Gesperrt (EXAVA-Hintergrund): Hook-Eingabe nicht lesbar." }; }
  if (!eingabe || typeof eingabe !== "object" || typeof eingabe.tool_name !== "string" || !eingabe.tool_name) return { code: 2, stderr: "Gesperrt (EXAVA-Hintergrund): Hook-Eingabe ohne tool_name." };
  const name = eingabe.tool_name, teile = mcpTeile(name);
  const scan = eingabe.agent_type != null; // A-532: Aufruf aus einem Helfer (agent_type laut Hook-Eingabe); nur x-scan, sonst gesperrt
  if (scan && !HELFER.has(eingabe.agent_type)) return nein(name, `Helfer ${String(eingabe.agent_type).slice(0, 60)} nicht freigegeben (nur ${SCAN_AGENT}, ${TRIAGE_AGENT}).`);
  if (scan) helferBinden(eingabe.agent_id); // A-901 Teil 2: der erste Aufruf bindet den Helfer an den laufenden Auftrag
  const ag = eingabe.tool_input; // A-901 Teil 2: nur im Vordergrund und nur mit SCAN_AGENT_FELDER
  if (name === "Agent" || name === "Task") return !scan && NUR(ag, SCAN_AGENT_FELDER) && HELFER.has(ag.subagent_type) && ag.run_in_background === false && typeof ag.prompt === "string" && ag.prompt.trim() !== ""
    ? frei() : nein(name, `nur die Helfer ${SCAN_AGENT} und ${TRIAGE_AGENT} mit subagent_type, prompt, description und run_in_background: false (nie im Hintergrund, kein model/effort), aus dem Helfer kein weiterer.`);
  if (!teile && !scan && name === "Bash") return bashPruefen(eingabe.tool_input);
  if (!teile && !scan && (name === "Write" || name === "Edit")) return schreibPruefen(name, eingabe.tool_input);
  if (!teile && !scan && (name === "WebSearch" || name === "WebFetch")) return webPruefen(name, eingabe.tool_input); // A-626 WEB
  if (!teile) return (scan ? SCAN_EINGEBAUT : EINGEBAUT).has(name) ? frei() : nein(name, "nur Read, Glob, Grep, Skill, ToolSearch, TodoWrite (Shell nur in festen Formen, Web nur in Arbeits-, Prüf- und Antwortaufträgen, Schreiben nur unter arbeit/, Helfer nur x-scan).");
  if (scan && eingabe.agent_type === SCAN_AGENT && teile.server === EXAVA_SERVER && teile.werkzeug === SCAN_EXAVA) return scanIngest(name, eingabe.tool_input, eingabe.agent_id); // A-901: genau dieses EXAVA-Werkzeug, Lease vom Hook
  if (scan && (teile.server === EXAVA_SERVER || teile.server.startsWith("exava") || gesteuert(teile))) return nein(name, `im Helfer ${SCAN_AGENT} nur ${SCAN_EXAVA} von „EXAVA Hintergrund“, keine anderen EXAVA- und keine Schreibwerkzeuge.`);
  if (teile.server === EXAVA_SERVER) return EXAVA_WERKZEUGE.has(teile.werkzeug) ? startAdresse(name, teile.werkzeug, eingabe.tool_input) : nein(name, "EXAVA-Werkzeug nicht für die Hintergrundarbeit freigegeben.");
  if (gesteuert(teile) && !EXAVA_WERKZEUGE.has(teile.werkzeug) && !EXAVA_BEKANNT.has(teile.werkzeug)) return frei(); // A-531 AUSFUEHRUNG: Entscheidung bei x-ausfuehrung.mjs (Lease + Freigabe)
  if (teile.server === "exava") return nein(name, "die normale Verbindung „EXAVA“ ist in der Hintergrundarbeit gesperrt; EXAVA-Werkzeuge nur vom Connector „EXAVA Hintergrund“.");
  let server = teile.server, v;
  if (UUID_SERVER.test(server)) { // #1182: UUID-Name → der eine Vertragsserver, der genau dieses Werkzeug kennt; keiner oder mehrere → gesperrt
    v = vertrag ?? vertragLesen();
    const treffer = [...VERTRAG_SERVER].filter((s) => hat(v.server[s], teile.werkzeug));
    // Hauptsession 16.10.2026 (#1195): „EXAVA Hintergrund“ kann ebenfalls mit UUID erscheinen → nur die EXAVA_WERKZEUGE und nur ohne Namensgleichheit mit einem Vertragswerkzeug;
    // EXAVA erzwingt Profil, Lease und Rechte serverseitig (dieser Hook ist dort die zweite Schicht). Jedes andere EXAVA-Werkzeug per UUID bleibt gesperrt.
    if (treffer.length === 0 && scan) return teile.werkzeug === SCAN_EXAVA && eingabe.agent_type === SCAN_AGENT ? scanIngest(name, eingabe.tool_input, eingabe.agent_id) : nein(name, `im Helfer ${SCAN_AGENT} nur Drive und Gmail lesend.`); // A-901: wie EXAVA_WERKZEUGE per UUID
    if (treffer.length === 0 && EXAVA_WERKZEUGE.has(teile.werkzeug)) return startAdresse(name, teile.werkzeug, eingabe.tool_input);
    if (treffer.length === 0) return fremdLesend(name, teile.werkzeug, eingabe.tool_input);
    if (treffer.length !== 1) return nein(name, "capability_missing: Connector mit UUID-Namen, Werkzeug mehrdeutig, gesperrt bis geprüft.");
    server = treffer[0];
  }
  if (scan && !SCAN_SERVER.has(server)) return nein(name, `im Helfer ${SCAN_AGENT} nur Drive und Gmail lesend.`);
  if (!VERTRAG_SERVER.has(server)) return server.startsWith("exava") ? nein(name, "EXAVA-Werkzeuge nur vom Connector „EXAVA Hintergrund“.") : fremdLesend(name, teile.werkzeug, eingabe.tool_input);
  v ??= vertrag ?? vertragLesen();
  const e = hat(v.server[server], teile.werkzeug) ? v.server[server][teile.werkzeug] : null;
  if (!e) return nein(name, `nicht im Werkzeugvertrag (${v.version}), gesperrt bis geprüft.`);
  const hy = scan ? null : hygieneAusnahme(server, teile.werkzeug, eingabe.tool_input ?? {}); // A-534
  if (hy) return hy;
  if (e.klasse !== "lesen" || !e.profile.includes(PROFIL)) return nein(name, "nur lesen: senden, Entwürfe, Labels, teilen, schreiben und löschen sind gesperrt.");
  const ti = eingabe.tool_input ?? {};
  if (typeof ti !== "object" || Array.isArray(ti)) return nein(name, "Werkzeugeingabe nicht lesbar.");
  const fremd = Object.keys(ti).filter((k) => !e.felder.includes(k));
  if (fremd.length) return nein(name, `Feld ${fremd[0].slice(0, 60)} nicht geprüft.`);
  return frei();
}

/** A-907 Fehler-Radar: arbeit/hook-blocks.jsonl bleibt klein – darüber wird nichts mehr angehängt (die Routine meldet die Zeilen ohnehin mit heartbeat_job, complete_job oder arbeit_holen). */
export const BLOCK_DATEI_MAX = 64 * 1024;
/** G8: kurz und geschwärzt – angeschnittenes letztes Wort weg, dann IBAN, Mailadresse, Schlüssel/Token (samt Schema-Wort davor, z. B. „Authorization: <Schema> <Token>“), Dateien
 *  unter arbeit/, lange Zeichen- und Ziffernfolgen (EXAVA schwärzt erneut). */
const kurzGeschwaerzt = (s, max) => { const t = String(s ?? "").replace(/\s+/g, " ").trim(); return (t.length > max ? t.slice(0, max).replace(/\S*$/, "") : t)
  .replace(/\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,3})?\b/g, "[IBAN]").replace(/\S+@\S+/g, "[E-Mail]")
  .replace(/\b(token|api[-_]?key|secret|passwor[dt]|session|cookie|authorization)\b\s*[:=]\s*(?:[A-Za-z]+\s+)?\S+/gi, "$1=[…]").replace(/\barbeit\/\S+/g, "arbeit/[Datei]")
  .replace(/[\w+\/=-]{24,}/g, "[…]").replace(/\d{6,}/g, "[Zahl]").trim(); };
/** A-907: Zeile für arbeit/hook-blocks.jsonl zu einem Exit 2 – Zeit, Werkzeug (≤ 64) und Sperrgrund ohne Eingabewerte (≤ 300); nur bei Bash steht davor der Kurzbefehl
 *  (≤ 120, ohne Query/Fragment, geschwärzt). null = kein Block. */
export function blockZeile(roh, r, jetzt = new Date()) {
  if (!r || r.code !== 2) return null;
  let e = null; try { e = JSON.parse(roh); } catch { /* unlesbar: Werkzeug unbekannt */ }
  const name = typeof e?.tool_name === "string" ? e.tool_name : "", vor = `${name.slice(0, 120)} – `;
  let grund = String(r.stderr ?? "").replace(/^Gesperrt \(EXAVA-Hintergrund\): /, "");
  if (name && grund.startsWith(vor)) grund = grund.slice(vor.length);
  const befehl = name === "Bash" && typeof e?.tool_input?.command === "string" ? kurzGeschwaerzt(e.tool_input.command.replace(/[?#]\S*/g, ""), 120) : "";
  return JSON.stringify({ zeit: jetzt.toISOString(), werkzeug: name.replace(/[^\w.:-]/g, "").slice(0, 64) || "?", grund: kurzGeschwaerzt(befehl ? `${befehl} – ${grund}` : grund, 300) });
}
/** A-907: nur anhängen, nur im Hook-Lauf von Claude Code (CLAUDE_PROJECT_DIR gesetzt – Tests ohne Projekt schreiben nichts), nie über einen Symlink, nie über BLOCK_DATEI_MAX;
 *  jeder Fehler wird ignoriert – der Block selbst bleibt Exit 2. */
export function blockMerken(zeile) {
  try {
    if (!zeile || !process.env.CLAUDE_PROJECT_DIR) return;
    const dir = join(projektDir(), "arbeit"), datei = join(dir, "hook-blocks.jsonl");
    mkdirSync(dir, { recursive: true });
    if (lstatSync(dir).isSymbolicLink() || (existsSync(datei) && (lstatSync(datei).isSymbolicLink() || lstatSync(datei).size > BLOCK_DATEI_MAX))) return;
    appendFileSync(datei, zeile + "\n");
  } catch { /* nie den Block ändern */ }
}

function hauptprogramm() {
  let roh = "";
  const ende = (r) => { if (r.code === 2) blockMerken(blockZeile(roh, r)); if (r.stderr) process.stderr.write(r.stderr); if (r.stdout && r.code === 0) return process.stdout.write(r.stdout, () => process.exit(0)); process.exit(r.code); }; // A-901: updatedInput (Lease für x-scan); A-907: Exit 2 → arbeit/hook-blocks.jsonl
  const absturz = (f) => ende({ code: 2, stderr: `Gesperrt (EXAVA-Hintergrund): Hook-Fehler (${String(f?.message ?? f).slice(0, 200)}).` });
  process.on("uncaughtException", absturz);
  process.on("unhandledRejection", absturz);
  const frist = Math.min(FRIST_MS, Number(process.env.X_HOOK_FRIST_MS) || FRIST_MS); // nur verkürzbar (Test)
  setTimeout(() => ende({ code: 2, stderr: "Gesperrt (EXAVA-Hintergrund): Prüfung dauerte zu lange." }), frist);
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (c) => { roh += c; if (roh.length > 4 << 20) absturz(new Error("Hook-Eingabe zu groß")); });
  process.stdin.on("error", absturz);
  process.stdin.on("end", () => { try { ende(entscheide(roh)); } catch (f) { absturz(f); } });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) hauptprogramm();
