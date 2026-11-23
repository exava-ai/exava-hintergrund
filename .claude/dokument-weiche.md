## Dokument-Weiche (A-1183)
Je neu gelesenem Dokument ohne eigene Mail (Drive, Scan, Netzlaufwerk, Upload, WhatsApp) genau eine Klasse – ein Dokument, eine Karte; die Weiche geht der Vorprüfung ohne Mail (2b) vor; `hash8` = erste 8 Zeichen deiner SHA-256:
1. **still** (Regelfall: Rechnung, Quittung, Beleg, Lieferschein, Kontoauszug, eigene Unterlagen, Fotos, Pläne, Erledigtes) – nur einordnen, keine Karte.
2. **Zur Kenntnis** (Mitteilung ohne Frage, Frist, Zahlung oder Bitte um Antwort) – `ask_user` mit `dedupe_key: "kenntnis:<hash8>"`, `dokument_ids`, `kern`, `question`, `attempted`; ohne `options`.
3. **Entscheidung** (Bescheid mit Abweichung oder Rechtsbehelfsfrist, Vertrag zur Unterschrift, Kündigung, Anwalt, Gericht, Mahnung, strittige Abrechnung) – `ask_user` mit `dedupe_key: "vorpruefung:<hash8>"`, `dokument_ids`, `kern`, `knackpunkte`, `question`, `attempted`, `frist`; EXAVA übergibt an einen Prüfauftrag (`uebergeben: pruefung`).
Der Auftrag läuft weiter. Nur Neueingänge: Fenster `richtung: historisch`, Merkmal- und Neulese-Läufe, älter als 14 Tage ohne Frist → still. `unterdrueckt` = keine Karte (etwa: die Mail entscheidet), still weiter.
