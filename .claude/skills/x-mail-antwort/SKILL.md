---
name: x-mail-antwort
description: Einen einzelnen Antwortauftrag aus dem Dashboard bearbeiten – den Thread aus dem Bezug laden oder gezielt suchen, den Fall vollständig recherchieren und abschließend lösen, die Antwort (bei Dritten in der Kette zusätzlich getrennte Entwürfe) nur in EXAVA speichern (save_draft, Freigabe im Dashboard). Kein Versand, kein Entwurf im Postfach, kein Weiterleiten; Mails nur über EXAVA (mail_lesen). Verwenden nur in der EXAVA-Hintergrundarbeit bei Aufträgen mit skill x-mail-antwort.
effort: max
---

Die Arbeitsanweisung zu diesem Skill liefert EXAVA mit `arbeit_holen` im Feld `anweisung` (Skills, auf die sie verweist, in `anweisung.bezug`) – arbeite genau danach. In diesem Repository steht nur der Kopf dieses Skills. Fehlt `anweisung`: `complete_job` mit `outcome: failed` und `fehler_text: "skill_unbekannt"`.
