---
name: x-postfach-hygiene
description: "Postfach-Hygiene (Kernregeln 10/11/18, art postfach_hygiene) – nur über EXAVA (mail_lesen, mail_archivieren): echte Geschäftsmails aus dem Spam holen und den Posteingang aufräumen (Claude entscheidet je Mail samt Anhängen, was der Nutzer weder tun noch wissen muss; nur aus dem Posteingang nehmen); Abmeldungen nur als tägliche Sammel-Karte zur Freigabe; Papierkorb-Schutzschild: kritische Post aus dem Papierkorb ins Archiv. Nichts löschen, nichts senden. Verwenden nur in der EXAVA-Hintergrundarbeit bei Aufträgen mit skill x-postfach-hygiene bzw. art postfach_hygiene."
effort: medium
---

Die Arbeitsanweisung zu diesem Skill liefert EXAVA mit `arbeit_holen` im Feld `anweisung` (Skills, auf die sie verweist, in `anweisung.bezug`) – arbeite genau danach. In diesem Repository steht nur der Kopf dieses Skills. Fehlt `anweisung`: `complete_job` mit `outcome: failed` und `fehler_text: "skill_unbekannt"`.
