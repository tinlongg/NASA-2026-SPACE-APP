# NASA data for CrewSafety

Retrieved 2026-11-14 from NASA OSDR's public metadata and file APIs. This is a curated research snapshot, not a complete repository mirror. Five study records and nine original CSV tables are included. The tables contain 649 rows across different kinds of records (samples, protein targets, annotation comparisons and mouse laps); this is **not 649 participants**.

## What to use in the dashboard

| Study | Included data | Suggested application use | Boundary |
| --- | --- | --- | --- |
| [OSD-569](https://osdr.nasa.gov/bio/repo/data/studies/OSD-569) | Whole-blood study metadata and 28 CBC sample rows | Historical research charts for white/red blood cells and platelets | Four-person Inspiration4 cohort, not live vitals |
| [OSD-575](https://osdr.nasa.gov/bio/repo/data/studies/OSD-575) | Metabolic panel and three serum immune/cardiovascular tables | Historical glucose, calcium, sodium and potassium charts; immune research links | Lab measurements, not heart rate or fall thresholds |
| [OSD-656](https://osdr.nasa.gov/bio/repo/data/studies/OSD-656) | Urine inflammation table and protein target dictionary | Research library for inflammation studies | Same mission cohort; no inferred stress or wellness score |
| [OSD-195](https://osdr.nasa.gov/bio/repo/data/studies/OSD-195) | Study metadata and file inventory only | Muscle-deconditioning reference: 21-day bedrest, 14 male participants | Ground analogue and gene expression, not measured fall risk; expression files not downloaded |
| [OSD-952](https://osdr.nasa.gov/bio/repo/data/studies/OSD-952) | Mouse pose annotation consistency and lap statistics | Methodology reference for automated monitoring | Mice on RR-1; do not use to claim human detector accuracy |

These suggested application uses are our selection decisions, not NASA recommendations or endorsements.

## Ready for the website

`web/dist/data/nasa-research.json` (relative to the repository root) contains:

- Five study entries with source links, exact titles, study versions, assay names, publications and application notes.
- A file inventory with download URLs, original column labels, byte counts, row counts and SHA-256 hashes.
- Seven chart series: white blood cells, red blood cells, platelets, glucose, calcium, sodium and potassium.
- Each chart point includes the mean, observed minimum/maximum, available sample count, missing count, unit and timepoint.

The JSON is available at `./data/nasa-research.json` when the existing web folder is served. The Crew dashboard now renders seven selectable charts, accessible data tables, and five source cards from this JSON. The chart module, styles and JSON snapshot are included in the Worker build and offline shell. Publishing uses the existing Sites project; see [PASSDOWN](../../docs/PASSDOWN.md) for current deployment prerequisites and verification limits. The standalone website's simulated heart-rate panel was removed; any paired telemetry must retain its Simulated label. Display these research data separately under **NASA research / Historical measurements**.

```js
const response = await fetch('./data/nasa-research.json');
if (!response.ok) throw new Error('NASA research snapshot unavailable');
const { studies, series, retrievedOn } = await response.json();
// Plot series[i].points with categorical timepoint labels and series[i].unit.
// Show n, the study source, and the historical-data label with the chart.
```

## Interpretation and data quality

- Each selected chart has seven timepoints and four available participants per timepoint. Means are unweighted descriptive averages across available samples, rounded to six decimal places. Min/max describe observed samples, not healthy ranges or confidence intervals. No causal inference or significance test is performed.
- `L-92`, `L-44`, `L-3` refer to days before launch; `R+1`, `R+45`, `R+82`, `R+194` refer to days after return. They have different reference events. Do not plot them as one equally spaced numeric day axis or invent inflight observations.
- The downloaded CMP table includes `R+194`, although the OSD-575 narrative lists only earlier timepoints. The output retains the table's explicit sample labels. This source discrepancy should remain visible when discussing study coverage.
- OSD-569, OSD-575 and OSD-656 concern the same small mission cohort; combining them does not increase the number of independent astronauts.
- The urine table has duplicate empty column headers. Preserve its original layout; do not convert it to a name-keyed object that overwrites columns. It is not used for the chart series.
- The CBC header labels hemoglobin as `percent`. We have not resolved that unit issue and therefore exclude hemoglobin from generated charts rather than silently relabeling it.
- No verified sleep-duration, continuous heart-rate, mental-health score, or human fall-detection training dataset is included. These research tables cannot supply the prototype's live alerts.
- Only files marked unrestricted in NASA's inventory were downloaded. No controlled-access genomic sequence data was requested.
- Metadata descriptions are preserved as source records. They are not reviewed wellness advice and have not been inserted into MUSE's answer corpus.

## Reproduce and verify

From the repository root, run `node data/nasa-osdr/build.mjs` to regenerate the website JSON offline from the archived files. The builder validates byte sizes against NASA's inventory, parses table widths, records duplicate headers, checks selected numeric columns and unique subjects per timepoint, and generates file hashes. It fails on ambiguous chart inputs instead of filling missing data with zero.

Raw API responses live in `raw/`; original measurement files live in `tables/`. Source API endpoints and exact file URLs are in the generated JSON and archived file inventories. Refresh from those URLs, record the actual new retrieval date in the builder, review source/schema changes, and rebuild. Repeated downloads may change study versions and are not guaranteed to reproduce this snapshot.

API documentation: https://api.nasa.gov/ (Open Science Data Repository API).

Source inspection and download validation were performed by Codex. Independent team scientific review remains pending.
