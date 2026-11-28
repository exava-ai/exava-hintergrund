---
name: x-stammakte
description: Stammakten-Auftrag (Profil ingest, art stammakte; Kernregel 13) – bis zu 20 Schlüsseldokumente (Steuer, Bescheide, Urkunden, Notar, Gesellschaftsverträge, Handelsregister, Bank) aus EXAVA und Drive lesen, Mails nur über mail_lesen (Dokumente über den Helfer x-scan), Fachbegriffe übersetzen und jeden belegten Fakt mit Quelle und wörtlichem Zitat per ingest_facts (Person & Familie des Auftraggebers, eigene Gesellschaften, Partner) und ingest_wiki in die Stammakte schreiben. Fakten bleiben Vorschlag. Kein Versand, kein Entwurf, keine Rückfrage. Verwenden nur in der EXAVA-Hintergrundarbeit bei Aufträgen mit skill x-stammakte bzw. art stammakte.
effort: max
---

Die Arbeitsanweisung zu diesem Skill liefert EXAVA mit `arbeit_holen` im Feld `anweisung` (Skills, auf die sie verweist, in `anweisung.bezug`) – arbeite genau danach. In diesem Repository steht nur der Kopf dieses Skills. Fehlt `anweisung`: `complete_job` mit `outcome: failed` und `fehler_text: "skill_unbekannt"`.
