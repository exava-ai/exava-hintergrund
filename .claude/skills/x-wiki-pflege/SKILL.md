---
name: x-wiki-pflege
description: Veraltete Wiki-Artikel eines Auftrags (bis zu 20 Partner oder eigene Gesellschaften) neu schreiben – je Subjekt das berechtigte Wissen über read_knowledge lesen und den Artikel nach dem WikiSchema per ingest_wiki mit Compare-and-Swap übergeben; jeder Satz belegt, sonst wird das Subjekt übersprungen. Ein Subjekt je Schritt; meldet EXAVA vorrang, sofort abgeben (partial). Kein Versand, kein Entwurf, keine Rückfrage. Verwenden nur in der EXAVA-Hintergrundarbeit bei Aufträgen mit profil ingest und skill x-wiki-pflege bzw. art wiki.
effort: high
---

Die Arbeitsanweisung zu diesem Skill liefert EXAVA mit `arbeit_holen` im Feld `anweisung` (Skills, auf die sie verweist, in `anweisung.bezug`) – arbeite genau danach. In diesem Repository steht nur der Kopf dieses Skills. Fehlt `anweisung`: `complete_job` mit `outcome: failed` und `fehler_text: "skill_unbekannt"`.
