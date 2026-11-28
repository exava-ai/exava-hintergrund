---
name: x-kontierung
description: Für die Belege eines Kontierungsauftrags (höchstens 20) je Beleg das Original zuerst in EXAVA (archiv_suchen), Drive nur als Rückfall lesen (Mails nur über mail_lesen) und genau eine begründete Kontierung mit Konfidenz über propose_booking abgeben – EXAVA bucht sie sofort (A-896) und prüft sie nach seinem Annahmevertrag ohne Nutzer, wenn sie eindeutig ist (konfidenz 1.0) oder eine Regel sie bestätigt; sonst bleibt sie Vorschlag, bestätigt und korrigiert wird über Speichern. Verwenden nur in der EXAVA-Hintergrundarbeit bei Aufträgen mit skill x-kontierung.
effort: max
---

Die Arbeitsanweisung zu diesem Skill liefert EXAVA mit `arbeit_holen` im Feld `anweisung` (Skills, auf die sie verweist, in `anweisung.bezug`) – arbeite genau danach. In diesem Repository steht nur der Kopf dieses Skills. Fehlt `anweisung`: `complete_job` mit `outcome: failed` und `fehler_text: "skill_unbekannt"`.
