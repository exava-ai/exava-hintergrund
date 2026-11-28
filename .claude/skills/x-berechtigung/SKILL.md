---
name: x-berechtigung
description: Berechtigungs-Prüflauf (A-811) – prüft, ob die Werkzeuge der Connectoren dieser Routine ohne Rückfrage laufen („✅ Immer erlauben“). Je verbundener Kategorie genau ein lesender Aufruf, nichts schreiben, nichts senden. Verwenden nur in der EXAVA-Hintergrundarbeit bei Aufträgen mit skill x-berechtigung.
effort: max
---

Die Arbeitsanweisung zu diesem Skill liefert EXAVA mit `arbeit_holen` im Feld `anweisung` (Skills, auf die sie verweist, in `anweisung.bezug`) – arbeite genau danach. In diesem Repository steht nur der Kopf dieses Skills. Fehlt `anweisung`: `complete_job` mit `outcome: failed` und `fehler_text: "skill_unbekannt"`.
