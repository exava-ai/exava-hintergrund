---
name: x-eingang
description: Eingangsauftrag (Profil ingest, art eingang) – Dateien, die nur in EXAVA liegen (Netzlaufwerk-Eingang, WhatsApp-Medien, Uploads; höchstens 20 je Auftrag), über exava_datei_lesen laden und den SHA-256 selbst rechnen; lesen und mit ingest_document an EXAVA übergeben lässt du jede Datei den Helfer x-scan (A-901); je Dokument die Dokument-Weiche still · Zur Kenntnis · Entscheidung (A-1183). Kein Versand, kein Entwurf, keine Rückfrage außer der Dokument-Weiche. Verwenden nur in der EXAVA-Hintergrundarbeit bei Aufträgen mit skill x-eingang.
effort: max
---

Die Arbeitsanweisung zu diesem Skill liefert EXAVA mit `arbeit_holen` im Feld `anweisung` (Skills, auf die sie verweist, in `anweisung.bezug`) – arbeite genau danach. In diesem Repository steht nur der Kopf dieses Skills. Fehlt `anweisung`: `complete_job` mit `outcome: failed` und `fehler_text: "skill_unbekannt"`.
