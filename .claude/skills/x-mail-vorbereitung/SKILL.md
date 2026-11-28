---
name: x-mail-vorbereitung
description: Posteingang-Kette (A-1049) – jede Mail aus job.bezug.mails (alle Postfächer, deren Mails EXAVA speichert) nur über mail_lesen lesen, einordnen (werbung | benachrichtigung | info_beleg | arbeit) und sofort melden; nur bei arbeit den Fall vollständig recherchieren und einen abschließenden, belegten Antwortentwurf (bei Dritten in der Kette zusätzlich getrennte Entwürfe; bei fehlendem Sachverhalt Optionen mit je fertigem Entwurf, A-1118) nur in EXAVA speichern (save_draft, Freigabe im Dashboard) – kein Versand, kein nativer Gmail-Entwurf. Verwenden nur in der EXAVA-Hintergrundarbeit bei Aufträgen mit skill x-mail-vorbereitung bzw. art mail_vorbereitung.
effort: max
---

Die Arbeitsanweisung zu diesem Skill liefert EXAVA mit `arbeit_holen` im Feld `anweisung` (Skills, auf die sie verweist, in `anweisung.bezug`) – arbeite genau danach. In diesem Repository steht nur der Kopf dieses Skills. Fehlt `anweisung`: `complete_job` mit `outcome: failed` und `fehler_text: "skill_unbekannt"`.
