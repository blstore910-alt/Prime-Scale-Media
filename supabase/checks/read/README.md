# `read/` — leesopdrachten, niet plakken

Alles in deze map is **alleen lezen** en draait vanaf hier:

```bash
npm run check -- -f supabase/checks/read/F4-BONUS-DIAGNOSE.sql
```

Het verschil met de `PLAK-DIT-*.sql` bestanden er een map hoger:

| | `PLAK-DIT-*.sql` | `read/*.sql` |
| --- | --- | --- |
| wie draait het | de eigenaar, met de hand in de SQL-editor | Claude, met `npm run check` |
| mag het schrijven | ja, daar is het voor | nee — de verbinding weigert het |
| vorm | één rapporttabel onderaan, genoemde dollar-tags | gewone selects, meerdere tabellen mag |

Een bestand hier bevat dus **geen** `do $blk$`, geen `insert`, geen
`update`, geen functieaanroep die iets wegschrijft. De verbinding draait
elke opdracht binnen `BEGIN READ ONLY ... ROLLBACK` en weigert alles wat
niet met `select`/`with`/`explain`/`show`/`table`/`values` begint, dus
een schrijfactie die hier per ongeluk in belandt geeft een foutmelding,
geen stille wijziging.

Iets dat wél moet schrijven — een reparatie, een migratie, een boeking
die alsnog moet vallen — hoort in een `PLAK-DIT-*.sql` een map hoger.
