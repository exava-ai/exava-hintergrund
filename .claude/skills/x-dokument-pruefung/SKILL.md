---
name: x-dokument-pruefung
description: Prüfauftrag (art ablage mit bezug.dokument_pruefung, A-1183) – Entscheidung zu genau einem Dokument ohne eigene Mail (Drive, Scan, Netzlaufwerk, Upload, WhatsApp), das ein Lese-Lauf als Entscheidung gemeldet hat; prüfen wie ein Chief of Staff, Optionen mit fertigen Entwürfen (nur in EXAVA), eine Rückfrage, die auf die Antwort wartet. Nichts senden, nichts ablegen. Verwenden nur in der EXAVA-Hintergrundarbeit bei Aufträgen mit skill x-dokument-pruefung.
effort: max
---

Die Arbeitsanweisung zu diesem Skill liefert EXAVA mit `arbeit_holen` im Feld `anweisung` (Skills, auf die sie verweist, in `anweisung.bezug`) – arbeite genau danach. In diesem Repository steht nur der Kopf dieses Skills. Fehlt `anweisung`: `complete_job` mit `outcome: failed` und `fehler_text: "skill_unbekannt"`.
