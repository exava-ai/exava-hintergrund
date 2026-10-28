# A-622 P3-A XLSX: Listen der Hintergrundroutine – JSON (arbeit/<name>.json) → Excel (arbeit/<name>.xlsx), Gegenstück zu pdf.py.
# Nur Standardbibliothek (zipfile + Office Open XML); kein Netz, kein Unterprozess, kein eval/exec. Inhalt und Werte entscheidet Claude (E-1116); dieses Skript setzt nur.
# Deterministisch (gleiche Eingabe = gleiche Bytes: feste Zeitstempel in ZIP und docProps, feste Reihenfolge); keine Makros, keine externen Links, keine Formeln – Text bleibt Text.
# Eingabe: {"titel"?, "blaetter": [{"name", "spalten": [{"titel", "typ": text|zahl|datum|cent, "breite"?}], "zeilen": [[Wert je Spalte oder null], …]}]}
#   text = Zeichenkette, zahl = Zahl, datum = "JJJJ-MM-TT", cent = ganze Zahl in Cent (Anzeige 1.234,56). Falscher Typ → Fehler, nichts geschrieben.
# Aufruf (nur so lässt ihn hintergrund-policy.mjs zu, SHA-256 geprüft): /usr/bin/python3 -I .claude/tools/xlsx.py arbeit/<name>.json arbeit/<name>.xlsx
import datetime, io, json, math, os, re, sys, zipfile
from xml.sax.saxutils import escape

MAX_BLAETTER, MAX_SPALTEN, MAX_ZEILEN, MAX_ZELLEN, MAX_TEXT, MAX_BYTES = 20, 50, 20000, 200000, 32767, 20 << 20
TYPEN = {"text", "zahl", "datum", "cent"}
STIL = {"text": 0, "zahl": 0, "datum": 2, "cent": 3}  # cellXfs: 0 Standard, 1 Kopf fett, 2 TT.MM.JJJJ, 3 #,##0.00
STEUER = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f￾￿]")
ZEIT = (1980, 1, 1, 0, 0, 0)
ATTR = {'"': "&quot;"}

def fehler(text):
    print(json.dumps({"fehler": text}, ensure_ascii=False)); sys.exit(1)

def pfad(p, endung, neu):
    basis = os.path.realpath("arbeit")
    if not isinstance(p, str) or not re.fullmatch(r"arbeit/[A-Za-z0-9._-]{1,140}(__#[0-9a-f]{8})?\." + endung, p) or ".." in p or os.path.islink(p): fehler(f"Pfad {p!r} nicht erlaubt")
    if os.path.dirname(os.path.realpath(p)) != basis: fehler(f"Pfad {p!r} außerhalb von arbeit/")
    if neu and os.path.exists(p): fehler(f"{p} existiert schon")
    return p

def schluessel(o, pflicht, erlaubt, wo):
    if not isinstance(o, dict): fehler(f"{wo}: Objekt erwartet")
    if set(o) - erlaubt: fehler(f"{wo}: unbekannte Schlüssel {sorted(set(o) - erlaubt)}")
    if pflicht - set(o): fehler(f"{wo}: fehlt {sorted(pflicht - set(o))}")

def text(t, wo):
    if not isinstance(t, str) or len(t) > MAX_TEXT or STEUER.search(t): fehler(f"{wo}: Text (≤ {MAX_TEXT} Zeichen, ohne Steuerzeichen) erwartet")
    return t

def spalte(i):
    s = ""
    while True:
        i, r = divmod(i, 26); s = chr(65 + r) + s
        if i == 0: return s
        i -= 1

def zelle(ref, typ, v, wo):
    if v is None: return ""
    if typ == "text":
        t = escape(text(v, wo))
        return f'<c r="{ref}" t="inlineStr"><is><t xml:space="preserve">{t}</t></is></c>'
    if typ == "zahl":
        if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or abs(v) >= 1e15: fehler(f"{wo}: Zahl erwartet")
        return f'<c r="{ref}"><v>{v!r}</v></c>' if isinstance(v, float) else f'<c r="{ref}"><v>{v}</v></c>'
    if typ == "cent":
        if isinstance(v, bool) or not isinstance(v, int) or abs(v) >= 10 ** 15: fehler(f"{wo}: Betrag als ganze Zahl in Cent erwartet")
        q, r = divmod(abs(v), 100)
        return f'<c r="{ref}" s="3"><v>{"-" if v < 0 else ""}{q}.{r:02d}</v></c>'
    if not isinstance(v, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", v): fehler(f"{wo}: Datum als \"JJJJ-MM-TT\" erwartet")
    try: d = datetime.date.fromisoformat(v)
    except ValueError: fehler(f"{wo}: Datum {v!r} ungültig")
    if d.year < 1900: fehler(f"{wo}: Datum vor 1900")
    return f'<c r="{ref}" s="2"><v>{(d - datetime.date(1899, 12, 30)).days}</v></c>'

def blatt(b, i):
    wo = f"blaetter[{i}]"; schluessel(b, {"name", "spalten", "zeilen"}, {"name", "spalten", "zeilen"}, wo)
    name = text(b["name"], f"{wo}.name")
    if not 1 <= len(name) <= 31 or re.search(r"[\[\]:*?/\\]", name) or name.startswith("'") or name.endswith("'") or name.lower() == "history": fehler(f"{wo}.name: 1–31 Zeichen, ohne []:*?/\\ und Apostroph am Rand")
    sp, zeilen = b["spalten"], b["zeilen"]
    if not isinstance(sp, list) or not 1 <= len(sp) <= MAX_SPALTEN: fehler(f"{wo}.spalten: 1–{MAX_SPALTEN} Spalten")
    if not isinstance(zeilen, list) or len(zeilen) > MAX_ZEILEN: fehler(f"{wo}.zeilen: Liste mit ≤ {MAX_ZEILEN} Zeilen")
    for j, s in enumerate(sp):
        schluessel(s, {"titel", "typ"}, {"titel", "typ", "breite"}, f"{wo}.spalten[{j}]"); text(s["titel"], f"{wo}.spalten[{j}].titel")
        if s["typ"] not in TYPEN: fehler(f"{wo}.spalten[{j}].typ: eines von {sorted(TYPEN)}")
        if "breite" in s and (isinstance(s["breite"], bool) or not isinstance(s["breite"], int) or not 4 <= s["breite"] <= 80): fehler(f"{wo}.spalten[{j}].breite: ganze Zahl 4–80")
    breiten = "".join(f'<col min="{j + 1}" max="{j + 1}" width="{s["breite"]}" customWidth="1"/>' for j, s in enumerate(sp) if "breite" in s)
    reihen = ['<row r="1">' + "".join(f'<c r="{spalte(j)}1" t="inlineStr" s="1"><is><t xml:space="preserve">{escape(s["titel"])}</t></is></c>' for j, s in enumerate(sp)) + "</row>"]
    for z, w in enumerate(zeilen):
        if not isinstance(w, list) or len(w) != len(sp): fehler(f"{wo}.zeilen[{z}]: genau {len(sp)} Werte erwartet")
        reihen.append(f'<row r="{z + 2}">' + "".join(zelle(f"{spalte(j)}{z + 2}", sp[j]["typ"], v, f"{wo}.zeilen[{z}][{j}]") for j, v in enumerate(w)) + "</row>")
    xml = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
           '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
           + (f"<cols>{breiten}</cols>" if breiten else "") + "<sheetData>" + "".join(reihen) + "</sheetData></worksheet>")
    return name, xml, len(sp) * (len(zeilen) + 1)

def main():
    if len(sys.argv) != 3: fehler("Aufruf: xlsx.py arbeit/<name>.json arbeit/<name>.xlsx")
    ein, aus = pfad(sys.argv[1], "json", False), pfad(sys.argv[2], "xlsx", True)
    if os.path.getsize(ein) > 2 << 20: fehler("Eingabe größer als 2 MiB")
    with open(ein, encoding="utf-8") as f:
        try: d = json.load(f)
        except ValueError: fehler("Eingabe ist kein gültiges JSON")
    schluessel(d, {"blaetter"}, {"titel", "blaetter"}, "Wurzel")
    titel = text(d.get("titel", ""), "titel")[:200]
    if not isinstance(d["blaetter"], list) or not 1 <= len(d["blaetter"]) <= MAX_BLAETTER: fehler(f"blaetter: 1–{MAX_BLAETTER} Blätter")
    blaetter = [blatt(b, i) for i, b in enumerate(d["blaetter"])]
    if len({n.lower() for n, _, _ in blaetter}) != len(blaetter): fehler("blaetter: Namen doppelt")
    if sum(z for _, _, z in blaetter) > MAX_ZELLEN: fehler(f"mehr als {MAX_ZELLEN} Zellen")
    k = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    teile = [
        ("[Content_Types].xml", k + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
         '<Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
         '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
         '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
         + "".join(f'<Override PartName="/xl/worksheets/sheet{i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' for i in range(len(blaetter))) + "</Types>"),
        ("_rels/.rels", k + f'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="{rel}/officeDocument" Target="xl/workbook.xml"/>'
         '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'),
        ("docProps/core.xml", k + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" '
         'xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' + f"<dc:title>{escape(titel)}</dc:title><dc:creator>Assistenz der Geschäftsführung</dc:creator>"
         '<dcterms:created xsi:type="dcterms:W3CDTF">1980-01-01T00:00:00Z</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">1980-01-01T00:00:00Z</dcterms:modified></cp:coreProperties>'),
        ("xl/workbook.xml", k + f'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="{rel}"><sheets>'
         + "".join(f'<sheet name="{escape(n, ATTR)}" sheetId="{i + 1}" r:id="rId{i + 1}"/>' for i, (n, _, _) in enumerate(blaetter)) + "</sheets></workbook>"),
        ("xl/_rels/workbook.xml.rels", k + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
         + "".join(f'<Relationship Id="rId{i + 1}" Type="{rel}/worksheet" Target="worksheets/sheet{i + 1}.xml"/>' for i in range(len(blaetter)))
         + f'<Relationship Id="rId{len(blaetter) + 1}" Type="{rel}/styles" Target="styles.xml"/></Relationships>'),
        ("xl/styles.xml", k + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="DD.MM.YYYY"/><numFmt numFmtId="165" formatCode="#,##0.00"/></numFmts>'
         '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
         '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
         '<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
         '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>'
         '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'),
    ] + [(f"xl/worksheets/sheet{i + 1}.xml", x) for i, (_, x, _) in enumerate(blaetter)]
    puffer = io.BytesIO()
    with zipfile.ZipFile(puffer, "w") as z:
        for name, inhalt in teile:
            info = zipfile.ZipInfo(name, ZEIT); info.compress_type = zipfile.ZIP_DEFLATED; info.external_attr = 0o600 << 16; info.create_system = 0
            z.writestr(info, inhalt.encode("utf-8"), compresslevel=6)
    if puffer.tell() > MAX_BYTES: fehler(f"Ergebnis größer als {MAX_BYTES >> 20} MiB")
    with open(aus, "xb") as f: f.write(puffer.getvalue())
    print(json.dumps({"datei": aus, "groesse": os.path.getsize(aus)}))

if __name__ == "__main__":
    main()
