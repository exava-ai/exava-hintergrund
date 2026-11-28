---
name: x-synchronisation
description: Ein zugewiesenes Synchronisationsfenster (Postfach bzw. Drive, Zeitraum, Cursor, max_items) seitenweise lesen und je Quelle den Text über ingest_document (Dateien liest und übergibt der Helfer x-scan), belegte Fakten über ingest_facts und Wiki-Artikel über ingest_wiki an EXAVA übergeben; vollständig nur mit Nachweis (completeness_evidence), sonst partial mit Cursor, Fehler je Quelle ausgewiesen. Verwenden nur in der EXAVA-Hintergrundarbeit bei Aufträgen mit profil ingest und art sync_aktuell oder sync_historisch (Fenster aus arbeit_holen).
effort: medium
---

Die Arbeitsanweisung zu diesem Skill liefert EXAVA mit `arbeit_holen` im Feld `anweisung` (Skills, auf die sie verweist, in `anweisung.bezug`) – arbeite genau danach. In diesem Repository steht nur der Kopf dieses Skills. Fehlt `anweisung`: `complete_job` mit `outcome: failed` und `fehler_text: "skill_unbekannt"`.
