---
name: x-datev-ablage
description: DATEV-Paket im Drive ablegen (A-818, art ablage mit job.bezug.datev_paket) – das fertige DATEV-Paket (ZIP für die Kanzlei) einer Gesellschaft unverändert unter 00-EXAVA/DATEV-Exporte/<Gesellschaft>/<JJJJ-MM> mit __#hash8 ablegen und die Drive-ID melden. Nichts löschen, nichts teilen, nie Papierkorb. Verwenden nur in der EXAVA-Hintergrundarbeit bei Aufträgen mit skill x-datev-ablage.
effort: max
---

Die Arbeitsanweisung zu diesem Skill liefert EXAVA mit `arbeit_holen` im Feld `anweisung` (Skills, auf die sie verweist, in `anweisung.bezug`) – arbeite genau danach. In diesem Repository steht nur der Kopf dieses Skills. Fehlt `anweisung`: `complete_job` mit `outcome: failed` und `fehler_text: "skill_unbekannt"`.
