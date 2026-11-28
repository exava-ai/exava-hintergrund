---
name: x-belegsuche
description: Kernregel 3 „Bankabgleich, Belegsuche & Kontierung“ – zu den offenen Bankumsätzen eines Auftrags die Belege in EXAVA (archiv_suchen, Mails nur über mail_lesen), Drive nur als Rückfall gezielt suchen (der Bankumsatz führt); im CSV-Modus je Gesellschaft in einem Durchgang Belege verknüpfen UND kontieren, sichere Fälle bis DATEV-ready, und die ausgefüllte CSV zurückgeben; sonst je Umsatz einen begründeten Evidenzvorschlag mit Konfidenz einreichen (Original nach Abschnitt 3a). Ohne Versand, nie Absender anschreiben, ohne Rückfrage vor Tag 5. Verwenden nur in der EXAVA-Hintergrundarbeit bei Aufträgen mit skill x-belegsuche.
effort: max
---

Die Arbeitsanweisung zu diesem Skill liefert EXAVA mit `arbeit_holen` im Feld `anweisung` (Skills, auf die sie verweist, in `anweisung.bezug`) – arbeite genau danach. In diesem Repository steht nur der Kopf dieses Skills. Fehlt `anweisung`: `complete_job` mit `outcome: failed` und `fehler_text: "skill_unbekannt"`.
