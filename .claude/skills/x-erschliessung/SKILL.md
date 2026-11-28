---
name: x-erschliessung
description: "Erschließungsauftrag (Profil ingest, art arbeit) – Lücken im Unternehmensgedächtnis aus den Originalen in Drive schließen (Gmail-Quellen nie über einen Connector) (lesen und übergeben über den Helfer x-scan), nur die Dokumente aus bezug.dokumente, nur belegte Fakten; Bekanntes wird nicht neu erschlossen. Abschluss mit Bericht ins Gespräch. Merkmal-Auftrag (bezug.merkmale, A-1067): nur Suchmerkmale aus den mitgelieferten Auszügen – im Namen-Lauf (bezug.merkmale.namen, A-1171) vor allem Absender und Empfänger –, ein complete_job, sonst nichts. Verwenden nur in der EXAVA-Hintergrundarbeit bei Aufträgen mit skill x-erschliessung."
effort: max
---

Die Arbeitsanweisung zu diesem Skill liefert EXAVA mit `arbeit_holen` im Feld `anweisung` (Skills, auf die sie verweist, in `anweisung.bezug`) – arbeite genau danach. In diesem Repository steht nur der Kopf dieses Skills. Fehlt `anweisung`: `complete_job` mit `outcome: failed` und `fehler_text: "skill_unbekannt"`.
