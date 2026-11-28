---
name: x-arbeitsauftrag
description: Einen mehrstufigen Arbeitsauftrag aus dem EXAVA-Gespräch bis zum nachweisbaren Ergebnis bearbeiten – nur lesen und vorschlagen (Evidenzvorschläge als Referenz, Entwürfe nur in EXAVA, Rückfrage nur mit attempted) und mit einem Bericht abschließen, den EXAVA ins Gespräch stellt. Kein Versand, keine Buchung, kein DATEV, nichts löschen. Verwenden nur in der EXAVA-Hintergrundarbeit bei Aufträgen mit skill x-arbeitsauftrag.
effort: max
---

Die Arbeitsanweisung zu diesem Skill liefert EXAVA mit `arbeit_holen` im Feld `anweisung` (Skills, auf die sie verweist, in `anweisung.bezug`) – arbeite genau danach. In diesem Repository steht nur der Kopf dieses Skills. Fehlt `anweisung`: `complete_job` mit `outcome: failed` und `fehler_text: "skill_unbekannt"`.
