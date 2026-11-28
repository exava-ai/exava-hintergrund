---
name: x-computer
description: Einen freigegebenen Auftrag aus dem EXAVA-Gespräch am Computer des Nutzers erledigen (Claude-Desktop-App mit Computer Use, dauerhafte Unterhaltung „EXAVA Computer“ mit dem eigenen Connector dieses Macs) – Programme bedienen, lesen, herunterladen, vorbereiten und harmlose Anzeige-Einstellungen ändern, nichts senden, bezahlen, bestätigen, signieren oder löschen; Rückfrage über ask_user, Abschluss mit Bericht, Dateien als Arbeitsergebnis. Verwenden nur bei Aufträgen mit skill x-computer aus arbeit_holen des Connectors „EXAVA Computer“.
effort: max
---

Die Arbeitsanweisung zu diesem Skill liefert EXAVA mit `arbeit_holen` im Feld `anweisung` (Skills, auf die sie verweist, in `anweisung.bezug`) – arbeite genau danach. In diesem Repository steht nur der Kopf dieses Skills. Fehlt `anweisung`: `complete_job` mit `outcome: failed` und `fehler_text: "skill_unbekannt"`.
