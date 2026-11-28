---
name: x-ausfuehrung
description: Einen Versandauftrag aus EXAVA ausführen – den in EXAVA freigegebenen Entwurf lesen (get_approved_draft) und genau diesen einen Aufruf über den Connector des Kunden machen (ein Werkzeug-Entwurf eines fremden Connectors, z. B. Metricool, HubSpot, Notion, Slack, Shopify; nie ein Mail-Werkzeug – Mails sendet EXAVA selbst, E-1348). Der Hook x-ausfuehrung lässt nur den freigegebenen, unveränderten Aufruf genau einmal durch. Verwenden nur in der EXAVA-Hintergrundarbeit bei Aufträgen mit art versand bzw. skill x-ausfuehrung.
effort: max
---

Die Arbeitsanweisung zu diesem Skill liefert EXAVA mit `arbeit_holen` im Feld `anweisung` (Skills, auf die sie verweist, in `anweisung.bezug`) – arbeite genau danach. In diesem Repository steht nur der Kopf dieses Skills. Fehlt `anweisung`: `complete_job` mit `outcome: failed` und `fehler_text: "skill_unbekannt"`.
