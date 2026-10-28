#!/usr/bin/env node
// A-529 VORLAGE: Kopie von docs/x2/spike/mandant-repo/_claude/hooks/sperre.mjs (Logik unverändert bis auf lesend(): A-531 HOOK-WORTLISTE, nur verschärfend; scripts/test/a529-vorlage.ts prüft die Gleichheit von sperrgrund);
// entfernt sind nur der Spike-Kanarienvogel und die Abhängigkeit von x-freigabe.mjs (in der Hintergrundarbeit gibt es keinen Versand; alles Schreibende sperrt hintergrund-policy.mjs).
// Original: PreToolUse-Sperre für alle MCP-Werkzeuge (X 2.0, G5/G6/G7). Zweite Sperre neben permissions.deny, nur noch der Zielbild-Kern (A-498): nichts löschen
// Original: (auf jedem Server, Papierkorb/Spam auch über Labels und Drive-`trashed`), keine Zahlung ausführen (jeder Server außer exava), keine Gmail-Labels anlegen oder setzen (A-493), X ändert seine eigenen Sperren nicht
// Original: (`.claude/` über einen anderen Connector). Alles, was etwas verändert oder hinausgeht, entscheidet x-freigabe (Matcher mcp__.*, jedes MCP-Werkzeug erreicht ihn).
// Original: Fail closed: Wer die Anfrage nicht lesen kann oder abstürzt, endet mit Exit 2 (dazu `"onFailure": "block"` in settings.json).
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Kern-Connectoren und Wortlisten wortgleich mit x-freigabe.mjs (die Sperre läuft als geprüfte Einzelkopie und importiert nichts; hooks-test.mjs prüft die Gleichheit). */
export const KERN = new Set(["gmail", "google_drive", "google_calendar", "exava"]);
export const LESEN = new Set(["get", "list", "search", "read", "fetch", "find", "describe", "download", "estimate", "check", "query", "compute", "preview", "count", "lookup", "view", "show", "inspect", "guide", "suggest"]);
export const SCHREIBEN = new Set(["create", "update", "delete", "remove", "send", "publish", "upload", "add", "set", "put", "patch", "write", "share", "invite", "move", "rename", "copy", "archive",
  "merge", "push", "fire", "trigger", "approve", "submit", "cancel", "pause", "resume", "enable", "disable", "mark", "apply", "assign", "transfer", "pay", "duplicate", "manage", "run", "execute",
  "start", "stop", "reply", "forward", "respond", "edit", "insert", "replace", "import", "export", "sync", "subscribe", "unsubscribe", "label", "trash", "spam", "comment", "resolve", "revoke", "grant",
  "deploy", "close", "lock", "schedule", "save", "reset", "clear", "purge", "drop", "destroy", "kill", "terminate"]);
/** Nichts löschen (G6): auf jedem Server, auch mit Freigabe; frei nur, wenn das erste Wort wiederherstellt (Gmail untrash_message, unmark_thread_spam). „remove“ bleibt Werkzeug-Freigabe. */
export const LOESCHEN = new Set(["delete", "trash", "spam", "destroy", "purge", "erase", "wipe", "drop", "truncate"]);
export const WIEDERHERSTELLEN = new Set(["untrash", "undelete", "unmark", "restore", "recover"]);
/** Zahlungen ausführen ist auf jedem Server gesperrt, auch mit Freigabe (G5, Go A-498: „Gesperrt bleiben Löschen und das Ausführen von Zahlungen“); exava bereitet nur vor. */
export const ZAHLEN = new Set(["pay", "pays", "payment", "payments", "payout", "payouts", "charge", "charges", "refund", "refunds", "purchase", "purchases", "buy", "checkout", "wire", "remit",
  "remittance", "sepa", "withdraw", "withdrawal"]);
/** „transfer“ ist nur zusammen mit Geld eine Zahlung (transfer_repository bleibt Werkzeug-Freigabe). */
export const GELD = new Set(["funds", "fund", "money", "balance", "cash", "iban", "sepa", "payment"]);
/** Wörtlich der Matcher von x-freigabe und versand-melden in settings.json (hooks-test.mjs und x2-hook-angriff.ts prüfen die Gleichheit): jedes MCP-Werkzeug (A-498). */
export const FREIGABE_MATCHER = /mcp__.*/;
/** A-493: in Gmail keine Labels oder Ordner anlegen und keine eigenen Labels setzen – der Kunde will keine Ordner, archiviert ist eine Mail ohne INBOX.
 *  Gesperrt ist auch das Setzen eigener Labels. Setzen dürfen nur diese Systemlabels; Entfernen (unlabel_*, removeLabelIds) bleibt frei – so archiviert X (INBOX entfernen). */
const LABEL_SETZEN_FREI = new Set(["INBOX", "UNREAD", "STARRED", "IMPORTANT"]);

/** Wörter eines Werkzeugnamens (Originalschreibweise): getrennt an _ - . und am camelCase-Übergang, klein. */
/** A-531 HOOK-WORTLISTE: nach einem Verbindungswort muss wieder ein Lesewort stehen (fetch_and_post, get_or_upsert → nicht lesend). */
export const VERBINDUNG = new Set(["and", "or", "then", "plus"]);
export const woerter = (name) => String(name ?? "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").split(/[\s_.-]+/).filter(Boolean).map((w) => w.toLowerCase());
/** Lesend: erstes Wort (nach führendem „bulk“) aus der Lese-Liste, kein Wort aus der Schreib-Liste. Unbekannt = nicht lesend (fail closed). */
export function lesend(name) {
  const w = woerter(name);
  if (w[0] === "bulk") w.shift();
  return w.length > 0 && LESEN.has(w[0]) && !w.some((x) => SCHREIBEN.has(x)) && w.every((x, i) => !VERBINDUNG.has(w[i - 1]) || LESEN.has(x));
}

/** Meldung für ein gesperrtes Werkzeug, sonst null. `server`/`werkzeug` sind klein geschrieben, `original` = Werkzeugname in Originalschreibweise (camelCase);
 *  `eingabe` = tool_input (Labels/Felder, die das Löschverbot umgehen). */
export function sperrgrund(server, werkzeug, eingabe = {}, original = werkzeug) {
  const lw = woerter(original);
  if (!WIEDERHERSTELLEN.has(lw[0]) && lw.some((w) => LOESCHEN.has(w))) return "Gesperrt (G6): Nichts löschen. Archivieren heißt: Label INBOX entfernen (Gmail unlabel_message/unlabel_thread).";
  const w = woerter(original);
  if (server !== "exava" && !lesend(original) && (w.some((x) => ZAHLEN.has(x)) || (w.includes("transfer") && w.some((x) => GELD.has(x))))) return "Gesperrt (G5): Zahlungen bereitest du nur vor (mcp__exava__zahlung_vorbereiten); die TAN gibt der Kunde in der Bank-App.";
  const roh = JSON.stringify(eingabe ?? {});
  if (!KERN.has(server) && !lesend(original) && /\.claude(\/|\\\\)/i.test(roh)) return "Gesperrt (G7): X ändert seine eigenen Sperren nicht.";
  if (server === "gmail" && /label/.test(werkzeug) && /"(TRASH|SPAM)"/i.test(roh)) return "Gesperrt (G6): Papierkorb/Spam auch nicht über Labels. Archivieren heißt: Label INBOX entfernen.";
  if (server === "gmail" && /^(create_label|update_label|apply_sensitive_(message|thread)_label)$/.test(werkzeug)) return "Gesperrt (A-493): Keine Labels oder Ordner in Gmail anlegen. Archivieren heißt nur: Label INBOX entfernen (unlabel_thread).";
  if (server === "gmail" && /^(label_(thread|message)|update_message_labels)$/.test(werkzeug)) {
    const setzen = werkzeug === "update_message_labels" ? (eingabe?.addLabelIds ?? eingabe?.add_label_ids) : (eingabe?.labelIds ?? eingabe?.label_ids);
    if (Array.isArray(setzen) && setzen.some((l) => !LABEL_SETZEN_FREI.has(String(l).toUpperCase()))) return "Gesperrt (A-493): Keine eigenen Labels setzen – nur INBOX, UNREAD, STARRED, IMPORTANT. Archivieren heißt: Label INBOX entfernen.";
  }
  if (server === "google_drive" && /"trashed"\s*:/.test(roh)) return "Gesperrt (G6): Nichts in den Papierkorb. Verschieben oder Umbenennen ist erlaubt.";
  return null;
}

function hauptprogramm() {
  const sperren = (grund) => { process.stderr.write(grund); process.exit(2); };
  process.on("uncaughtException", () => sperren("Sperre: interner Fehler – gesperrt."));
  let eingabe;
  try { eingabe = JSON.parse(readFileSync(0, "utf8")); } catch { sperren("Sperre: Anfrage nicht lesbar – gesperrt."); }
  try {
    const name = String(eingabe?.tool_name ?? "");
    const teile = /^mcp__(.+?)__(.+)$/.exec(name);
    if (!teile) process.exit(0); // kein MCP-Werkzeug: normale Berechtigungsprüfung
    // Servername klein und mit „_“ statt „-“: Routinen aus der Oberfläche heißen „Google-Drive“/„Google-Calendar“, über die API angelegte „Google_Drive“/„Google_Calendar“ (12.10.2026)
    const server = teile[1].toLowerCase().replace(/-/g, "_"), werkzeug = teile[2].toLowerCase(), original = teile[2];
    const grund = sperrgrund(server, werkzeug, eingabe?.tool_input, original);
    if (grund) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: grund } }));
    process.exit(0);
  } catch { sperren("Sperre: interner Fehler – gesperrt."); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) hauptprogramm();
