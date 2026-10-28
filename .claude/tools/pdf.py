# A-531 DATEI (VORLAGE-2 PR 9): Renderer der Hintergrundroutine – JSON (arbeit/<name>.json) → PDF (arbeit/<name>.pdf). Spezifikation docs/umbau/a531/datei-upload.md §5.1.
# Nur Standardbibliothek + reportlab; kein Netz, kein Unterprozess, kein eval/exec. Inhalt, Rechenwerte und Gestaltung entscheidet Claude (E-1116); dieses Skript setzt nur.
# Aufruf (nur so lässt ihn hintergrund-policy.mjs zu, SHA-256 geprüft): /usr/bin/python3 -I .claude/tools/pdf.py arbeit/<name>.json arbeit/<name>.pdf
# A-657 (GO pdf.py, Bauherr 22.10.2026): --mail arbeit/gmail-<id>.eml arbeit/gmail-<id>-mail.pdf – HTML-Belegmail 1:1 als PDF; Kopf und Inhalt liest das Skript selbst aus der
# vom Hook gesicherten Rohmail (Originalreihenfolge, Tabellenzeilen als Zeilen, Links als Text), Claude liefert keinen Inhalt.
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

class Html(HTMLParser):  # Text in Originalreihenfolge: Blöcke und Tabellenzeilen werden Zeilen, Zellen mit „ · “ getrennt, Links als „Text <Adresse>“
    BLOCK = {"p", "div", "br", "tr", "li", "table", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "blockquote", "ul", "ol", "section", "header", "footer", "center"}
    def __init__(self):
        super().__init__(convert_charrefs=True); self.zeilen, self.puffer, self.aus, self.links = [], "", 0, []
    def umbruch(self):
        z = re.sub(r"(\s*·\s*)+", " · ", " ".join(self.puffer.split())).strip(" ·")
        if z: self.zeilen.append(z)
        self.puffer = ""
    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "head", "title"): self.aus += 1
        elif tag == "a": self.links.append(dict(attrs).get("href") or "")
        elif tag in self.BLOCK: self.umbruch()
    def handle_endtag(self, tag):
        if tag in ("script", "style", "head", "title"): self.aus = max(0, self.aus - 1)
        elif tag in ("td", "th"): self.puffer += " · "
        elif tag == "a" and self.links:
            h = self.links.pop()
            if re.match(r"(https?:|mailto:)", h) and h.split(":", 1)[-1].strip("/") not in self.puffer: self.puffer += f" <{h}>"
        elif tag in self.BLOCK: self.umbruch()
    def handle_data(self, d):
        if not self.aus: self.puffer += d

def maske(t):
    return str(t).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

def mail(ein, aus, schrift, normal):
    if aus != ein[:-4] + "-mail.pdf": fehler("Ausgabe muss arbeit/<name>-mail.pdf zur Eingabe arbeit/<name>.eml sein")
    with open(ein, "rb") as f: roh = f.read()
    m = email.message_from_bytes(roh, policy=email.policy.default)
    kopf = [(k, " ".join(str(m.get(h, "")).split())) for k, h in (("Von", "From"), ("An", "To"), ("Datum", "Date"), ("Betreff", "Subject"), ("Message-ID", "Message-ID"))]
    teil = m.get_body(preferencelist=("html", "plain"))
    if teil is None: fehler("Mail ohne HTML- oder Textteil")
    try: inhalt = teil.get_content()
    except (LookupError, KeyError): inhalt = (teil.get_payload(decode=True) or b"").decode("utf-8", "replace")
    if teil.get_content_subtype() == "html":
        p = Html(); p.feed(inhalt); p.umbruch(); zeilen = p.zeilen
    else: zeilen = [z.rstrip() for z in inhalt.splitlines()]
    fuss = f"Umwandlung der Original-E-Mail {dict(kopf)['Message-ID']}, SHA-256 der Rohmail {hashlib.sha256(roh).hexdigest()}"
    t = Table([[Paragraph(f"<b>{k}</b>", normal), Paragraph(maske(v), normal)] for k, v in kopf], colWidths=[28 * mm, None])
    t.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.25, colors.lightgrey), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    teile = [t, Spacer(1, 5 * mm)] + [Paragraph(maske(z), normal) if z.strip() else Spacer(1, 2 * mm) for z in zeilen[:20000]] + [Spacer(1, 5 * mm), Paragraph(maske(fuss), normal)]
    def seite(c, doc):
        c.saveState(); c.setFont(schrift, 6); c.setFillColor(colors.grey); c.drawString(18 * mm, 10 * mm, fuss[:230]); c.restoreState()
    SimpleDocTemplate(aus, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=18 * mm, bottomMargin=18 * mm, title=dict(kopf)["Betreff"][:200],
                      creator="Assistenz der Geschäftsführung").build(teile, onFirstPage=seite, onLaterPages=seite)
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
    if modus == "mail": return mail(ein, aus, schrift, normal)
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
