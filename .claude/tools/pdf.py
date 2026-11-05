# A-531 DATEI (VORLAGE-2 PR 9): Renderer der Hintergrundroutine – JSON (arbeit/<name>.json) → PDF (arbeit/<name>.pdf). Spezifikation docs/umbau/a531/datei-upload.md §5.1.
# Nur Standardbibliothek + reportlab; kein Netz, kein Unterprozess, kein eval/exec. Inhalt, Rechenwerte und Gestaltung entscheidet Claude (E-1116); dieses Skript setzt nur.
# Aufruf (nur so lässt ihn hintergrund-policy.mjs zu, SHA-256 geprüft): /usr/bin/python3 -I .claude/tools/pdf.py arbeit/<name>.json arbeit/<name>.pdf
# A-657 (GO pdf.py, Bauherr 22.10.2026): --mail arbeit/gmail-<id>.eml arbeit/gmail-<id>-mail.pdf – HTML-Belegmail 1:1 als PDF; Kopf und Inhalt liest das Skript selbst aus der
# vom Hook gesicherten Rohmail (Originalreihenfolge), Claude liefert keinen Inhalt.
# A-973 (Bauherr 05.11.2026): Satz wie die Druckansicht – Datentabellen mit Spalten (Beträge rechtsbündig), Überschriften und Fettdruck wie im Original (auch über einfache
# CSS-Klassen), Bezeichnung + Betrag als Zeile, Inline-Elemente ohne Leerraum mit „ · “ getrennt, Links nur als Linktext (Abmelde-Links fallen weg), keine Bilder (nichts aus
# dem Netz), Verborgenes (display:none, Vorschautext) fehlt. Kopf-Tabelle und Fußzeile (Message-ID, SHA-256 der Rohmail) wie bisher, die Textebene bleibt durchsuchbar.
import email, email.policy, hashlib, json, os, re, sys
from html.parser import HTMLParser
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, ListFlowable, ListItem, Image, PageBreak, HRFlowable

DOK = {"titel", "untertitel", "absender", "datum", "seitenformat", "akzentfarbe", "logo", "fusszeile"}
BLOCK = {"ueberschrift": {"text", "ebene"}, "absatz": {"text"}, "liste": {"punkte", "nummeriert"}, "tabelle": {"kopf", "zeilen", "ausrichtung", "summenzeile", "spaltenbreiten"},
         "kennzahlen": {"paare"}, "bild": {"datei", "breite_mm", "unterschrift"}, "trenner": set(), "seitenumbruch": set()}

def fehler(text):
    print(json.dumps({"fehler": text}, ensure_ascii=False)); sys.exit(1)

def pfad(p, endung, neu):
    basis = os.path.realpath("arbeit")
    if not isinstance(p, str) or not re.fullmatch(r"arbeit/[A-Za-z0-9._-]{1,140}(__#[0-9a-f]{8})?\." + endung, p) or ".." in p or os.path.islink(p): fehler(f"Pfad {p!r} nicht erlaubt")
    if os.path.dirname(os.path.realpath(p)) != basis: fehler(f"Pfad {p!r} außerhalb von arbeit/")
    if neu and os.path.exists(p): fehler(f"{p} existiert schon")
    return p

def schluessel(o, erlaubt, wo):
    if not isinstance(o, dict): fehler(f"{wo}: Objekt erwartet")
    fremd = set(o) - erlaubt
    if fremd: fehler(f"{wo}: unbekannte Schlüssel {sorted(fremd)}")

def text(t):  # Auszeichnung nur **fett** und *kursiv*; alles andere wird maskiert
    t = str(t).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return re.sub(r"\*(.+?)\*", r"<i>\1</i>", re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t))

# ---------- A-973: HTML-Belegmail → Blöcke (Zeile, Linie, Paare, Tabelle) → PDF ----------
LEER = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
WEG = {"head", "style", "script", "title", "template", "img", "picture", "svg", "video", "audio", "iframe", "object", "map"}  # nichts Verborgenes, nichts aus dem Netz
BLOECKE = {"address", "article", "aside", "blockquote", "body", "caption", "center", "dd", "details", "div", "dl", "dt", "fieldset", "figcaption", "figure", "footer", "form",
           "h1", "h2", "h3", "h4", "h5", "h6", "header", "html", "li", "main", "nav", "ol", "p", "pre", "section", "summary", "tbody", "td", "tfoot", "th", "thead", "tr", "ul"}
SCHLIESST_P = {"address", "article", "aside", "blockquote", "center", "div", "dl", "fieldset", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr",
               "main", "nav", "ol", "p", "pre", "section", "table", "ul"}
FETT, KURSIV, MAX_TIEFE = {"b", "strong", "th", "h1", "h2", "h3", "h4", "h5", "h6"}, {"i", "em", "cite"}, 200
ABMELDEN = re.compile(r"unsubscribe|abmelde|abbestell|austragen|opt-?out|toggle-renewal-receipts|deaktivieren", re.I)
UNSICHTBAR = re.compile("[\x00-\x08\x0e-\x1f\x7f\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u206a-\u206f\u3164\ufeff\uffa0]")
LEERRAUM, WAEHRUNG = re.compile("[ \t\n\r\f\v\u2028\u2029]+"), r"(?:€|EUR|USD|US\$|\$|£|GBP|CHF)"
BETRAG = re.compile(r"[-−–+]?\s?(?:" + WAEHRUNG + r"\s?)?[-−–]?\d{1,3}(?:[.,'\u00a0\u202f ]?\d{3})*(?:[.,]\d{1,2})?(?:\s?" + WAEHRUNG + r"){0,2}")
RAND = [("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (0, -1), 0), ("RIGHTPADDING", (-1, 0), (-1, -1), 0)]

def maske(t):
    return str(t).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

def ist_betrag(t):  # „8,40 €“, „$23.80“, „-0,00 € EUR“: Zahl mit Währung oder zwei Nachkommastellen
    t = t.strip()
    return len(t) <= 32 and bool(BETRAG.fullmatch(t)) and bool(re.search(WAEHRUNG + r"|\d[.,]\d\d$", t))

def deklarationen(s):  # CSS-Deklarationen → {Eigenschaft: Wert}, nur was Fettdruck, Größe und Sichtbarkeit bestimmt
    d = {}
    for teil in str(s).split(";"):
        k, _, v = teil.partition(":"); k = k.strip().lower()
        if k in ("font-weight", "font-style", "font-size", "display", "visibility", "opacity", "max-height", "height", "overflow"): d[k] = v.replace("!important", "").strip().lower()
    return d

def css_regeln(css):  # einfache Klassenregeln „.klasse{…}“ bzw. „p.klasse{…}“ aus <style>; @-Blöcke (@media = Mobilansicht) und Selektoren mit Kontext bleiben außen vor
    regeln, vor, block, tiefe = {}, [], [], 0
    for ch in re.sub(r"/\*.*?\*/", "", css[:500000], flags=re.S):
        if tiefe == 0:
            if ch == "{": tiefe, block = 1, []
            elif ch == ";" and "".join(vor).strip().startswith("@"): vor = []
            else: vor.append(ch)
            continue
        if ch == "{": tiefe += 1
        elif ch == "}":
            tiefe -= 1
            if tiefe == 0:
                sel, vor = "".join(vor).strip(), []
                d = {} if sel.startswith("@") else deklarationen("".join(block))
                for s in sel.split(",") if d else []:
                    m = re.fullmatch(r"[a-z0-9]*\.([A-Za-z0-9_-]+)", s.strip())
                    if m: regeln.setdefault(m.group(1), {}).update(d)
                continue
        block.append(ch)
    return regeln

def px(v):  # Schriftgröße in px (pt umgerechnet), sonst 0
    m = re.match(r"(\d+(?:\.\d+)?)\s*(px|pt)\b", v or "")
    return float(m.group(1)) * (4 / 3 if m.group(2) == "pt" else 1) if m else 0

def versteckt(d):  # display:none, visibility:hidden, opacity:0, Höhe 0 mit overflow:hidden (Vorschautext)
    return d.get("display") == "none" or d.get("visibility") == "hidden" or d.get("opacity") in ("0", "0.0", "0%") \
        or (d.get("overflow") == "hidden" and "0" in (d.get("max-height", "").replace("px", ""), d.get("height", "").replace("px", "")))

def gewicht(d, erbe):  # fett laut CSS (bold, > 500), sonst geerbt
    w = d.get("font-weight", "")
    return True if w in ("bold", "bolder") else False if w in ("normal", "lighter") else int(w) > 500 if w.isdigit() else erbe

def schraeg(d, erbe):
    s = d.get("font-style", "")
    return True if s in ("italic", "oblique") else False if s == "normal" else erbe

def nur_text(k):
    return "".join(x if isinstance(x, str) else "" if x["tag"] in WEG else nur_text(x) for x in k["k"])

def hat_tabelle(k):
    return any(isinstance(x, dict) and (x["tag"] == "table" or hat_tabelle(x)) for x in k["k"])

def tabellenzeilen(tab):  # tr direkt oder in thead/tbody/tfoot
    aus = []
    for x in tab["k"]:
        if isinstance(x, dict) and x["tag"] == "tr": aus.append(x)
        elif isinstance(x, dict) and x["tag"] in ("thead", "tbody", "tfoot"): aus += [y for y in x["k"] if isinstance(y, dict) and y["tag"] == "tr"]
    return aus

def klartext(runs):
    return "".join(r[0] for r in runs)

def zellentext(c):
    return " ".join(klartext(r) for r in c["zeilen"]).strip()

def trenner(l, r):  # zwei Inline-Elemente ohne Leerraum („19 %“ + „1,60 €“): „ · “ dazwischen (nach „:“ ein Leerzeichen) – nicht mitten in Zahl, Betrag oder Wort, nicht vor Satzzeichen
    if l.isspace() or r.isspace() or (l.isalpha() and r.isalpha()) or r in ",.;:!?)%" or l in "([„\"'/-":
        return False
    return not ((l.isdigit() or l in ".,") and (r.isdigit() or r in ".,") or (l in "€$£" and r.isdigit()) or (l.isdigit() and r in "€$£"))

def runs_fertig(stuecke):  # Textstücke einer Zeile → [[Text, fett, kursiv]]: Leerraum wie im Browser zusammengefasst, „ · “ zwischen Inline-Elementen ohne Leerraum
    aus, grenze = [], ""
    for s in stuecke:
        if s == "E": grenze = "E" if aus else ""
        elif s == "S": grenze = "ES" if grenze == "E" else ""
        else:
            t = LEERRAUM.sub(" ", UNSICHTBAR.sub("", s[0]))
            if aus and aus[-1][0].endswith(" ") and t.startswith(" "): t = t[1:]
            if not t or (not aus and not t.strip()): continue
            if grenze == "ES" and trenner(aus[-1][0][-1], t[0]): aus.append([" " if aus[-1][0][-1] == ":" else " · ", False, False])
            grenze = ""
            if aus and aus[-1][1:] == [s[1], s[2]]: aus[-1][0] += t
            else: aus.append([t, s[1], s[2]])
    while aus and not aus[-1][0].strip(): aus.pop()
    if aus: aus[0][0], aus[-1][0] = aus[0][0].lstrip(), aus[-1][0].rstrip()
    return aus

class Baum(HTMLParser):  # kleiner DOM-Baum der HTML-Mail (Tiefe gedeckelt, fehlende End-Tags wie im Browser ergänzt); CSS aus <style> gesammelt
    def __init__(self):
        super().__init__(convert_charrefs=True); self.wurzel = {"tag": "", "a": {}, "k": []}; self.stapel, self.css = [self.wurzel], []
    def neu(self, tag, attrs):
        k = {"tag": tag, "a": {n: v or "" for n, v in attrs}, "k": []}; self.stapel[-1]["k"].append(k); return k
    def schliessen(self, tags, grenze):
        for i in range(len(self.stapel) - 1, 0, -1):
            if self.stapel[i]["tag"] in tags: del self.stapel[i:]; return
            if self.stapel[i]["tag"] in grenze: return
    def handle_starttag(self, tag, attrs):
        if tag in SCHLIESST_P and self.stapel[-1]["tag"] == "p": self.stapel.pop()
        if tag in ("li", "dt", "dd") and self.stapel[-1]["tag"] in ("li", "dt", "dd"): self.stapel.pop()
        if tag in ("td", "th"): self.schliessen({"td", "th"}, {"tr", "table"})
        elif tag == "tr": self.schliessen({"tr"}, {"table"})
        elif tag in ("thead", "tbody", "tfoot"): self.schliessen({"thead", "tbody", "tfoot"}, {"table"})
        k = self.neu(tag, attrs)
        if tag not in LEER and len(self.stapel) < MAX_TIEFE: self.stapel.append(k)
    def handle_startendtag(self, tag, attrs):  # <br/>, <img/> und leere Elemente (<div/>) bleiben nie offen
        self.neu(tag, attrs)
    def handle_endtag(self, tag):
        if tag == "br": self.neu("br", []); return
        self.schliessen({tag}, set() if tag == "table" else {"table"} if tag in ("td", "th", "tr", "thead", "tbody", "tfoot", "caption") else {"td", "th", "table", "caption"})
    def handle_data(self, d):
        if self.stapel[-1]["tag"] == "style": self.css.append(d)
        self.stapel[-1]["k"].append(d)

class Satz:  # Baum → Blöcke in Originalreihenfolge: ("zeile", runs, ebene), ("linie",), ("tabelle", zeilen, spalten)
    def __init__(self, regeln):
        self.regeln, self.bloecke, self.stuecke, self.ebene = regeln, [], [], 0
    def stil(self, k):
        d = {}
        for c in k["a"].get("class", "").split(): d.update(self.regeln.get(c, {}))
        d.update(deklarationen(k["a"].get("style", ""))); return d
    def umbruch(self):
        runs = runs_fertig(self.stuecke); self.stuecke = []
        if runs: self.bloecke.append(("zeile", runs, self.ebene))
    def lauf(self, k, fett, kursiv):
        for x in k["k"]:
            if isinstance(x, str): self.stuecke.append((x, fett, kursiv)); continue
            t, d = x["tag"], self.stil(x)
            if t in WEG or versteckt(d) or (t == "a" and ABMELDEN.search(x["a"].get("href", "") + " " + nur_text(x))): continue
            if t in ("br", "hr"):
                self.umbruch()
                if t == "hr": self.bloecke.append(("linie",))
                continue
            f, i = gewicht(d, fett or t in FETT), schraeg(d, kursiv or t in KURSIV)
            if t == "table":
                self.umbruch(); r = None if hat_tabelle(x) else self.raster(x, f, i)
                if r: self.bloecke.append(r)
                else: self.lauf(x, f, i)
                self.umbruch(); continue
            if t not in BLOECKE: self.stuecke.append("S"); self.lauf(x, f, i); self.stuecke.append("E"); continue
            self.umbruch(); alt, groesse = self.ebene, px(d.get("font-size"))
            if t[0] == "h" and t[1:].isdigit(): self.ebene = min(int(t[1:]), 3)
            elif groesse >= 19 and len(nur_text(x).strip()) <= 80 and not any(isinstance(y, dict) and y["tag"] in BLOECKE for y in x["k"]): self.ebene = 1 if groesse >= 26 else 2
            if t == "li": self.stuecke.append(("• ", f, i))
            self.lauf(x, f, i); self.umbruch(); self.ebene = alt
    def raster(self, tab, f, i):  # Datentabelle (ohne Untertabelle, ≥ 2 Spalten mit Inhalt, ≤ 300 Zeilen, ≤ 12 Spalten, ≤ 600 Zeichen je Zelle), sonst None: der Inhalt fließt
        zeilen = []
        for tr in tabellenzeilen(tab):
            dz = self.stil(tr)
            if versteckt(dz): continue
            z, fz = [], gewicht(dz, f)
            for td in [y for y in tr["k"] if isinstance(y, dict) and y["tag"] in ("td", "th")]:
                d, sp = self.stil(td), td["a"].get("colspan", "1").strip()
                if versteckt(d): continue
                s = Satz(self.regeln); s.lauf(td, gewicht(d, fz or td["tag"] == "th"), schraeg(d, i)); s.umbruch()
                c = {"zeilen": [b[1] for b in s.bloecke if b[0] == "zeile"], "kopf": td["tag"] == "th", "spanne": max(1, min(12, int(sp))) if sp.isdigit() else 1}
                if len(zellentext(c)) > 600: return None
                z.append(c)
            if any(zellentext(c) for c in z): zeilen.append(z)
            if len(zeilen) > 300: return None
        spalten, gefuellt = 0, set()
        for z in zeilen:
            p = 0
            for c in z:
                c["pos"] = p; p += c["spanne"]
                if zellentext(c): gefuellt.add(c["pos"])
            spalten = max(spalten, p)
        if len(gefuellt) < 2 or spalten > 12: return None
        if all(c["spanne"] == 1 for z in zeilen for c in z):  # leere Spalten (z. B. die Bildspalte) fallen weg
            neu = {p: n for n, p in enumerate(sorted(gefuellt))}
            zeilen, spalten = [[dict(c, pos=neu[c["pos"]]) for c in z if c["pos"] in neu] for z in zeilen], len(neu)
        return ("tabelle", zeilen, spalten)

def gruppieren(bloecke):  # Bezeichnung + Betrag (Folgezeile nur ein Betrag) bzw. „Bezeichnung:“ + Wert werden Paare – nebeneinander wie im Original
    aus = []
    for b in bloecke:
        v = aus[-1] if aus and aus[-1][0] == "zeile" and not aus[-1][2] else None
        if v and b[0] == "zeile" and not b[2]:
            lt, rt = klartext(v[1]), klartext(b[1])
            art = "betrag" if ist_betrag(rt) and not ist_betrag(lt) and len(lt) <= 120 else "wert" if lt.endswith(":") and len(lt) <= 60 and not rt.endswith(":") and len(rt) <= 200 else None
            if art:
                aus.pop()
                if aus and aus[-1][0] == "paare" and aus[-1][1] == art: aus[-1][2].append((v[1], b[1]))
                else: aus.append(("paare", art, [(v[1], b[1])]))
                continue
        aus.append(b)
    return aus

def markup(runs):  # [[Text, fett, kursiv]] → reportlab-Auszeichnung, Text maskiert
    aus = []
    for t, f, k in runs:
        t = f"<i>{maske(t)}</i>" if k else maske(t)
        aus.append(f"<b>{t}</b>" if f else t)
    return "".join(aus)

def paare_tabelle(b, st, breite):  # zwei Spalten: Bezeichnung + Betrag rechtsbündig (45 mm) bzw. Bezeichnung (45 mm) + Wert
    l = 45 * mm
    t = Table([[Paragraph(markup(x), st["n"]), Paragraph(markup(y), st["r"] if b[1] == "betrag" else st["n"])] for x, y in b[2]], colWidths=[breite - l, l] if b[1] == "betrag" else [l, breite - l])
    t.setStyle(TableStyle(RAND + [("TOPPADDING", (0, 0), (-1, -1), 1), ("BOTTOMPADDING", (0, 0), (-1, -1), 1)])); return t

def spaltenbreiten(gew, breite):  # passt alles: anteilig auffüllen; zu breit: nur die breitesten Spalten kürzen (gemeinsamer Deckel), schmale behalten ihre Textbreite
    if sum(gew) <= breite: return [breite * g / sum(gew) for g in gew]
    rest, offen = breite, sorted(gew)
    for i, g in enumerate(offen):
        deckel = rest / (len(offen) - i)
        if g > deckel: return [min(x, deckel) for x in gew]
        rest -= g
    return gew

def raster_tabelle(b, st, breite):  # Datentabelle: Spaltenbreiten nach Textbreite, Betragsspalten rechtsbündig, Kopfzeile (th bzw. ganz fett) mit Linie
    _, zeilen, n = b
    gew = [20.0] * n
    for z in zeilen:
        for c in z:
            for r in c["zeilen"] if c["spanne"] == 1 else []:
                gew[c["pos"]] = max(gew[c["pos"]], min(breite * 0.6, sum(pdfmetrics.stringWidth(x[0], st[1].fontName if x[1] else st["n"].fontName, st["n"].fontSize) for x in r)) + (6 if c["pos"] in (0, n - 1) else 12) + 1)
    kopf = len(zeilen) > 1 and all(c["kopf"] or all(r[1] for x in c["zeilen"] for r in x if r[0].strip()) for c in zeilen[0] if zellentext(c))
    werte = lambda p: [c for z in (zeilen[1:] if kopf else zeilen) for c in z if c["pos"] == p and zellentext(c)]
    rechts = {p for p in range(n) if werte(p) and all(ist_betrag(klartext(c["zeilen"][0])) for c in werte(p))}
    daten, stil = [], RAND + [("LINEBELOW", (0, 0), (-1, -1), 0.25, colors.lightgrey)] + ([("LINEBELOW", (0, 0), (-1, 0), 0.8, colors.black)] if kopf else [])
    for zi, z in enumerate(zeilen):
        reihe = [""] * n
        for c in z:
            reihe[c["pos"]] = Paragraph("<br/>".join(markup(r) for r in c["zeilen"]), st["r"] if c["pos"] in rechts else st["n"])
            if c["spanne"] > 1 and c["pos"] < n - 1: stil.append(("SPAN", (c["pos"], zi), (min(n - 1, c["pos"] + c["spanne"] - 1), zi)))
        daten.append(reihe)
    t = Table(daten, colWidths=spaltenbreiten(gew, breite), repeatRows=1 if kopf else 0); t.setStyle(TableStyle(stil)); return t

def flach(b):  # Rückfall ohne Tabellen: jedes Paar, jede Tabellenzeile eine Zeile, Zellen mit „ · “
    if b[0] == "paare": return [x + [[" · ", False, False]] + y for x, y in b[2]]
    aus = []
    for z in b[1]:
        r = []
        for c in z:
            for x in c["zeilen"]: r += ([[" · ", False, False]] if r else []) + x
        aus.append(r)
    return aus

def gestalten(bloecke, st, breite, ohne_tabellen=False):
    teile = []
    for b in bloecke:
        if b[0] == "zeile": teile.append(Paragraph(markup(b[1]), st[b[2]] if b[2] else st["n"]))
        elif b[0] == "linie": teile.append(HRFlowable(width="100%", thickness=0.4, color=colors.lightgrey, spaceBefore=3, spaceAfter=3))
        elif ohne_tabellen: teile += [Paragraph(markup(r), st["n"]) for r in flach(b)]
        else: teile += [Spacer(1, 1 * mm), paare_tabelle(b, st, breite) if b[0] == "paare" else raster_tabelle(b, st, breite), Spacer(1, 1.5 * mm)]
    return teile

def mail(ein, aus, schrift, fett, normal):
    if aus != ein[:-4] + "-mail.pdf": fehler("Ausgabe muss arbeit/<name>-mail.pdf zur Eingabe arbeit/<name>.eml sein")
    with open(ein, "rb") as f: roh = f.read()
    m = email.message_from_bytes(roh, policy=email.policy.default)
    kopf = [(k, " ".join(str(m.get(h, "")).split())) for k, h in (("Von", "From"), ("An", "To"), ("Datum", "Date"), ("Betreff", "Subject"), ("Message-ID", "Message-ID"))]
    teil = m.get_body(preferencelist=("html", "plain"))
    if teil is None: fehler("Mail ohne HTML- oder Textteil")
    try: inhalt = teil.get_content()
    except (LookupError, KeyError): inhalt = (teil.get_payload(decode=True) or b"").decode("utf-8", "replace")
    bloecke = None
    if teil.get_content_subtype() == "html":
        b = Baum(); b.feed(inhalt); b.close(); s = Satz(css_regeln("".join(b.css))); s.lauf(b.wurzel, False, False); s.umbruch(); bloecke = gruppieren(s.bloecke)[:20000]
    zeilen = [z.rstrip() for z in inhalt.splitlines()][:20000] if bloecke is None else []
    mid, sha, breite = dict(kopf)["Message-ID"], hashlib.sha256(roh).hexdigest(), A4[0] - 36 * mm - 12  # Textbreite im Rahmen (6 pt Innenabstand je Seite)
    fuss = f"Umwandlung der Original-E-Mail {mid}, SHA-256 der Rohmail {sha}"
    st = {"n": normal, "r": ParagraphStyle("r", parent=normal, alignment=2)}
    st.update({e: ParagraphStyle(f"m{e}", parent=normal, fontName=fett, fontSize=g, leading=g + 4, spaceBefore=6, spaceAfter=3) for e, g in ((1, 16), (2, 13), (3, 11))})
    def seite(c, doc):  # Fußzeile auf zwei Zeilen: die ganze Prüfsumme bleibt sichtbar
        c.saveState(); c.setFont(schrift, 6); c.setFillColor(colors.grey); c.drawString(18 * mm, 12 * mm, f"Umwandlung der Original-E-Mail {mid}"[:150])
        c.drawString(18 * mm, 9 * mm, f"SHA-256 der Rohmail {sha}"); c.drawRightString(A4[0] - 18 * mm, 9 * mm, f"Seite {doc.page}"); c.restoreState()
    def bauen(rumpf):
        t = Table([[Paragraph(f"<b>{k}</b>", normal), Paragraph(maske(v), normal)] for k, v in kopf], colWidths=[28 * mm, None])
        t.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.25, colors.lightgrey), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
        SimpleDocTemplate(aus, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=18 * mm, bottomMargin=18 * mm, title=dict(kopf)["Betreff"][:200],
                          creator="Assistenz der Geschäftsführung").build([t, Spacer(1, 5 * mm)] + rumpf() + [Spacer(1, 5 * mm), Paragraph(maske(fuss), normal)], onFirstPage=seite, onLaterPages=seite)
    if bloecke is None: bauen(lambda: [Paragraph(maske(z), normal) if z.strip() else Spacer(1, 2 * mm) for z in zeilen])
    else:
        try: bauen(lambda: gestalten(bloecke, st, breite))
        except Exception: bauen(lambda: gestalten(bloecke, st, breite, ohne_tabellen=True))  # z. B. LayoutError: Tabellenzeile höher als eine Seite
    print(json.dumps({"datei": aus, "groesse": os.path.getsize(aus)}))

def main():
    if len(sys.argv) == 4 and sys.argv[1] == "--mail": modus, ein, aus = "mail", pfad(sys.argv[2], "eml", False), pfad(sys.argv[3], "pdf", True)
    elif len(sys.argv) != 3: fehler("Aufruf: pdf.py arbeit/<name>.json arbeit/<name>.pdf | pdf.py --mail arbeit/<name>.eml arbeit/<name>-mail.pdf")
    else: modus, ein, aus = "json", pfad(sys.argv[1], "json", False), pfad(sys.argv[2], "pdf", True)
    if os.path.getsize(ein) > 2 << 20: fehler("Eingabe größer als 2 MiB")
    schrift, fett = "Helvetica", "Helvetica-Bold"
    for name, datei in (("Sans", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"), ("Sans-Bold", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")):
        if os.path.exists(datei): pdfmetrics.registerFont(TTFont(name, datei))
    if "Sans" in pdfmetrics.getRegisteredFontNames() and "Sans-Bold" in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFontFamily("Sans", normal="Sans", bold="Sans-Bold", italic="Sans", boldItalic="Sans-Bold"); schrift, fett = "Sans", "Sans-Bold"
    st = getSampleStyleSheet(); normal = ParagraphStyle("n", parent=st["Normal"], fontName=schrift, fontSize=10, leading=13)
    if modus == "mail": return mail(ein, aus, schrift, fett, normal)
    with open(ein, encoding="utf-8") as f: d = json.load(f)
    schluessel(d, {"dokument", "bloecke"}, "Wurzel"); dok = d.get("dokument", {}); schluessel(dok, DOK, "dokument")
    akzent = colors.HexColor(dok["akzentfarbe"]) if re.fullmatch(r"#[0-9a-fA-F]{6}", str(dok.get("akzentfarbe", ""))) else colors.black
    h = {e: ParagraphStyle(f"h{e}", parent=normal, fontName=fett, fontSize={1: 16, 2: 13, 3: 11}[e], leading={1: 20, 2: 16, 3: 14}[e], textColor=akzent, spaceBefore=6, spaceAfter=4) for e in (1, 2, 3)}
    teile = []
    if dok.get("logo"): teile.append(Image(pfad(dok["logo"], "(png|jpg|jpeg)", False), width=30 * mm, height=15 * mm, kind="proportional"))
    for k, s in (("titel", h[1]), ("untertitel", h[3]), ("absender", normal), ("datum", normal)):
        if dok.get(k): teile.append(Paragraph(text(dok[k]), s))
    teile.append(Spacer(1, 6 * mm))
    for i, b in enumerate(d.get("bloecke", [])):
        if not isinstance(b, dict) or len(b) != 1 or next(iter(b)) not in BLOCK: fehler(f"bloecke[{i}]: genau ein bekannter Blocktyp erwartet")
        art, w = next(iter(b.items())); w = w or {}; schluessel(w, BLOCK[art], f"bloecke[{i}].{art}")
        if art == "ueberschrift": teile.append(Paragraph(text(w["text"]), h[int(w.get("ebene", 2)) if int(w.get("ebene", 2)) in (1, 2, 3) else 2]))
        elif art == "absatz": teile += [Paragraph(text(w["text"]), normal), Spacer(1, 2 * mm)]
        elif art == "liste": teile.append(ListFlowable([ListItem(Paragraph(text(p), normal)) for p in w["punkte"]], bulletType="1" if w.get("nummeriert") else "bullet", bulletFontName=schrift))
        elif art in ("tabelle", "kennzahlen"):
            zeilen = [[str(x["bezeichnung"]), str(x["wert"])] for x in w["paare"]] if art == "kennzahlen" else [w["kopf"]] + w["zeilen"] + ([w["summenzeile"]] if w.get("summenzeile") else [])
            breiten = [x * mm for x in w["spaltenbreiten"]] if w.get("spaltenbreiten") else None
            t = Table([[Paragraph(text(z), normal) for z in r] for r in zeilen], colWidths=breiten, repeatRows=1 if art == "tabelle" else 0)
            stil = [("LINEBELOW", (0, 0), (-1, -1), 0.25, colors.lightgrey), ("VALIGN", (0, 0), (-1, -1), "TOP")]
            if art == "tabelle": stil += [("LINEBELOW", (0, 0), (-1, 0), 0.8, akzent)] + ([("LINEABOVE", (0, -1), (-1, -1), 0.8, akzent)] if w.get("summenzeile") else [])
            teile += [t, Spacer(1, 3 * mm)]; t.setStyle(TableStyle(stil))
        elif art == "bild":
            teile.append(Image(pfad(w["datei"], "(png|jpg|jpeg)", False), width=float(w.get("breite_mm", 120)) * mm, height=float(w.get("breite_mm", 120)) * mm, kind="proportional"))
            if w.get("unterschrift"): teile.append(Paragraph(text(w["unterschrift"]), normal))
        elif art == "trenner": teile.append(HRFlowable(width="100%", thickness=0.4, color=colors.lightgrey, spaceBefore=3, spaceAfter=3))
        else: teile.append(PageBreak())
    groesse = landscape(A4) if dok.get("seitenformat") == "A4 quer" else A4
    def fuss(c, doc):
        c.saveState(); c.setFont(schrift, 8); c.setFillColor(colors.grey)
        c.drawString(18 * mm, 10 * mm, str(dok.get("fusszeile", ""))[:200]); c.drawRightString(groesse[0] - 18 * mm, 10 * mm, f"Seite {doc.page}"); c.restoreState()
    SimpleDocTemplate(aus, pagesize=groesse, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=18 * mm, bottomMargin=18 * mm,
                      title=str(dok.get("titel", "")), author="Assistenz der Geschäftsführung", creator="Assistenz der Geschäftsführung").build(teile, onFirstPage=fuss, onLaterPages=fuss)
    print(json.dumps({"datei": aus, "groesse": os.path.getsize(aus)}))

if __name__ == "__main__":
    try: main()
    except SystemExit: raise
    except Exception as x: fehler(f"{type(x).__name__}: {x}"[:300])
