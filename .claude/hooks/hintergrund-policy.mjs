#!/usr/bin/env node
// PreToolUse-Hook „hintergrund-policy“ (A-529 VORLAGE) für JEDES Werkzeug (Matcher .*), erster PreToolUse-Eintrag in settings.json des Repos exava-hintergrund.
// Herkunft: docs/x2/spike/mandant-repo/_claude/hooks/symbiose-policy.mjs (mcpTeile, vertragPruefen, Hauptprogramm mit Frist; Vertragsprüfung Klasse/Profil/Felder) und die
// UUID-Zuordnung aus Entwurf #1182 (Zweig a528-hook-namen, UUID_SERVER und Treffer über den eindeutigen Werkzeugnamen; per UUID zusätzlich die EXAVA-Werkzeuge aus EXAVA_WERKZEUGE), kopiert und angepasst; das Original bleibt unverändert (Altweg).
// Unterschied: kein Token und kein Profil aus der Umgebung – die Routine arbeitet immer im Profil recherche (Werkzeugvertrag provider-vertrag.json, Klasse lesen).
// ALLOWLIST (alles andere Exit 2 mit Klartext, auch unbekannte Server und Werkzeuge – fail closed):
//   eingebaut: Read, Glob, Grep, Skill, ToolSearch (lädt aufgeschobene Connector-Werkzeuge), TodoWrite; Bash, Write und Edit nur nach bashPruefen/schreibPruefen (A-531 DATEI),
//   weil die Shell im Netz „Trusted“ sonst ein Weg nach draußen und an .claude/ vorbei wäre;
//   A-534 (Kernregeln 9–11): Ablage (Drive am Ort umbenennen – A-924: nie verschieben, nie kopieren –, Ordner anlegen) und Postfach-Hygiene (Spam aufheben, INBOX entfernen) nur mit einer Lease der passenden Auftragsart
//   aus .exava/lease.json (schreibt nur x-ausfuehrung.mjs) und nur in engster Form (hygieneAusnahme); Löschen, Papierkorb, Teilen und Senden bleiben gesperrt;
//   A-993b Schritt 6 (Bauherr 06.11.2026): im Auftrag belegsuche Gmail nur über den Claude-Connector – untrash_message (nur messageId) für eine von EXAVA freigegebene Nachricht
//   (lease.korb_frei aus mail_archivieren ohne konto, mit Frist), die x-ausfuehrung.mjs mit Label TRASH und Datum ≤ 14 Tage gesehen hat (lease.korb_gesehen), höchstens KORB_MAX je Lauf;
//   danach nur INBOX entfernen für eine so zurückgeholte Nachricht (lease.korb_raus); mail_archivieren mit gerettet: true nur für Nachrichten aus lease.korb_fertig (korbAusnahme, korbMeldung);
//   A-996: ebenso im Auftrag postfach_hygiene für den Papierkorb-Schutzschild (Kernregel 18) – die Freigabe gibt EXAVA nur im Schutzschild-Lauf (bezug.schutzschild, nur executive);
//   A-532/A-914: Helfer (Agent, früher Task) nur mit subagent_type x-scan oder x-triage; im Helfer nur Read, ToolSearch und Lesewerkzeuge von Drive und Gmail (ingest_document nur x-scan), sonst kein Subagent;
//   und im Netz „Trusted“ wäre sie ein Weg nach draußen und an .claude/ vorbei;
//   A-901 (Bauherr 02.11.2026): dazu im Helfer genau ingest_document von „EXAVA Hintergrund“ (scanIngest) – die Lease setzt dieser Hook per updatedInput aus .exava/lease.json, der Helfer bekommt sie nie;
//   A-901 Teil 2: den Helfer nur im Vordergrund (run_in_background: false) und nur mit subagent_type, prompt, description starten (SCAN_AGENT_FELDER); sein erster Aufruf bindet
//   ihn an den laufenden Auftrag (.exava/helfer-<sha256>.json; außerdem schreibt dieser Hook nur .exava/verbrauch.json, A-1007 H, sowie A-1071 .exava/messung.jsonl und .exava/lesen-<sha256>.json) – nach einem Auftragswechsel keine Lease mehr für ihn;
//   A-930 (Weg A): dritter Helfer x-drive-batch (Ausführungsauftrag bezug.nur_ausfuehren) – im Helfer EXAVA nur ausfuehrung_liste, exava_datei_lesen und heartbeat_job (Lease per updatedInput
//   wie A-901), Drive lesend plus am Ort umbenennen und WhatsApp-Upload nach hygieneAusnahme (dieselben Prüfungen wie im Hauptlauf), Bash nur curl -o von der download_url (BASH_LADEN);
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
//   A-1007 Paket H (Bauherr 07.11.2026): complete_job von „EXAVA Hintergrund“ bekommt per updatedInput verbrauch – die Token-Ist-Werte des Claude-Abos für diesen Auftrag aus dem
//   Sitzungsprotokoll (transcript_path der Hook-Eingabe und Helfer-Protokolle; nur Zahlen und Modell, nie Inhalte) abzüglich des zuletzt gemeldeten Stands (.exava/verbrauch.json);
//   EXAVA bucht ihn als Abo-Verbrauch (ohne Betrag). Ein vom Modell mitgegebenes verbrauch fällt weg; ohne lesbares Protokoll, ohne Zustandsdatei oder wenn der Stand einer schon
//   abgeschlossenen Sitzung fehlt, kein verbrauch (lieber nichts als doppelt) – complete_job läuft immer weiter, nie ein Block.
//   A-1071 P1 (Messen, GO Bauherr 12.11.2026): Meldet arbeit_holen messung: 2 (Lease), trägt verbrauch zusätzlich Teile je Rolle (haupt, Helfertyp aus der Bindung), Modell und Stufe der
//   Protokollzeile (effort, perTurnEffort) mit Denk-Token und Antworten, Züge des Hauptprotokolls, Client, Stufe laut Hook (effort.level beim Abschluss, beim ersten Aufruf und je Aufruf aus
//   .exava/messung.jsonl), Umgebung (CLAUDE_CODE_EFFORT_LEVEL, CLAUDE_AUTO_BACKGROUND_TASKS – nur gemeldet) und Helfer (Starts, Rückgabe-Zeichen); auch bei ask_user ohne dokument_ids.
//   Verbrauch = Stand jetzt minus Stand bei Auftragsbeginn bei jedem Versuch (nicht mehr eingefroren); ohne messung die alte Form. Bei ingest_document aus x-scan setzt der Hook
//   gelesen_von (Leseweg aus .exava/lesen-<sha256>.json und Modell des Helfers). Jeder Mess- und Merkpfad wirft nie und ändert keine Entscheidung (G7); nur Zahlen und Namen (G8).
// Rein lokal, ohne Netz; Umgebungsvariablen nur für die Messung gelesen (A-1071). Fail closed: unlesbare Eingabe, Vertrag nicht lesbar, Absturz und Frist → Exit 2.
import { createHash } from "node:crypto";
import { appendFileSync, closeSync, existsSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const FRIST_MS = 10_000; // Skript endet spätestens nach 10 s (Hook-Timeout 30 s)
export const PROFIL = "recherche";
/** Kern-Server mit Werkzeugvertrag (wie symbiose-policy.mjs). */
export const VERTRAG_SERVER = new Set(["gmail", "google_drive", "google_calendar"]);
/** Servername des Connectors „EXAVA Hintergrund“ nach mcpTeile: Anzeigename klein, Leerzeichen und „-“ → „_“ (beobachtet: mcp__Google_Drive__ aus „Google Drive“, mcp__Google-Drive__ aus Routinen der Oberfläche). */
export const EXAVA_SERVER = "exava_hintergrund";
/** Werkzeugvertrag ABHOLEN (PROFIL_WERKZEUGE.hintergrund): arbeit_holen + recherche ohne claim_job und ohne prepare_file_upload; A-531 + genau ingest_document, ingest_facts, ingest_wiki (Profil ingest; welcher Auftrag sie nutzen darf, prüft der Server) und whatsapp_lesen (nur lesend, #1239); A-531 AUSFUEHRUNG get_approved_draft (nur lesend, nur im Versandauftrag – der Server prüft Profil und Lease); A-531 OFFENE-POSTEN-HG get_open_items (nur lesend wie read_knowledge; Profil, Auftrag, Lease prüft der Server); A-549 mail_lesen (nur lesend, nur IMAP); A-597 mail_archivieren (nur im Auftrag Postfach-Hygiene, Label Posteingang entfernen – Auftrag, Lease und Rechte prüft der Server). */
export const EXAVA_WERKZEUGE = new Set(["arbeit_holen", "heartbeat_job", "read_knowledge", "get_unmatched_transactions", "submit_evidence", "propose_booking", "save_draft", "ask_user", "complete_job", "ingest_document", "ingest_facts", "ingest_wiki", "whatsapp_lesen", "anrufnotizen_lesen", "get_approved_draft", "prepare_file_upload", "get_open_items", "mail_lesen", "mail_archivieren", "support_offen_lesen", "support_zuordnen", "regel_vorschlagen", "regel_postfaecher", "exava_datei_lesen", "rueckfragen_pruefen", "rueckfrage_im_postfach_erledigt", "belegsuche_ergebnis", "projekt_stand_lesen", "projekt_stand_setzen", "browser_starten", "browser_lesen", "browser_handeln", "browser_werte_melden", "browser_beenden", "ausfuehrung_liste"]); // A-930: Liste des Ausführungsauftrags (liest nur der Helfer x-drive-batch) // A-882 S3 browser_*: nur recherche-Auftrag mit job.bezug.browser, Absenden nur als Freigabe-Anforderung (prüft der Server) // A-787 regel_postfaecher: nur Arbeitsauftrag, Postfächer einer Mail-Automatisierung (prüft der Server) // A-706: Projektstand im Auftrag (Lease, Rechte und Gesellschaftsrecht prüft der Server) // A-607: Rückfragen nur im Auftrag Postfach-Hygiene abgleichen (prüft der Server); A-578 P4: nur Betreiber und nur Auftrag skill x-support (prüft der Server); A-600 FOLGE regel_vorschlagen: nur Arbeitsauftrag, Regel immer aus (prüft der Server); A-600 FOLGE exava_datei_lesen: nur Eingangsauftrag, nur lesend (Lease und Bezug prüft der Server)
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
/** A-930 (Weg A): dritter Helfer x-drive-batch (.claude/agents/x-drive-batch.md) – führt die fertig berechnete Liste des Ausführungsauftrags aus (gleiche Startregeln). */
export const DRIVE_AGENT = "x-drive-batch";
const HELFER = new Set([SCAN_AGENT, TRIAGE_AGENT, DRIVE_AGENT]);
/** A-930: EXAVA-Werkzeuge des Helfers x-drive-batch und ihre Felder (Verträge in lib/x/connector/symbiose-schemata.ts); job_id, lauf_id, lease_generation, lease_token setzt der Hook. */
export const DRIVE_EXAVA = { ausfuehrung_liste: ["seite"], exava_datei_lesen: ["dokument_id"], heartbeat_job: ["schritt", "drive_dateien", "hook_blocks"] }; // A-930d: hook_blocks meldet auch der Helfer (routine.md, A-907)
const SCAN_EINGEBAUT = new Set(["Read", "ToolSearch", "SubagentHandback"]), SCAN_SERVER = new Set(["gmail", "google_drive"]); // A-919: SubagentHandback = Rückgabeweg des Helfers an die Routine (Claude Code), ohne ihn kommt kein Ergebnis an
/** A-901: das eine EXAVA-Werkzeug des Helfers und seine Felder (Vertrag ingest_document, lib/x/connector/symbiose-schemata.ts); die vier Lease-Felder überschreibt scanIngest immer. */
export const SCAN_EXAVA = "ingest_document";
export const SCAN_INGEST_FELDER = ["job_id", "lauf_id", "lease_generation", "lease_token", "idempotency_key", "pipeline_version", "source_ref", "provider_version", "expected_source_version", "source_timestamp",
  "content_sha256", "extraction_id", "part_number", "pages", "total_pages", "final_part", "metadata"];
/** A-901 Teil 2 (Gegenprüfung #2113): den Helfer nur im Vordergrund starten – ohne run_in_background: false startet Claude Code ihn im Hintergrund, dann könnte er seinen Auftrag
 *  überdauern und ingest_document unter der Lease des Folgeauftrags rufen (scanIngest liest die Lease beim Aufruf). Nur diese Felder: kein model/effort (Haiku aus x-scan.md), keine isolation/name. */
export const SCAN_AGENT_FELDER = ["subagent_type", "prompt", "description", "run_in_background"];
/** A-531 DATEI: die drei erlaubten Shell-Formen (datei-upload.md §3.2), ganzer Befehl verankert; Prüfsumme des Renderers setzt der Generator. */
export const PDF_RENDERER_SHA256 = "62f9c0e6e6f9e460636b208330297b2a9cf31a31285f99b773135ee2c3f8cfa0", XLSX_RENDERER_SHA256 = "0643294b441c03a9948810b953ad65cf21ecde7184e0e24111a480c5aab95582"; // A-622 P3-A: Listen als .xlsx
const NAME = String.raw`[A-Za-z0-9._-]{1,140}(?:__#[0-9a-f]{8})?`, DATEI = String.raw`arbeit/${NAME}\.(?:pdf|json|csv|docx|xlsx)`;
const MIME = String.raw`(?:application/pdf|text/csv|application/vnd\.openxmlformats-officedocument\.(?:wordprocessingml\.document|spreadsheetml\.sheet))`;
export const BASH_PDF_MAIL = /^\/usr\/bin\/python3 -I \.claude\/tools\/pdf\.py --mail (arbeit\/gmail-([A-Za-z0-9_-]{6,120})\.eml) arbeit\/gmail-\2-mail\.pdf$/; // A-657 GO pdf.py: HTML-Belegmail 1:1
export const BASH_PDF = new RegExp(String.raw`^/usr/bin/python3 -I \.claude/tools/pdf\.py arbeit/${NAME}\.json arbeit/${NAME}\.pdf$`);
export const BASH_XLSX = new RegExp(String.raw`^/usr/bin/python3 -I \.claude/tools/xlsx\.py arbeit/${NAME}\.json arbeit/${NAME}\.xlsx$`);
const GELADEN = String.raw`arbeit/${NAME}\.(?:pdf|jpe?g|png|webp|heic|tiff?|docx?|xlsx?|csv|txt|odt|ods|rtf)`; // A-600 FOLGE: Eingang (x-eingang) – geladene Datei aus exava_datei_lesen; A-642 OFFICE: Formate der Anhang-Ablage
/** A-944 (Bauherr 04.11.2026): sha256sum über 1 bis 20 Dateien je Aufruf, je ein Leerzeichen. Die drei Formen sind disjunkt (DATEI liegt bis auf .json in GELADEN) – sonst verfolgt
 *  die Wiederholung bei einem Fehlschlag (z. B. 20 Dateien und „| cut“) exponentiell zurück (Sekunden statt < 1 ms). */
const SHA_DATEI = String.raw`(?:${GELADEN}|arbeit/${NAME}\.json|arbeit/drive-[A-Za-z0-9_-]{6,120}\.bin)`;
export const BASH_SHA = new RegExp(String.raw`^/usr/bin/sha256sum ${SHA_DATEI}(?: ${SHA_DATEI}){0,19}$`); // A-924 Erweiterung: Prüfsumme einer vom Hook geladenen Drive-Datei (Erstaufnahme)
export const BASH_WC = new RegExp(String.raw`^/usr/bin/wc -c ${SHA_DATEI}(?: ${SHA_DATEI}){0,19}$`); // A-944 Nachtrag (Bauherr 04.11.2026): Größe (size_bytes) derselben Dateien, lesend – auch Gmail-Anhänge
/** A-944: curl mit festem Timeout direkt hinter -q -sSf bzw. -q -sSfL (nicht fangend, Gruppen bleiben). ÜBERGANG: die alte Form ohne --max-time bleibt bis 11.11.2026 erlaubt –
 *  dann das „?“ entfernen (AUFGABEN A-944), ebenso in CURL_URL/CURL_LADEN von x-ausfuehrung.mjs. */
const MAXZEIT = String.raw`(?: --max-time 120)?`;
export const BASH_LADEN = new RegExp(String.raw`^/usr/bin/curl -q -sSfL${MAXZEIT} -o ${GELADEN} "https://([A-Za-z0-9.-]+)/storage/v1/object/sign/belege/[A-Za-z0-9/._%-]+\?token=[A-Za-z0-9._-]+(?:&download=[A-Za-z0-9._%()~+-]*)?"$`); // A-632 FOLGE: „+“ = Leerzeichen im Dateinamen
export const BASH_CURL = new RegExp(String.raw`^/usr/bin/curl -q -sSf${MAXZEIT} -X PUT --data-binary @${DATEI} -H "content-type: ${MIME}" "https://([A-Za-z0-9.-]+)/storage/v1/object/upload/sign/belege/[A-Za-z0-9/._%-]+\?token=[A-Za-z0-9._-]+"$`);
/** A-608 BELEG-ORIGINAL: Upload des Originals (Datei vom Hook unter arbeit/drive-<fileId>.<endung> bzw. arbeit/gmail-<messageId>-<n>.<endung>, Typ wie beleg_original; A-657: …-mail.pdf aus pdf.py --mail). */
export const BASH_CURL_ORIGINAL = new RegExp(String.raw`^/usr/bin/curl -q -sSf${MAXZEIT} -X PUT --data-binary @(arbeit/(?:drive-[A-Za-z0-9_-]{6,120}|gmail-[A-Za-z0-9_-]{6,120}-(?:\d{1,2}|mail))\.(?:pdf|jpg|png|tif)) -H "content-type: (?:application/pdf|image/jpeg|image/png|image/tiff)" "https://([A-Za-z0-9.-]+)/storage/v1/object/upload/sign/belege/[A-Za-z0-9/._%-]+\?token=[A-Za-z0-9._-]+"$`);
/** A-657/A-658: ausgefüllte CSV der Belegsuche (eine Gesellschaft je Auftrag) – nur im CSV-Modus (lease.csv). */
const CSV_BELEG = String.raw`arbeit/belegsuche-[A-Za-z0-9._-]{1,60}\.csv`;
export const BASH_CURL_CSV = new RegExp(String.raw`^/usr/bin/curl -q -sSf${MAXZEIT} -X PUT --data-binary @(${CSV_BELEG}) -H "content-type: text/csv" "https://([A-Za-z0-9.-]+)/storage/v1/object/upload/sign/belege/[A-Za-z0-9/._%-]+\?token=[A-Za-z0-9._-]+"$`);
/** A-626 WEB: öffentliche Datei laden – dieselbe Form wie BASH_LADEN, Adresse aus lease.web (webPruefen); URL ohne Leerraum, Anführungszeichen, Dollar, Backtick und Backslash. */
export const BASH_WEB = new RegExp(String.raw`^/usr/bin/curl -q -sSfL${MAXZEIT} -o ${GELADEN} "(https://[^"\s$\x60\\]{1,2000})"$`);
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
export const BASH_LADEN_DATEV = new RegExp(String.raw`^/usr/bin/curl -q -sSfL${MAXZEIT} -o (${DATEV_ZIP}) "https://([A-Za-z0-9.-]+)/storage/v1/object/sign/(?:belege|ablage)/[A-Za-z0-9/._%&()',;=+@!-]+\?token=[A-Za-z0-9._-]+(?:&download=[A-Za-z0-9._%()~+-]*)?"$`);
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
  if (c.includes("..") || !(BASH_PDF.test(c) || BASH_XLSX.test(c) || BASH_SHA.test(c) || BASH_WC.test(c) || BASH_CURL.test(c) || BASH_LADEN.test(c) || BASH_WEB.test(c))) return nein("Bash", "nur die Formen pdf.py, xlsx.py, sha256sum, wc -c, curl PUT (Skill x-arbeitsauftrag) und curl -o (Skills x-eingang, x-arbeitsauftrag).");
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
  if (c.includes("..") || !(BASH_SHA.test(c) || BASH_WC.test(c) || m || k || pm)) return nein("Bash", "im Auftrag belegsuche nur sha256sum, wc -c, curl PUT des aus Drive oder Gmail geladenen Originals bzw. der CSV (CSV-Modus) und pdf.py --mail.");
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
/** A-924 AM ORT: von EXAVA geplante Umbenennungen des Ablage-Auftrags (job.bezug.umbenennen, nur von x-ausfuehrung.mjs übernommen) { file_id, titel }; sonst leer. */
/** A-924 Erweiterung: Aufträge, die Drive-Dateien am Ort umbenennen – Ablage (Nachlauf) und Drive-Fenster (lesen und benennen in einem Schritt); wortgleich in x-ausfuehrung.mjs. */
export const UMBENENNEN_ARTEN = new Set(["ablage", "sync_aktuell", "sync_historisch"]);
export function leaseUmbenennen() { const u = UMBENENNEN_ARTEN.has(leaseArt()) ? leaseRoh()?.umbenennen : null; return Array.isArray(u) ? u.filter((x) => x && typeof x.file_id === "string" && typeof x.titel === "string") : []; }
/** A-924 AM ORT: eigene, nicht geteilte Dateien (get_file_permissions: nur Eigentümer-Rechte eines verbundenen Postfachs, x-ausfuehrung.mjs); sonst leer. */
export function leaseUngeteilt() { const o = leaseRoh()?.ungeteilt; return Array.isArray(o) ? o.filter((x) => typeof x === "string") : []; }
/** A-1050 EINGANG: vom PostToolUse-Hook bestätigte Listen der Aufträge mit Umbenennen (eingang_dateien = Dateien im bestätigten Ordner 00-EXAVA/Eingang, umbenannt = in diesem Lauf
 *  auf den Namen aus EXAVA umbenannt bzw. schon so benannt); sonst leer. */
const leaseListe = (k) => { const o = UMBENENNEN_ARTEN.has(leaseArt()) ? leaseRoh()?.[k] : null; return Array.isArray(o) ? o.filter((x) => typeof x === "string") : []; };
/** A-1050 EINGANG (Bauherr 11.11.2026, T3: „Verschieben im Kunden-Drive (00-EXAVA/Eingang → nach Umbenennung direkt ins Archiv, Dubletten nach Archiv/_Dubletten, niemals löschen)“):
 *  genau diese eine Verschiebung – nur fileId und parentId (der Connector ersetzt den Elternordner, dieselbe Datei-ID, keine Kopie), Quelle eine Datei aus der Liste des bestätigten
 *  Ordners 00-EXAVA/Eingang, Ziel nur der bestätigte Ordner 00-EXAVA/Archiv bzw. Archiv/_Dubletten (beide wie der Eingang im selben Elternordner, soweit Drive ihn nennt), nur eine eigene,
 *  nicht geteilte Datei, die in diesem Lauf auf den Namen aus EXAVA heißt (Erfassung mit Dokument-ID und Prüfsumme bestätigt). Nie kopieren, nie löschen, nie ein anderes Ziel. */
export const eingangVerschieben = (ti) => { const l = leaseRoh() ?? {};
  return NUR(ti, ["fileId", "parentId"]) && ID(ti.fileId) && ID(ti.parentId) && typeof l.eingang === "string" && ti.parentId !== l.eingang
    && [l.archiv, l.dubletten].some((z) => typeof z === "string" && z === ti.parentId) && (typeof l.eingang_in !== "string" || typeof l.archiv_in !== "string" || l.eingang_in === l.archiv_in)
    && leaseListe("eingang_dateien").includes(ti.fileId) && leaseListe("umbenannt").includes(ti.fileId) && leaseUngeteilt().includes(ti.fileId); };
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
/** A-924 (Bauherr 03.11.2026): EIN Namensschema für neue Namen im Drive wie in der Archivzeile – lib/belege/namen.ts SCHEMA_REGEX (JJJJ-MM-TT__Gesellschaft__TYP__…) mit __#hash8 und
 *  Endung, ≤ 220 Zeichen, ohne / \ < > : " | ? * und Steuerzeichen. Den Namen baut EXAVA (lib/x/dateiname.ts); die Routine übernimmt ihn unverändert (bezug.umbenennen, heartbeat_job). */
const ZEICHEN = String.raw`[^/\\<>:"|?*\x00-\x1f]`;
export const SCHEMA_NAME_RE = new RegExp(String.raw`^\d{4}-\d{2}-\d{2}__(?:[^_/\\<>:"|?*\x00-\x1f]|_(?!_))+__[A-Z][A-Z_]{2,}__${ZEICHEN}*__#[0-9a-f]{8}\.([A-Za-z0-9]{2,5})$`);
export const schemaName = (n, endung) => { const s = String(n ?? ""), m = SCHEMA_NAME_RE.exec(s); return !!m && s.length <= 220 && (endung ? m[1] === endung : /^(?:pdf|PDF)$/.test(m[1])); };
/** A-924 Erweiterung: am Ort umbenannt werden alle lesbaren Dokumente, nie Code- oder Systemdateien (.js .ts .py .sql .json .md .txt …). */
export const UMBENENNEN_ENDUNGEN = ["pdf", "doc", "docx", "xls", "xlsx", "csv", "odt", "ods", "rtf", "jpg", "jpeg", "png", "webp", "heic", "tif", "tiff"];
export const inPlaceName = (n) => { const m = SCHEMA_NAME_RE.exec(String(n ?? "")); return !!m && UMBENENNEN_ENDUNGEN.includes(m[1].toLowerCase()) && schemaName(n, m[1]); };
/** A-531 HOOK-AUDIT O1: Ordner, die die Ablage anlegen darf (Eingang wie bisher; Archiv nur in einem bestätigten eigenen Ordner). */
export const ABLAGE_ORDNER = ["Eingang", "Archiv", "WhatsApp", "_Dubletten"]; // A-924 Erweiterung: 00-EXAVA/WhatsApp für WhatsApp-Dokumente; A-1050: Archiv/_Dubletten (nur im bestätigten Archiv)
/** A-642 OFFICE: Endung → MIME eines Mail-Anhangs für den Upload-Platzhalter (wie ANHANG_MIME in x-ausfuehrung.mjs, dort mit Magic Bytes); keine Makro-Formate. */
export const ANHANG_MIME = { pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", csv: "text/csv", odt: "application/vnd.oasis.opendocument.text", ods: "application/vnd.oasis.opendocument.spreadsheet", rtf: "application/rtf",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic" }; // A-655: Beleg-Fotos und Scans (nie .ics/.vcf)
const anhangEndung = (b) => /^@arbeit\/[A-Za-z0-9._-]{1,140}(?:__#[0-9a-f]{8})?\.(pdf|docx?|xlsx?|csv|odt|ods|rtf|jpe?g|png|webp|heic)$/.exec(String(b))?.[1];
/** A-993b Schritt 6: Rettungen je Lauf – wortgleich KORB_MAX in lib/x/connector/lesen-mail.ts und x-ausfuehrung.mjs (scripts/test/a531-hook-audit-2.ts prüft die Gleichheit). */
export const KORB_MAX = 10;
/** A-993b Schritt 6: Gmail-Werkzeuge der Selbst-Rettung und Gmail-Nachrichten-ID (Hex wie GMAIL_ID in lib/x/connector/lesen-mail.ts). */
export const KORB_GMAIL = new Set(["untrash_message", "unlabel_message", "update_message_labels"]);
const GMAIL_NR = (x) => typeof x === "string" && /^[0-9a-f]{10,24}$/i.test(x);
const korbListe = (k) => { const l = leaseRoh()?.[k]; return Array.isArray(l) ? l : []; };
/** A-993b Schritt 6 (Bauherr 06.11.2026): Beleg aus dem Gmail-Papierkorb ins Archiv, wenn Gmail nur über den Claude-Connector angebunden ist – nur im Auftrag belegsuche;
 *  A-996: ebenso kritische Post im Auftrag postfach_hygiene (Papierkorb-Schutzschild, Freigabe von EXAVA nur im Schutzschild-Lauf). KORB_ARTEN = diese beiden Lease-Arten.
 *  untrash_message: nur messageId, von EXAVA freigegeben (lease.korb_frei, Frist), mit TRASH und Datum ≤ 14 Tage gesehen (lease.korb_gesehen), höchstens KORB_MAX je Lauf (lease.korb_raus);
 *  danach unlabel_message bzw. update_message_labels nur mit genau INBOX zum Entfernen für eine hier zurückgeholte Nachricht. Nie trash, nie andere Labels, nie Labels anlegen. */
export const KORB_ARTEN = new Set(["belegsuche", "postfach_hygiene"]);
function korbAusnahme(werkzeug, ti) {
  const n = `gmail/${werkzeug}`, id = ti?.messageId, raus = korbListe("korb_raus");
  if (!KORB_ARTEN.has(leaseArt())) return nein(n, "nur im Auftrag „belegsuche“ bzw. „postfach_hygiene“ (Lease aus arbeit_holen) für eine von EXAVA freigegebene Nachricht.");
  if (werkzeug === "untrash_message") {
    if (!NUR(ti, ["messageId"]) || !GMAIL_NR(id)) return nein(n, "nur messageId (Gmail-Nachrichten-ID).");
    if (!korbListe("korb_frei").some((x) => x?.id === id && Date.parse(String(x?.bis)) > Date.now())) return nein(n, "nur eine von EXAVA freigegebene Nachricht – erst mail_archivieren ohne konto mit ordner papierkorb, aktion archiv und umsatz_id bzw. schutzschild (Antwort selbst_retten).");
    if (!korbListe("korb_gesehen").includes(id)) return nein(n, "nur eine Nachricht, die du mit includeTrash im Papierkorb der letzten 14 Tage gefunden hast (Label TRASH und Datum in der Gmail-Antwort).");
    return raus.includes(id) || raus.length < KORB_MAX ? frei() : nein(n, `höchstens ${KORB_MAX} Rettungen je Lauf.`);
  }
  const ok = (werkzeug === "unlabel_message" ? NUR(ti, ["messageId", "labelIds"]) && INBOX(ti.labelIds) : NUR(ti, ["messageId", "removeLabelIds"]) && INBOX(ti.removeLabelIds)) && raus.includes(id);
  return ok ? frei() : nein(n, "nur INBOX entfernen (labelIds bzw. removeLabelIds genau [\"INBOX\"]) und nur für eine Nachricht, die du in diesem Lauf mit untrash_message zurückgeholt hast.");
}
/** A-993b Schritt 6: mail_archivieren mit gerettet: true (Erfolg der Selbst-Rettung, EXAVA schreibt das Audit) nur für Nachrichten, die hier zurückgeholt und aus dem Posteingang
 *  genommen wurden (lease.korb_fertig, schreibt nur x-ausfuehrung.mjs) – sonst stünde im Audit eine Rettung, die es nicht gab; null = nicht betroffen. */
const korbMeldung = (name, werkzeug, ti) => werkzeug !== "mail_archivieren" || ti?.gerettet !== true ? null
  : KORB_ARTEN.has(leaseArt()) && Array.isArray(ti.nachrichten) && ti.nachrichten.length > 0 && ti.nachrichten.every((id) => korbListe("korb_fertig").includes(id)) ? frei()
  : nein(name, "gerettet: true nur für Nachrichten, die du in diesem Lauf mit untrash_message zurückgeholt und danach aus dem Posteingang genommen hast.");
/** A-534: enge Ausnahmen für Kernregeln 9–11; null = Werkzeug nicht betroffen (dann gilt der Vertrag), sonst frei/nein. */
export function hygieneAusnahme(server, werkzeug, ti) {
  if (server === "gmail" && KORB_GMAIL.has(werkzeug) && (werkzeug === "untrash_message" || leaseArt() === "belegsuche")) return korbAusnahme(werkzeug, ti); // A-993b Schritt 6
  const art = { gmail: ["unmark_message_spam", "unmark_thread_spam", "unlabel_message", "unlabel_thread", "update_message_labels"], google_drive: ["update_file", "create_file"] }[server]?.includes(werkzeug) // A-924: copy_file gesperrt (nie eine zweite Kopie)
    ? (server === "gmail" ? "postfach_hygiene" : "ablage") : null;
  if (!art) return null;
  const n = `${server}/${werkzeug}`;
  const dub = werkzeug === "create_file" && ti?.base64Content === undefined && (ti?.title ?? ti?.name) === "_Dubletten"; // A-1050: Ordner der Dubletten im Archiv auch im Drive-Fenster
  const arten = werkzeug === "update_file" || dub ? [...UMBENENNEN_ARTEN] : [art]; // A-924 Erweiterung: am Ort umbenennen auch im Drive-Fenster (lesen und benennen in einem Schritt)
  if (!arten.includes(leaseArt())) return nein(n, `nur in einem Auftrag „${arten.join("“ oder „")}“ (Lease aus arbeit_holen).`);
  const ok = werkzeug === "unmark_message_spam" ? NUR(ti, ["messageId"]) && ID(ti.messageId)
    : werkzeug === "unmark_thread_spam" ? NUR(ti, ["threadId"]) && ID(ti.threadId)
    : werkzeug === "unlabel_message" ? NUR(ti, ["messageId", "labelIds"]) && ID(ti.messageId) && INBOX(ti.labelIds)
    : werkzeug === "unlabel_thread" ? NUR(ti, ["threadId", "labelIds"]) && ID(ti.threadId) && INBOX(ti.labelIds)
    : werkzeug === "update_message_labels" ? NUR(ti, ["messageId", "removeLabelIds"]) && ID(ti.messageId) && INBOX(ti.removeLabelIds)
    : werkzeug === "update_file" && ti?.parentId !== undefined ? eingangVerschieben(ti) // A-1050 EINGANG: genau die eine Verschiebung 00-EXAVA/Eingang → Archiv bzw. Archiv/_Dubletten
    : werkzeug === "update_file" ? NUR(ti, ["fileId", "name", "title"]) && ID(ti.fileId) && (ti.name === undefined) !== (ti.title === undefined) // A-924 AM ORT: nur umbenennen, kein Elternordner (nie verschieben); A-659 title wie name
      && inPlaceName(ti.title ?? ti.name) && leaseUmbenennen().some((u) => u.file_id === ti.fileId && u.titel === (ti.title ?? ti.name)) // nur genau der Name, den EXAVA geplant hat (job.bezug.umbenennen)
      && leaseUngeteilt().includes(ti.fileId) // G7: nur eine eigene, nicht geteilte Datei (get_file_permissions)
    : /\.zip$/i.test(String(ti.base64Content ?? "")) ? NUR(ti, ["title", "parentId", "contentMimeType", "base64Content", "disableConversionToGoogleType"]) && !!leaseDatev() // A-818 (G5): DATEV-Paket nur als Platzhalter
      && ti.base64Content === `@arbeit/${leaseDatev().name}.zip` && String(ti.title).startsWith(`${leaseDatev().name}__#`) && /^__#[0-9a-f]{8}\.zip$/.test(String(ti.title).slice(leaseDatev().name.length)) // (Inhalt, Hash und Größe prüft x-ausfuehrung.mjs)
      && ti.contentMimeType === "application/zip" && ti.disableConversionToGoogleType === true && typeof leaseRoh()?.datev_ziel === "string" && ti.parentId === leaseRoh().datev_ziel // nur der bestätigte Monatsordner
    : ti.base64Content !== undefined ? NUR(ti, ["title", "parentId", "contentMimeType", "base64Content", "disableConversionToGoogleType"]) && schemaName(ti.title, anhangEndung(ti.base64Content)) // A-615: Mail-Anhang nur als Platzhalter (Inhalt setzt x-ausfuehrung.mjs), nur nach 00-EXAVA/Archiv; A-924: Name nach Schema
      && !!anhangEndung(ti.base64Content) && ti.contentMimeType === ANHANG_MIME[anhangEndung(ti.base64Content)] && ti.disableConversionToGoogleType === true // A-642 OFFICE: Endung, Titel und MIME passen zusammen
      && [leaseRoh()?.archiv, leaseRoh()?.whatsapp].some((z) => typeof z === "string" && ti.parentId === z) // A-924 Erweiterung: 00-EXAVA/Archiv bzw. 00-EXAVA/WhatsApp (die Bindung der WhatsApp-IDs prüft x-ausfuehrung.mjs)
    : NUR(ti, ["name", "title", "mimeType", "parents", "parentId"]) && (ti.name === undefined) !== (ti.title === undefined) && ti.mimeType === "application/vnd.google-apps.folder" // A-930 Nachtrag: Ordnername als title (Feld des Connectors wie beim Hochladen) oder name, genau eins
      && (ABLAGE_ORDNER.includes(ti.title ?? ti.name) || !!leaseDatev()?.ordner.includes(ti.title ?? ti.name)) // A-818: die drei Ordner des DATEV-Pakets
      && (ti.parentId === undefined || ID(ti.parentId)) && (ti.parents === undefined || (Array.isArray(ti.parents) && ti.parents.length === 1 && ID(ti.parents[0])))
      && [ti.parentId, ti.parents?.[0]].every((x) => x === undefined || leaseOrdner().includes(x) || (dub && x === leaseRoh()?.archiv)) // HOOK-AUDIT F3 (G7): Elternordner nur ein bestätigter eigener Ordner
      && (!dub || (typeof leaseRoh()?.archiv === "string" && ti.parentId === leaseRoh().archiv && ti.parents === undefined)) // A-1050: _Dubletten nur direkt im bestätigten Archiv
      && ((ti.title ?? ti.name) === "Eingang" || ti.parentId !== undefined || ti.parents !== undefined); // O1: Archiv nie ohne Elternordner
  const upload = werkzeug === "create_file" && ti.base64Content !== undefined && !/\.zip$/i.test(String(ti.base64Content)); // A-930d: genauer Grund statt der Sammelmeldung (Diagnose im Lauf)
  const grund = ok ? null : werkzeug === "update_file" && ti?.parentId !== undefined ? "Verschieben nur aus 00-EXAVA/Eingang nach 00-EXAVA/Archiv bzw. Archiv/_Dubletten (Ordner per get_file_permissions und get_file_metadata bestätigt, Datei aus der Liste parentId = '<Eingang>'), nur fileId und parentId, erst nach der Umbenennung auf den Namen aus EXAVA – nie kopieren, nie löschen"
    : werkzeug === "update_file" && leaseUmbenennen().some((u) => u.file_id === ti.fileId && u.titel === (ti.title ?? ti.name))
      ? (leaseUngeteilt().includes(ti.fileId) ? null : "Datei nicht als eigen und ungeteilt bestätigt – erst get_file_permissions; zeigt die Antwort eine Freigabe oder einen fremden Eigentümer: nicht umbenennen, Grund melden")
    : werkzeug === "update_file" ? "nur fileId und title = genau der Name aus EXAVA für diese Datei (titel aus ausfuehrung_liste bzw. job.bezug.umbenennen)"
    : upload && ![leaseRoh()?.archiv, leaseRoh()?.whatsapp].some((z) => typeof z === "string" && ti.parentId === z) ? "Zielordner nicht bestätigt – parentId nur 00-EXAVA/Archiv bzw. 00-EXAVA/WhatsApp (im Lauf angelegt oder per get_file_permissions und get_file_metadata bestätigt)"
    : upload ? "Upload nur mit title (Name aus EXAVA), base64Content = platzhalter, contentMimeType = mime (beides aus ausfuehrung_liste) und disableConversionToGoogleType: true" : null;
  return ok ? frei() : nein(n, grund ? `${grund}.` : "nur in engster Form: Spam aufheben, INBOX entfernen, Datei am Ort umbenennen (nur fileId und title, genau der Name aus EXAVA – job.bezug.umbenennen bzw. namen aus heartbeat_job –, alle lesbaren Dokumente, nur eine eigene, nicht geteilte Datei nach get_file_permissions – nie verschieben, nie kopieren), Ordner „Eingang“, „Archiv“ oder „WhatsApp“ anlegen (Elternordner nur ein bestätigter eigener), Anhang als „@arbeit/<datei>.<pdf|docx|xlsx|…>“ mit Namen nach Schema JJJJ-MM-TT__Gesellschaft__TYP__…__#hash8 nach 00-EXAVA/Archiv bzw. ein WhatsApp-Dokument nach 00-EXAVA/WhatsApp hochladen, DATEV-Paket als „@arbeit/<name>.zip“ in seinen bestätigten Monatsordner (Ordner nur aus job.bezug.datev_paket) – kein anderer Inhalt, keine Rechte.");
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
/** A-1007 H: Zeitbudget für das Lesen der Sitzungsprotokolle – deutlich unter FRIST_MS, damit complete_job nie an der Frist scheitert (zu spät → ohne verbrauch). */
export const VERBRAUCH_MS = 4000;
const VERBRAUCH_FELDER = ["input", "output", "cache_read", "cache_creation"], VERBRAUCH_MAX = 700_000_000;
const tokenZahl = (x) => (Number.isFinite(x) && x > 0 ? Math.min(Math.floor(x), VERBRAUCH_MAX) : 0);
/** A-1071 P1: Denkstufen wie X_DENKSTUFEN in lib/x/einstellungen.ts (scripts/test/a1071-abo-messung.ts prüft die Gleichheit); Stufe aus einem Namen oder { level } – sonst "". */
export const STUFEN = new Set(["low", "medium", "high", "xhigh", "max"]);
const stufeVon = (x) => (typeof x === "string" && STUFEN.has(x) ? x : typeof x?.level === "string" && STUFEN.has(x.level) ? x.level : "");
const ZAEHLER_MAX = 1_000_000, STAND_TEILE_MAX = 64, TEILE_MAX = 16, HELFER_DATEIEN_MAX = 400;
/** A-1071 P1: nach dem Lesen des Hauptprotokolls neu lesen, solange der laufende Aufruf noch fehlt (das Protokoll wird asynchron geschrieben) – A-1071 Schnitt „unvollständig“: höchstens
 *  NACHLESEN_MAX Runden je NACHLESEN_MS Warten, jede nur in der ersten Hälfte von VERBRAUCH_MS (schlimmstenfalls 6 × 150 ms; das Budget der Messung bleibt VERBRAUCH_MS, weit unter FRIST_MS). */
export const NACHLESEN_MS = 150, NACHLESEN_MAX = 6;
const warten = (ms) => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { /* ohne Warten */ } };
/** A-1071 P1: ein Aufruf ohne dokument_ids (ask_user kann den Auftrag anhalten) – dieselbe Regel für Meldung und frühere Abschlüsse. */
const ohneDokumente = (ti) => ti?.dokument_ids === undefined;
const abschlussAufruf = (b, ask) => /complete_job$/.test(String(b?.name ?? "")) || (ask && /ask_user$/.test(String(b?.name ?? "")) && ohneDokumente(b.input));
const teilVon = (teile, rolle, modell, stufe, stufe_zug) => { const k = [rolle, modell, stufe, stufe_zug].join("|");
  return (teile[k] ??= { rolle, modell, stufe, stufe_zug, input: 0, output: 0, cache_read: 0, cache_creation: 0, denken: 0, antworten: 0, eingabe_erste: 0 }); };
/** A-1071 P1: Zug = Prompt-Zeile des Hauptprotokolls (type user) ohne tool_result, ohne isMeta (Skill-Inhalte), ohne isCompactSummary; Benachrichtigung = origin.kind task-notification, sonstige = ohne origin.kind. */
const zugZaehlen = (a, o) => {
  if (o?.type !== "user" || o.isMeta === true || o.isCompactSummary === true || (Array.isArray(o.message?.content) && o.message.content.some((b) => b?.type === "tool_result"))) return;
  if (typeof o.uuid === "string") { if (a.gesehen.has(`zug:${o.uuid}`)) return; a.gesehen.add(`zug:${o.uuid}`); }
  a.zuege.gesamt++; if (o.origin?.kind === "task-notification") a.zuege.benachrichtigung++; else if (o.origin?.kind == null) a.zuege.sonstige++;
};
/** A-1071 P1: Rolle eines Helferprotokolls (agent-<id>.jsonl) aus der Bindung dieses Helfers (helferBinden), sonst helfer. */
const helferRolle = (datei) => { const id = /^agent-([\w-]{1,120})\.jsonl$/.exec(basename(datei))?.[1];
  try { const p = id ? helferDatei(id) : ""; const r = p && lstatSync(p).isFile() ? JSON.parse(readFileSync(p, "utf8"))?.rolle : null; return HELFER.has(r) ? r : "helfer"; } catch { return "helfer"; } };
/** A-1007 H, A-1071 P1: ein Protokoll zählen – je Antwort (message.id) einmal, nur mit Mengenangabe (input_tokens und output_tokens als Zahl), nur usage und Modell, nie Inhalte; je Teil Rolle |
 *  Modell | Stufe der Zeile (effort) | Stufe des Zugs (perTurnEffort) mit Denk-Token (output_tokens_details.thinking_tokens) und Antworten, in Helferteilen die Eingabe der ersten Antwort;
 *  im Hauptprotokoll Züge (Vorfilter per Zeichenkette – tool_result-Zeilen werden nicht als JSON gelesen), Client (version der letzten Antwortzeile), frühere Abschlüsse (ohne den laufenden
 *  Aufruf) und ob der laufende Aufruf schon drin steht. Fehlt ein Feld, fehlt nur das Messfeld. false = Zeitbudget überschritten. */
function protokollZaehlen(a, text, i, rolle, laufend, ask, start) {
  let erste = i > 0;
  for (const zeile of text.split("\n")) {
    if (Date.now() - start > VERBRAUCH_MS) return false;
    if (i === 0 && zeile.includes('"type":"user"') && !zeile.includes('"tool_result"')) { try { zugZaehlen(a, JSON.parse(zeile)); } catch { /* keine Zeile */ } continue; }
    if (!zeile.includes('"usage"')) continue;
    let o; try { o = JSON.parse(zeile); } catch { continue; }
    const m = o?.type === "assistant" && o.message && typeof o.message === "object" ? o.message : null, u = m?.usage;
    if (i === 0 && Array.isArray(m?.content)) for (const b of m.content) if (b?.type === "tool_use") {
      if (laufend && b.id === laufend) a.vorhanden = true;
      else if (abschlussAufruf(b, ask) && !a.gesehen.has(`tu:${b.id}`)) { a.gesehen.add(`tu:${b.id}`); a.abschluesse++; }
    }
    if (!u || typeof u !== "object" || !Number.isFinite(u.input_tokens) || !Number.isFinite(u.output_tokens)) continue; // ohne Mengenangabe nichts zählen (nie als 0 gedeutet)
    const id = typeof m.id === "string" && m.id ? m.id : `${i}:${o.uuid}`;
    if (a.gesehen.has(id)) continue; // eine Antwort steht je Inhaltsblock mehrfach im Protokoll, mit derselben usage
    a.gesehen.add(id);
    const z = { input: tokenZahl(u.input_tokens), output: tokenZahl(u.output_tokens), cache_read: tokenZahl(u.cache_read_input_tokens), cache_creation: tokenZahl(u.cache_creation_input_tokens) };
    for (const f of VERBRAUCH_FELDER) a[f] += z[f];
    const modell = typeof m.model === "string" && /^[\w.:/-]{1,80}$/.test(m.model) ? m.model : "";
    if (i === 0 && modell) a.modell = modell;
    if (i === 0 && typeof o.version === "string" && /^[\d.]{1,20}$/.test(o.version)) a.client = o.version;
    const t = teilVon(a.teile, rolle, modell, stufeVon(o.effort), stufeVon(o.perTurnEffort));
    for (const f of VERBRAUCH_FELDER) t[f] += z[f];
    t.denken += tokenZahl(u.output_tokens_details?.thinking_tokens); t.antworten++;
    if (erste) { t.eingabe_erste += z.input + z.cache_read + z.cache_creation; erste = false; }
  }
  return true;
}
/** A-1007 H: Token dieser Claude-Sitzung aus dem Sitzungsprotokoll (transcript_path der Hook-Eingabe) und den Protokollen ihrer Helfer (<sitzung>/subagents/*.jsonl, ältere Ablage
 *  agent-*.jsonl derselben Sitzung) – je Antwort (message.id) einmal, nur Antworten mit Mengenangabe (input_tokens und output_tokens als Zahl), nur usage und Modell des
 *  Hauptprotokolls, nie Inhalte; abschluesse = frühere complete_job-Aufrufe dieser Sitzung (ohne den laufenden, tool_use_id). Unlesbar oder über VERBRAUCH_MS → null.
 *  A-1071 P1: dazu teile, zuege, client und unvollstaendig (der laufende Aufruf steht auch nach dem Nachlesen noch nicht im Hauptprotokoll); mit Messform 2 zählt auch ein früheres ask_user
 *  ohne dokument_ids als Abschluss (dabei wurde der Stand geschrieben). Gesamtsumme und Hauptmodell wie bisher. */
export function sitzungsVerbrauch(e, start = Date.now()) {
  const pfad = typeof e?.transcript_path === "string" ? e.transcript_path : "", sitzung = typeof e?.session_id === "string" ? e.session_id : "";
  if (!pfad.endsWith(".jsonl") || !/^[A-Za-z0-9_-]{8,80}$/.test(sitzung)) return null;
  const ordner = dirname(pfad), helfer = [], laufend = typeof e?.tool_use_id === "string" ? e.tool_use_id : null, ask = leaseRoh()?.messung === 2;
  try { for (const f of readdirSync(join(ordner, sitzung, "subagents"))) if (f.endsWith(".jsonl")) helfer.push(join(ordner, sitzung, "subagents", f)); } catch { /* ohne Helfer */ }
  try { for (const f of readdirSync(ordner)) if (/^agent-[\w-]+\.jsonl$/.test(f)) helfer.push(join(ordner, f)); } catch { /* ohne ältere Ablage */ }
  const leer = () => ({ modell: "", input: 0, output: 0, cache_read: 0, cache_creation: 0, abschluesse: 0, teile: {}, zuege: { gesamt: 0, benachrichtigung: 0, sonstige: 0 }, client: "", vorhanden: false, gesehen: new Set() });
  const haupt = () => { let text; try { text = readFileSync(pfad, "utf8"); } catch { return null; } const a = leer(); return protokollZaehlen(a, text, 0, "haupt", laufend, ask, start) ? a : null; };
  let h = haupt(); if (!h) return null;
  for (let n = 0; laufend && !h.vorhanden && n < NACHLESEN_MAX && Date.now() - start < VERBRAUCH_MS / 2; n++) { warten(NACHLESEN_MS); const h2 = haupt(); if (!h2) break; h = h2; } // A-1071: Protokoll läuft nach
  const w = leer();
  for (const [n, d] of helfer.entries()) {
    let text; try { text = readFileSync(d, "utf8"); } catch { continue; }
    if (dirname(d) === ordner && !text.includes(`"sessionId":"${sitzung}"`)) continue; // ältere Ablage: nur Helfer dieser Sitzung
    if (!protokollZaehlen(w, text, n + 1, helferRolle(d), null, false, start)) return null;
  }
  const s = { sitzung, modell: h.modell, abschluesse: h.abschluesse, teile: { ...h.teile, ...w.teile }, zuege: h.zuege, client: h.client, unvollstaendig: !!laufend && !h.vorhanden };
  for (const f of VERBRAUCH_FELDER) s[f] = h[f] + w[f];
  return s;
}
/** A-1071 P1: Stand für den Abgleich je Sitzung – Gesamtsumme, Teile und Züge. */
const standVon = (s) => ({ summe: Object.fromEntries(VERBRAUCH_FELDER.map((f) => [f, s[f]])), teile: Object.fromEntries(Object.entries(s.teile).slice(0, STAND_TEILE_MAX)), zuege: s.zuege });
const standGueltig = (x) => x === null || (!!x && typeof x === "object" && !!x.summe && typeof x.summe === "object" && !!x.teile && typeof x.teile === "object");
/** A-1071 P1: Zähler dieses Auftrags aus .exava/messung.jsonl – erste Stufe laut Hook, Aufrufe je Stufe, Rückgaben der Helfer je Rolle (Anzahl, Zeichen); jeder Fehler → leer. */
function zaehlerLesen(job) {
  const out = { stufe_start: "", hook_stufen: {}, rueckgaben: {} };
  try {
    const datei = join(projektDir(), ".exava", "messung.jsonl"), st = lstatSync(datei);
    if (!st.isFile() || st.size > 2 * MESSUNG_DATEI_MAX) return out;
    for (const zeile of readFileSync(datei, "utf8").split("\n")) {
      let o; try { o = JSON.parse(zeile); } catch { continue; }
      if (!o || String(o.j).toLowerCase() !== job) continue;
      if (o.a === "t" && STUFEN.has(o.s)) { out.stufe_start ||= o.s; out.hook_stufen[o.s] = Math.min((out.hook_stufen[o.s] ?? 0) + 1, ZAEHLER_MAX); }
      else if (o.a === "r") { const g = (out.rueckgaben[HELFER.has(o.r) ? o.r : "helfer"] ??= { rueckgaben: 0, rueckgabe_zeichen: 0 }); g.rueckgaben++; g.rueckgabe_zeichen = tokenZahl(g.rueckgabe_zeichen + (Number.isInteger(o.z) && o.z > 0 ? o.z : 0)); }
    }
  } catch { /* ohne Zähler */ }
  return out;
}
/** A-1071 P1: Helfer dieses Auftrags je Rolle – Starts (Bindungsdateien, höchstens HELFER_DATEIEN_MAX gelesen), Rückgaben und Rückgabe-Zeichen, Stufe (wenn alle Bindungen der Rolle dieselbe tragen). */
function helferLesen(job, rueckgaben) {
  const rollen = {};
  try {
    const dir = join(projektDir(), ".exava");
    for (const f of readdirSync(dir).filter((x) => /^helfer-[0-9a-f]{32}\.json$/.test(x)).slice(0, HELFER_DATEIEN_MAX)) {
      try { const p = join(dir, f); if (!lstatSync(p).isFile()) continue; const b = JSON.parse(readFileSync(p, "utf8"));
        if (String(b?.job_id).toLowerCase() !== job) continue;
        const g = (rollen[HELFER.has(b.rolle) ? b.rolle : "helfer"] ??= { starts: 0, stufen: new Set() }); g.starts++; g.stufen.add(STUFEN.has(b.stufe) ? b.stufe : ""); } catch { /* eine Datei */ }
    }
  } catch { /* ohne Bindungen */ }
  return [...new Set([...Object.keys(rollen), ...Object.keys(rueckgaben)])].sort().slice(0, 8).map((r) => { const g = rollen[r], q = rueckgaben[r], st = g?.stufen.size === 1 ? [...g.stufen][0] : "";
    return { rolle: r, starts: Math.min(g?.starts ?? 0, ZAEHLER_MAX), rueckgaben: Math.min(q?.rueckgaben ?? 0, ZAEHLER_MAX), rueckgabe_zeichen: q?.rueckgabe_zeichen ?? 0, ...(st ? { stufe: st } : {}) }; });
}
/** A-1071 P1: Messfelder der Messform 2 (Vertrag ABO_VERBRAUCH in lib/x/connector/symbiose-schemata.ts) – Teile, Züge und Zähler als Delta zur Basis des Auftrags; nur Zahlen und Namen. */
function messfelder(e, s, basis, job) {
  const d = (a, b) => tokenZahl((Number(a) || 0) - (Number(b) || 0)), menge = (x) => x.input + x.output + x.cache_read + x.cache_creation;
  const teile = Object.entries(s.teile).map(([k, t]) => { const b = basis?.teile?.[k] ?? {};
    return { rolle: t.rolle, modell: t.modell, ...(t.stufe ? { stufe: t.stufe } : {}), ...(t.stufe_zug ? { stufe_zug: t.stufe_zug } : {}), ...Object.fromEntries(VERBRAUCH_FELDER.map((f) => [f, d(t[f], b[f])])),
      denken: d(t.denken, b.denken), antworten: Math.min(d(t.antworten, b.antworten), ZAEHLER_MAX), ...(t.rolle !== "haupt" ? { eingabe_erste: d(t.eingabe_erste, b.eingabe_erste) } : {}) }; })
    .filter((t) => menge(t) > 0).sort((a, b) => menge(b) - menge(a) || `${a.rolle}|${a.modell}`.localeCompare(`${b.rolle}|${b.modell}`)).slice(0, TEILE_MAX);
  const z = zaehlerLesen(job), helfer = helferLesen(job, z.rueckgaben), stufe = stufeVon(e?.effort), umgebung = stufeVon(process.env.CLAUDE_CODE_EFFORT_LEVEL), bg = process.env.CLAUDE_AUTO_BACKGROUND_TASKS;
  return { ...(s.client ? { client: s.client } : {}), ...(stufe ? { stufe } : {}), ...(z.stufe_start ? { stufe_start: z.stufe_start } : {}), ...(Object.keys(z.hook_stufen).length ? { hook_stufen: z.hook_stufen } : {}),
    ...(umgebung ? { umgebung_stufe: umgebung } : {}), auto_hintergrund: typeof bg === "string" && bg !== "", zuege: Object.fromEntries(["gesamt", "benachrichtigung", "sonstige"].map((k) => [k, Math.min(d(s.zuege[k], basis?.zuege?.[k]), ZAEHLER_MAX)])),
    unvollstaendig: s.unvollstaendig === true, ...(teile.length ? { teile } : {}), ...(helfer.length ? { helfer } : {}) };
}
/** A-1007 H: Verbrauch des laufenden Auftrags aus dem Sitzungsstand (.exava/verbrauch.json, nur dieser Hook schreibt sie). Ohne .exava, ohne Protokoll, ohne Modellangabe oder ohne Stand einer
 *  Sitzung, die schon abgeschlossen hat (Rückfall nach verlorenem Zustand) → null (lieber nichts als doppelt).
 *  A-1071 P1: Der Stand führt je Sitzung basis (Stand bei Beginn des laufenden Auftrags), aktuell (job:generation) und letzter (Stand bei der letzten Meldung). Meldung für einen anderen Schlüssel:
 *  basis := letzter, aktuell := Schlüssel. Verbrauch = Stand jetzt minus basis bei JEDEM Versuch (EXAVA bucht je Auftrag und Generation einmal – ein abgelehnter Versuch bucht nichts, der nächste
 *  meldet die volle Zahl). Lässt sich der Stand nicht schreiben → null (sonst rechnete der nächste Auftrag ab einem alten letzter und buchte doppelt). Neue Form nur mit messung 2 in der Lease. */
export function auftragsVerbrauch(e, ti) {
  const job = String(ti?.job_id ?? "").toLowerCase(), gen = ti?.lease_generation, dir = join(projektDir(), ".exava");
  if (!UUID_LEASE.test(job) || !Number.isInteger(gen) || gen < 1 || !existsSync(dir)) return null;
  const s = sitzungsVerbrauch(e); if (!s || !s.modell) return null;
  const pfad = join(dir, "verbrauch.json"), schluessel = `${job}:${gen}`;
  let st = null; try { st = JSON.parse(readFileSync(pfad, "utf8")); } catch { /* erster Auftrag dieser Sitzung */ }
  const gueltig = !!st && typeof st === "object" && st.sitzung === s.sitzung && Object.hasOwn(st, "aktuell") && standGueltig(st.basis ?? null) && standGueltig(st.letzter ?? null);
  if (!gueltig && s.abschluesse > 0) return null; // Stand fehlt, aber diese Sitzung hat schon abgeschlossen bzw. gemeldet: das Delta wäre doppelt
  const basis = gueltig ? (st.aktuell === schluessel ? st.basis ?? null : st.letzter ?? null) : null;
  const v = { modell: String(s.modell).slice(0, 80), ...Object.fromEntries(VERBRAUCH_FELDER.map((f) => [f, tokenZahl(s[f] - (Number(basis?.summe?.[f]) || 0))])) };
  let meldung = v;
  if (leaseRoh()?.messung === 2) try { meldung = { ...v, ...messfelder(e, s, basis, job) }; } catch { meldung = v; } // im Fehlerfall fehlen nur die Messfelder
  try { if (lstatSync(dir).isSymbolicLink()) return null; const t = `${pfad}.${process.pid}.tmp`; writeFileSync(t, JSON.stringify({ sitzung: s.sitzung, aktuell: schluessel, basis, letzter: standVon(s) })); renameSync(t, pfad); }
  catch { return null; }
  return meldung;
}
/** A-1007 H: complete_job – verbrauch des Auftrags per updatedInput; ein vom Modell mitgegebener fällt weg (nur der Hook meldet ihn). Weder ermittelt noch mitgegeben → null (wie bisher frei).
 *  A-1071 P1: ebenso ask_user – gemeldet nur mit messung 2 und nur ohne dokument_ids (der Aufruf kann den Auftrag anhalten; ob er es tut, entscheidet EXAVA); ein vom Modell mitgegebenes
 *  verbrauch fällt bei ask_user immer weg (G8). Ein Fehler beim Ermitteln kostet nur das Feld – nie die Entscheidung. */
export function verbrauchMelden(werkzeug, ti, e) {
  if ((werkzeug !== "complete_job" && werkzeug !== "ask_user") || !ti || typeof ti !== "object" || Array.isArray(ti)) return null;
  const { verbrauch: mitgegeben, ...ohne } = ti;
  let v = null;
  if (werkzeug === "complete_job" || (leaseRoh()?.messung === 2 && ohneDokumente(ti))) try { v = auftragsVerbrauch(e, ti); } catch { v = null; }
  if (!v && mitgegeben === undefined) return null;
  return { code: 0, stdout: JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", permissionDecisionReason: `${werkzeug === "complete_job" ? "A-1007 H" : "A-1071"} Abo-Verbrauch aus dem Sitzungsprotokoll`,
    updatedInput: v ? { ...ohne, verbrauch: v } : ohne } }) };
}
/** A-1071 P1: ingest_document der Hauptsitzung – ein vom Modell mitgegebenes gelesen_von fällt weg (nur der Hook setzt es, im Helfer x-scan); sonst null (wie bisher frei). */
const gelesenVonEntfernen = (werkzeug, ti) => werkzeug !== "ingest_document" || !ti || typeof ti !== "object" || Array.isArray(ti) || !Object.hasOwn(ti, "gelesen_von") ? null
  : { code: 0, stdout: JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", permissionDecisionReason: "A-1071 gelesen_von setzt nur der Hook",
    updatedInput: Object.fromEntries(Object.entries(ti).filter(([k]) => k !== "gelesen_von")) } }) };
/** A-901 Lease-Weitergabe: ingest_document aus dem Helfer x-scan nur mit vollständiger Lease des laufenden Auftrags (.exava/lease.json, schreibt nur x-ausfuehrung.mjs nach arbeit_holen)
 *  und nur mit den Feldern des Werkzeugs; job_id, lauf_id, lease_generation und lease_token setzt der Hook per updatedInput (Werte des Helfers werden ersetzt). Profil, Auftrag,
 *  Lease und Quelle prüft der Server (hintergrundBindung, brain_lease_pruefen). Ohne gültige Lease gesperrt (fail closed). */
const UUID_LEASE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A-901 Teil 2 (Gegenprüfung #2125): Bindung Helfer → Auftrag. Beim ersten Aufruf eines Helfers (agent_id) merkt der Hook die job_id der laufenden Lease in .exava/helfer-<sha256>.json
 *  (exklusiv angelegt, nie überschrieben). scanIngest gibt die Lease nur an einen Helfer dieses Auftrags weiter – auch wenn Claude Code einen synchronen Helfer nach 120 s in den
 *  Hintergrund schiebt (CLAUDE_AUTO_BACKGROUND_TASKS), übergibt er nach dem Auftragswechsel nichts unter der Lease des Folgeauftrags. */
const helferDatei = (agentId) => join(projektDir(), ".exava", `helfer-${createHash("sha256").update(String(agentId)).digest("hex").slice(0, 32)}.json`);
/** A-1071 P1: die Bindung trägt zusätzlich rolle (agent_type) und stufe (effort.level des ersten Aufrufs) – die Messung zählt daraus Rolle, Starts und Stufe je Helfer. */
export function helferBinden(agentId, rolle, stufe) {
  const l = leaseRoh();
  if (typeof agentId !== "string" || !agentId || !l || !UUID_LEASE.test(String(l.job_id)) || !existsSync(join(projektDir(), ".exava"))) return;
  const s = stufeVon(stufe);
  try { writeFileSync(helferDatei(agentId), JSON.stringify({ job_id: l.job_id, ...(HELFER.has(rolle) ? { rolle } : {}), ...(s ? { stufe: s } : {}) }), { flag: "wx" }); } catch { /* schon gebunden (EEXIST) oder nicht schreibbar: die erste Bindung gilt */ }
}
export const helferAuftrag = (agentId) => { try { const p = helferDatei(agentId); return typeof agentId === "string" && agentId && lstatSync(p).isFile() ? JSON.parse(readFileSync(p, "utf8"))?.job_id ?? null : null; } catch { return null; } };
/** A-1071 P1 Leseweg des Helfers x-scan (.exava/lesen-<sha256(agent_id)>.json, der letzte gilt): read_file_content → drive_text (Textauszug von Drive, bei Scans dessen Texterkennung),
 *  download_file_content → datei, Read nur für einen Pfad unter arbeit/ → datei (ein Read der ausgelagerten Antwort ändert den Weg nicht), get_message → gmail_text; dazu einmal das Modell
 *  des Helfers aus seinem Protokoll (≤ 256 KiB, erste Antwort mit gültigem message.model, ≤ 300 ms; nicht bestimmbar → beim nächsten Lesewerkzeug erneut). */
export const LESEWEG = { read_file_content: "drive_text", download_file_content: "datei", get_message: "gmail_text" };
const AGENT_ID = /^[A-Za-z0-9_-]{4,80}$/, MODELL_NAME = /^[\w.:/-]{1,80}$/;
const lesenDatei = (agentId) => join(projektDir(), ".exava", `lesen-${createHash("sha256").update(String(agentId)).digest("hex").slice(0, 32)}.json`);
const unterArbeit = (f) => { if (typeof f !== "string" || !f) return false; const r = relative(projektDir(), resolve(projektDir(), f)); return r.startsWith("arbeit/") && !r.split(/[\\/]/).includes(".."); };
function helferModell(e) {
  const t0 = Date.now(), pfad = String(e?.transcript_path ?? ""), sitzung = String(e?.session_id ?? ""), name = `agent-${e.agent_id}.jsonl`;
  const datei = basename(pfad) === name ? pfad : pfad.endsWith(".jsonl") && /^[A-Za-z0-9_-]{8,80}$/.test(sitzung) ? join(dirname(pfad), sitzung, "subagents", name) : "";
  if (!datei) return "";
  let fd;
  try {
    if (!lstatSync(datei).isFile()) return "";
    fd = openSync(datei, "r"); const buf = Buffer.alloc(256 * 1024), n = readSync(fd, buf, 0, buf.length, 0);
    for (const zeile of buf.subarray(0, n).toString("utf8").split("\n")) {
      if (Date.now() - t0 > 300) return "";
      if (!zeile.includes('"assistant"')) continue;
      let o; try { o = JSON.parse(zeile); } catch { continue; }
      if (o?.type === "assistant" && typeof o.message?.model === "string" && MODELL_NAME.test(o.message.model)) return o.message.model;
    }
  } catch { /* nicht lesbar */ } finally { if (fd !== undefined) try { closeSync(fd); } catch { /* zu */ } }
  return "";
}
/** A-1071 P1: nach jeder Freigabe eines Lesewerkzeugs im Helfer x-scan den Leseweg merken – nur im Hook-Lauf, nur mit .exava, nie über einen Symlink; jeder Fehler wird ignoriert (G7). */
export function lesewegMerken(e, r) {
  try {
    if (!process.env.CLAUDE_PROJECT_DIR || r?.code !== 0 || e?.agent_type !== SCAN_AGENT || !AGENT_ID.test(String(e.agent_id ?? ""))) return;
    const t = mcpTeile(e.tool_name), w = t ? (Object.hasOwn(LESEWEG, t.werkzeug) ? LESEWEG[t.werkzeug] : null) : e.tool_name === "Read" && unterArbeit(e.tool_input?.file_path) ? "datei" : null;
    const dir = join(projektDir(), ".exava"), p = lesenDatei(e.agent_id);
    if (!w || !existsSync(dir) || lstatSync(dir).isSymbolicLink()) return;
    let alt = null;
    try { const st = lstatSync(p); if (st.isSymbolicLink()) return; if (st.isFile()) alt = JSON.parse(readFileSync(p, "utf8")); } catch { /* noch keiner */ }
    const modell = typeof alt?.modell === "string" && MODELL_NAME.test(alt.modell) ? alt.modell : helferModell(e), tmp = `${p}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify({ weg: w, ...(modell ? { modell } : {}) })); renameSync(tmp, p);
  } catch { /* nie die Entscheidung ändern */ }
}
/** A-1071 P1: gelesen_von für ingest_document aus x-scan – <weg> bzw. <weg>:<modell> aus der Datei des Lesewegs (beim ingest_document wird kein Protokoll gelesen); unbekannt → null. */
const gelesenVon = (agentId) => {
  try { if (!AGENT_ID.test(String(agentId ?? ""))) return null; const p = lesenDatei(agentId); if (!lstatSync(p).isFile()) return null;
    const l = JSON.parse(readFileSync(p, "utf8")), w = Object.values(LESEWEG).includes(l?.weg) ? l.weg : null;
    return w ? (typeof l.modell === "string" && MODELL_NAME.test(l.modell) ? `${w}:${l.modell}` : w) : null; } catch { return null; }
};
export function scanIngest(name, ti, agentId) {
  const l = leaseRoh(), eigen = ti && typeof ti === "object" && !Array.isArray(ti) && Object.hasOwn(ti, "gelesen_von") ? Object.fromEntries(Object.entries(ti).filter(([k]) => k !== "gelesen_von")) : ti; // A-1071 P1: nur der Hook setzt gelesen_von
  if (!NUR(eigen, SCAN_INGEST_FELDER)) return nein(name, `im Helfer ${SCAN_AGENT} nur ${SCAN_EXAVA} mit den Feldern des Werkzeugs.`);
  if (!l || !UUID_LEASE.test(String(l.job_id)) || !UUID_LEASE.test(String(l.lauf_id)) || !Number.isInteger(l.lease_generation) || l.lease_generation < 1 || !/^[A-Za-z0-9_-]{20,200}$/.test(l.lease_token))
    return nein(name, `im Helfer ${SCAN_AGENT} nur mit der Lease des laufenden Auftrags (arbeit_holen).`);
  if (helferAuftrag(agentId) !== l.job_id) return nein(name, `im Helfer ${SCAN_AGENT} nur für den Auftrag, unter dem er gestartet wurde – nach einem Auftragswechsel übergibt er nichts mehr.`); // A-901 Teil 2
  const g = gelesenVon(agentId);
  return { code: 0, stdout: JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", permissionDecisionReason: "A-901 Lease aus .exava/lease.json",
    updatedInput: { ...eigen, job_id: l.job_id, lauf_id: l.lauf_id, lease_generation: l.lease_generation, lease_token: l.lease_token, ...(g ? { gelesen_von: g } : {}) } } }) };
}
/** A-930: EXAVA-Aufruf aus dem Helfer x-drive-batch – nur DRIVE_EXAVA mit dessen Feldern, nur unter der Lease des Auftrags, an den der Helfer gebunden ist; die Lease setzt der Hook. */
export function driveBatchExava(name, werkzeug, ti, agentId) {
  const l = leaseRoh(), felder = Object.hasOwn(DRIVE_EXAVA, werkzeug) ? DRIVE_EXAVA[werkzeug] : null;
  if (!felder || !NUR(ti ?? {}, [...felder, "job_id", "lauf_id", "lease_generation", "lease_token"])) return nein(name, `im Helfer ${DRIVE_AGENT} nur ${Object.keys(DRIVE_EXAVA).join(", ")} mit deren Feldern – arbeit_holen und complete_job ruft nur die Routine, die Lease setzt der Hook; dein erster Aufruf ist ausfuehrung_liste mit seite: 1.`); // A-930 Nachtrag
  if (!l || !UUID_LEASE.test(String(l.job_id)) || !UUID_LEASE.test(String(l.lauf_id)) || !Number.isInteger(l.lease_generation) || l.lease_generation < 1 || !/^[A-Za-z0-9_-]{20,200}$/.test(l.lease_token))
    return nein(name, `im Helfer ${DRIVE_AGENT} nur mit der Lease des laufenden Auftrags (setzt der Hook, nie arbeit_holen).`);
  if (helferAuftrag(agentId) !== l.job_id) return nein(name, `im Helfer ${DRIVE_AGENT} nur für den Auftrag, unter dem er gestartet wurde.`);
  return { code: 0, stdout: JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", permissionDecisionReason: "A-930 Lease aus .exava/lease.json",
    updatedInput: { ...(ti ?? {}), job_id: l.job_id, lauf_id: l.lauf_id, lease_generation: l.lease_generation, lease_token: l.lease_token } } }) };
}
/** Entscheidung für eine Hook-Eingabe (JSON-Text). `vertrag` ist austauschbar (Test). Liefert { code, stderr?, stdout? } (stdout nur für die Lease-Weitergabe an x-scan, A-901). */
export function entscheide(roh, { vertrag } = {}) {
  let eingabe;
  try { eingabe = JSON.parse(roh); } catch { return { code: 2, stderr: "Gesperrt (EXAVA-Hintergrund): Hook-Eingabe nicht lesbar." }; }
  if (!eingabe || typeof eingabe !== "object" || typeof eingabe.tool_name !== "string" || !eingabe.tool_name) return { code: 2, stderr: "Gesperrt (EXAVA-Hintergrund): Hook-Eingabe ohne tool_name." };
  messungMerken(eingabe); // A-1071 P1: Zähler je Auftrag vor der Entscheidung (wirft nie, ändert nichts)
  const r = entscheideEingabe(eingabe, vertrag);
  lesewegMerken(eingabe, r); // A-1071 P1: Leseweg des Helfers x-scan nach einer Freigabe (wirft nie, ändert nichts)
  return r;
}
/** Entscheidung für eine gelesene Hook-Eingabe (bis A-1071 der Rumpf von entscheide, unverändert). */
function entscheideEingabe(eingabe, vertrag) {
  const name = eingabe.tool_name, teile = mcpTeile(name);
  const scan = eingabe.agent_type != null; // A-532: Aufruf aus einem Helfer (agent_type laut Hook-Eingabe); nur x-scan, sonst gesperrt
  if (scan && !HELFER.has(eingabe.agent_type)) return nein(name, `Helfer ${String(eingabe.agent_type).slice(0, 60)} nicht freigegeben (nur ${SCAN_AGENT}, ${TRIAGE_AGENT}).`);
  if (scan) helferBinden(eingabe.agent_id, eingabe.agent_type, eingabe.effort); // A-901 Teil 2: der erste Aufruf bindet den Helfer an den laufenden Auftrag; A-1071: mit Rolle und Stufe
  const ag = eingabe.tool_input; // A-901 Teil 2: nur im Vordergrund und nur mit SCAN_AGENT_FELDER
  if (name === "Agent" || name === "Task") return !scan && NUR(ag, SCAN_AGENT_FELDER) && HELFER.has(ag.subagent_type) && ag.run_in_background === false && typeof ag.prompt === "string" && ag.prompt.trim() !== ""
    ? frei() : nein(name, `nur die Helfer ${SCAN_AGENT}, ${TRIAGE_AGENT} und ${DRIVE_AGENT} mit subagent_type, prompt, description und run_in_background: false (nie im Hintergrund, kein model/effort), aus dem Helfer kein weiterer.`);
  if (!teile && scan && eingabe.agent_type === DRIVE_AGENT && name === "Bash") return BASH_LADEN.test(String(eingabe.tool_input?.command ?? "")) ? bashPruefen(eingabe.tool_input) // A-930: WhatsApp-Dokument laden
    : nein(name, `im Helfer ${DRIVE_AGENT} nur curl -o nach arbeit/<dokument_id>.<endung> von der download_url aus exava_datei_lesen.`);
  if (!teile && !scan && name === "Bash") return bashPruefen(eingabe.tool_input);
  if (!teile && !scan && (name === "Write" || name === "Edit")) return schreibPruefen(name, eingabe.tool_input);
  if (!teile && !scan && (name === "WebSearch" || name === "WebFetch")) return webPruefen(name, eingabe.tool_input); // A-626 WEB
  if (!teile) return (scan ? SCAN_EINGEBAUT : EINGEBAUT).has(name) ? frei() : nein(name, "nur Read, Glob, Grep, Skill, ToolSearch, TodoWrite (Shell nur in festen Formen, Web nur in Arbeits-, Prüf- und Antwortaufträgen, Schreiben nur unter arbeit/, Helfer nur x-scan).");
  if (scan && eingabe.agent_type === SCAN_AGENT && teile.server === EXAVA_SERVER && teile.werkzeug === SCAN_EXAVA) return scanIngest(name, eingabe.tool_input, eingabe.agent_id); // A-901: genau dieses EXAVA-Werkzeug, Lease vom Hook
  if (scan && eingabe.agent_type === DRIVE_AGENT && teile.server === EXAVA_SERVER) return driveBatchExava(name, teile.werkzeug, eingabe.tool_input, eingabe.agent_id); // A-930
  if (scan && (teile.server === EXAVA_SERVER || teile.server.startsWith("exava") || gesteuert(teile))) return nein(name, `im Helfer ${SCAN_AGENT} nur ${SCAN_EXAVA} von „EXAVA Hintergrund“, keine anderen EXAVA- und keine Schreibwerkzeuge.`);
  if (teile.server === EXAVA_SERVER) return EXAVA_WERKZEUGE.has(teile.werkzeug) ? korbMeldung(name, teile.werkzeug, eingabe.tool_input) ?? verbrauchMelden(teile.werkzeug, eingabe.tool_input, eingabe) ?? gelesenVonEntfernen(teile.werkzeug, eingabe.tool_input) ?? startAdresse(name, teile.werkzeug, eingabe.tool_input) : nein(name, "EXAVA-Werkzeug nicht für die Hintergrundarbeit freigegeben.");
  if (gesteuert(teile) && !EXAVA_WERKZEUGE.has(teile.werkzeug) && !EXAVA_BEKANNT.has(teile.werkzeug)) return frei(); // A-531 AUSFUEHRUNG: Entscheidung bei x-ausfuehrung.mjs (Lease + Freigabe)
  if (teile.server === "exava") return nein(name, "die normale Verbindung „EXAVA“ ist in der Hintergrundarbeit gesperrt; EXAVA-Werkzeuge nur vom Connector „EXAVA Hintergrund“.");
  let server = teile.server, v;
  if (UUID_SERVER.test(server)) { // #1182: UUID-Name → der eine Vertragsserver, der genau dieses Werkzeug kennt; keiner oder mehrere → gesperrt
    v = vertrag ?? vertragLesen();
    const treffer = [...VERTRAG_SERVER].filter((s) => hat(v.server[s], teile.werkzeug));
    // Hauptsession 16.10.2026 (#1195): „EXAVA Hintergrund“ kann ebenfalls mit UUID erscheinen → nur die EXAVA_WERKZEUGE und nur ohne Namensgleichheit mit einem Vertragswerkzeug;
    // EXAVA erzwingt Profil, Lease und Rechte serverseitig (dieser Hook ist dort die zweite Schicht). Jedes andere EXAVA-Werkzeug per UUID bleibt gesperrt.
    if (treffer.length === 0 && scan) return teile.werkzeug === SCAN_EXAVA && eingabe.agent_type === SCAN_AGENT ? scanIngest(name, eingabe.tool_input, eingabe.agent_id) // A-901: wie EXAVA_WERKZEUGE per UUID
      : eingabe.agent_type === DRIVE_AGENT && Object.hasOwn(DRIVE_EXAVA, teile.werkzeug) ? driveBatchExava(name, teile.werkzeug, eingabe.tool_input, eingabe.agent_id) : nein(name, `im Helfer ${SCAN_AGENT} nur Drive und Gmail lesend.`); // A-930
    if (treffer.length === 0 && EXAVA_WERKZEUGE.has(teile.werkzeug)) return korbMeldung(name, teile.werkzeug, eingabe.tool_input) ?? verbrauchMelden(teile.werkzeug, eingabe.tool_input, eingabe) ?? gelesenVonEntfernen(teile.werkzeug, eingabe.tool_input) ?? startAdresse(name, teile.werkzeug, eingabe.tool_input);
    if (treffer.length === 0) return fremdLesend(name, teile.werkzeug, eingabe.tool_input);
    if (treffer.length !== 1) return nein(name, "capability_missing: Connector mit UUID-Namen, Werkzeug mehrdeutig, gesperrt bis geprüft.");
    server = treffer[0];
  }
  if (scan && !SCAN_SERVER.has(server)) return nein(name, `im Helfer ${SCAN_AGENT} nur Drive und Gmail lesend.`);
  if (!VERTRAG_SERVER.has(server)) return server.startsWith("exava") ? nein(name, "EXAVA-Werkzeuge nur vom Connector „EXAVA Hintergrund“.") : fremdLesend(name, teile.werkzeug, eingabe.tool_input);
  v ??= vertrag ?? vertragLesen();
  const e = hat(v.server[server], teile.werkzeug) ? v.server[server][teile.werkzeug] : null;
  if (!e) return nein(name, `nicht im Werkzeugvertrag (${v.version}), gesperrt bis geprüft.`);
  const hy = scan && eingabe.agent_type !== DRIVE_AGENT ? null : hygieneAusnahme(server, teile.werkzeug, eingabe.tool_input ?? {}); // A-534; A-930: x-drive-batch benennt am Ort um und lädt WhatsApp-Dokumente hoch (dieselben Prüfungen)
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
/** A-1071 P1: .exava/messung.jsonl bleibt klein – darüber wird nichts mehr angehängt (rund 60 Bytes je Aufruf). */
export const MESSUNG_DATEI_MAX = 512 * 1024;
/** A-1071 P1: Zähler je Auftrag (Muster blockMerken) – Hauptsitzung (kein agent_type) je Werkzeug außer SubagentHandback { j: job_id der Lease, a: "t", s: effort.level } (nur mit einem der
 *  fünf Namen); SubagentHandback (mit oder ohne agent_type) { j, a: "r", r: Helfertyp bzw. helfer, z: Länge von tool_input.message } – nur die Länge, nie der Text (G8). Nur im Hook-Lauf,
 *  nur mit .exava und Lease, nie über einen Symlink, nur anhängen (Hooks laufen parallel); jeder Fehler wird ignoriert – die Entscheidung bleibt (G7). */
export function messungMerken(e) {
  try {
    if (!process.env.CLAUDE_PROJECT_DIR || !e || typeof e !== "object") return;
    const l = leaseRoh(), dir = join(projektDir(), ".exava"), datei = join(dir, "messung.jsonl");
    if (!l || !UUID_LEASE.test(String(l.job_id)) || !existsSync(dir) || lstatSync(dir).isSymbolicLink()) return;
    const m = e.tool_input?.message, s = stufeVon(e.effort);
    const zeile = e.tool_name === "SubagentHandback" ? { j: l.job_id, a: "r", r: HELFER.has(e.agent_type) ? e.agent_type : "helfer", ...(typeof m === "string" ? { z: m.length } : {}) }
      : e.agent_type == null && s ? { j: l.job_id, a: "t", s } : null;
    if (!zeile || (existsSync(datei) && (lstatSync(datei).isSymbolicLink() || lstatSync(datei).size > MESSUNG_DATEI_MAX))) return;
    appendFileSync(datei, JSON.stringify(zeile) + "\n");
  } catch { /* nie die Entscheidung ändern */ }
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
