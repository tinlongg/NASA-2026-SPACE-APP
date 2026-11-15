# MUSE source documents

The user selected the three NASA HRP pages and requested OSDR on 2026-11-14. Codex opened the pages,
checked the passages, and retrieved OSD-946 metadata through NASA's public API. These are a small
excerpt corpus, not complete documents or an exhaustive literature review. A different human teammate
must still verify each title, URL and section. `verifiedBy` remains null; do not treat automated checks
as that independent signoff.

| id | Exact title | Source | Sections included | Retrieved on | Verified by |
| --- | --- | --- | --- | --- | --- |
| hrp-isolation | Hazard: Isolation and Confinement | [NASA HRP](https://www.nasa.gov/hrp/hazard-isolation-and-confinement/) | Two introductory paragraphs; no section heading (`null`) | 2026-11-14 | Pending |
| hrp-fitness | Risk of Reduced Cardiorespiratory and Musculoskeletal Fitness | [NASA](https://www.nasa.gov/reference/risk-of-reduced-cardiorespiratory-and-musculoskeletal-fitness/) | What are the top risks?; What can be done about it? | 2026-11-14 | Pending |
| hrp-risks | Risks of Human Spaceflight | [NASA HRP](https://www.nasa.gov/hrp/risks/) | Risk of Inadequate Teamwork; Risk of Inadequate Sleep and Irregular Schedules | 2026-11-14 | Pending |
| osdr-about | About OSDR | [NASA Science](https://science.nasa.gov/biological-physical/data/osdr/) | About OSDR, first paragraph | 2026-11-14 | Pending |
| osd-946 | Exercise Training Attenuates the Muscle Mitochondria Genomic Response to Bed Rest (miRNA microarray data) | [OSD-946](https://osdr.nasa.gov/bio/repo/data/studies/OSD-946) | Description; metadata fields listed below | 2026-11-14 | Pending |

The supplied [OSDR search portal](https://osdr.nasa.gov/bio/repo/search?q=&data_source=cgene,alsda,esa&data_type=study)
is linked from MUSE. Search results change, so answers cite stable study/document pages instead of a
search-results list. OSD-946 was checked against the [official dataset API](https://visualization.osdr.nasa.gov/biodata/api/v2/dataset/OSD-946/):
`study title`, `study description`, `study identifier`, `project type`, `organism`, and
`study assay technology type`. The final four fields are rendered as labelled text in the local
excerpt; the citation names those exact fields rather than inventing a document page number.
The record identifies a **Ground Study**, **Homo sapiens**, and **miRNA Microarray**. The study page
lists CC0-1.0. No raw participant datasets for OSD-946 were downloaded or analyzed. The separate dashboard
research snapshot is documented in `data/nasa-osdr/README.md`; its study records are not inserted
into the MUSE answer corpus.

Source text lives in `backend/sources/raw/*.txt`; whitespace is normalized, original excerpt wording
and headings are preserved. The index has eight chunks from five source records. Citations come only
from manifest/chunk metadata, never the model. OSDR metadata and research protocols are not evidence
that this camera detector works and are not personal health prescriptions.

Six demo responses were exported from the running FastAPI service in extractive mode using
`backend/sources/demo-questions.txt`. Do not hand-edit answers or citations. See `backend/README.md`
for regeneration steps. Review each exported answer before the presentation.

## Spacesuit checklist source (not in the MUSE corpus)

The Suit check tab (`web/dist/suit-layers.js`) follows one NASA page, read on 2026-11-15 (by Claude Code and, separately, by a teammate), not by an
independent human reviewer: **Review status: Pending.**

| Topic | Source | What it says |
| --- | --- | --- |
| Layers and parts | [Spacewalk Spacesuit Basics, NASA](https://www.nasa.gov/centers-and-facilities/johnson/spacewalk-spacesuit-basics/) (published 2019-10-04, updated 2023-08-30) | The flexible parts have up to 16 layers. It gives no exact count and does not name every layer. Named, skin outwards: a cooling garment of spandex with water tubes (the first three layers), a bladder layer, a layer that holds the bladder in shape, a ripstop liner, several insulation layers, and a white outer layer of three kinds of thread. It also names the hard upper torso, lower torso with waist bearing, heated gloves, the helmet and visors, the audio system, and the life support backpack (oxygen and regulator, fan and carbon dioxide removal, power and radio, cooling water with chiller and pump). |

An earlier search-result summary said 14 layers (and a NIAC report 3 + 2 + 9); the NASA page itself says up to 16, so the checklist does not claim a count. The checklist groups the six layer functions the page describes and adds separate equipment checks; it does not claim a layer count. The page itself does not mention a pressure-system check: that item is a manual record of the user's approved procedure, not something NASA's page describes.

## Astronaut heart figures (iPhone "Watch comparison" card, not in the MUSE corpus)

The Dashboard card (`ios/CrewSafety/Features/Telemetry/HealthComparison.swift`) compares Apple Watch daily
readings with the wearer's own last 28 days and with two published in-flight figures. Read on 2026-11-15
by Claude Code from the PubMed Central copy (the table was read as page text, not checked against the
PDF), not by an independent human reviewer: **Review status: Pending.**

| Measurement | Figure used | Source | Where in the source |
| --- | --- | --- | --- |
| Heart rate | 74.6 ± 8.2 bpm (mean ± SD), 7 astronauts | Otsuka K, Cornelissen G, Kubo Y, et al. Anti-aging effects of long-term space missions, estimated by heart rate variability. *Sci Rep* 2019;9:8995. [PMC6586662](https://pmc.ncbi.nlm.nih.gov/articles/PMC6586662/), CC BY 4.0 | Table 2, session ISS02 (138.6 ± 21.8 days after launch), geomagnetically quiet 24-hour spans |
| Heart rate variability | SDNNIDX 63.0 ± 22.7 ms (mean ± SD), 7 astronauts | Same paper | Same table and session |

| Resting heart rate | 57.7 ± 4.8 bpm (mean ± SD worked out from six per-astronaut values) | NASA Life Sciences Data Archive, [Average Resting Data by Subject](https://nlsp.nasa.gov/explore/data/details/IDP-LSDA_DATASET-0000000000001059?dataType=DATASETS), experiment 178066, STS-40 and STS-58 | Table 2, "In flight" rows, HR column. File kept in `data/nasa-lsda/raw/` |
| Breathing rate | 11.9 ± 0.4 breaths/min (mean ± SE, 62 measurements, 10 ISS crew); shown as ± 3.15 SD derived by us | NASA Life Sciences Data Archive, [Ventilation, Pulmonary Gas Exchange, VA/Q, and Pulmonary Perfusion](https://nlsp.nasa.gov/explore/data/details/IDP-LSDA_DATASET-0000000000001294?dataType=DATASETS), experiment 96-E044, ISS Expeditions 3 to 6 | "In-flight" row, fB column. File kept in `data/nasa-lsda/raw/` |

The two NASA rows were downloaded from NASA's portal and read by Claude Code on 2026-11-15; details, hashes
and what was not used are in `data/nasa-lsda/README.md`. **Review status: Pending** for these as well.

Limits a reviewer should check and the demo should state:

- Seven astronauts (6 men, 1 woman, 42.1 ± 6.8 years), 48-hour Holter ECG. This is a small published table, not a NASA dataset.
- The paper's Table 2 compares quiet and magnetically disturbed days; the quiet-day column of the later session was chosen by us. The same column for session ISS01 (about 21 days after launch) reads 74.1 ± 7.8 bpm and 62.9 ± 18.2 ms.
- "SDNNIDX" is taken to be the standard SDNN index (mean of 5-minute SDNN values); the paper's own definition was not located. Apple Watch reports SDNN from shorter readings, so the HRV comparison is rough. The paper's 24-hour SDNN (166.1 ± 48.8 ms) is a different quantity and is not used.
- The app shows the range as mean ± 1 SD and says only above, within or below. It makes no health statement.

Looked for and **not used**:

- NASA OSDR has no open human wearable or heart-rate dataset: its search API returned no human study for "heart rate variability", "wearable", "Apple Watch" or "ECG" on 2026-11-15. The Inspiration4 studies there (OSD-569 to OSD-687) are blood, urine, skin and omics data.
- The Inspiration4 crew wore Apple Watches (Jones et al., *Nature* 2024;632:1155, doi:10.1038/s41586-024-07648-x), but no heart-rate or HRV number was found in the text read (the values appear to be in figures), and its data-availability statement names repositories without an open download for the wearable data. No number was taken from it.
- The NASA archive tables are awake, at-rest measurements during experiments (6 and 10 people). Apple's resting heart rate is a whole-day estimate and its breathing rate is measured during sleep.
- Blood oxygen in flight: no NASA table with values was found (the Life Sciences Portal search for "oxygen saturation" returned only a data-collection timetable). A shuttle sleep study (Elliott et al., *Am J Respir Crit Care Med* 2001, "Microgravity reduces sleep-disordered breathing in humans"; citation details not checked) appears to report it, but the article could not be opened, so the card shows no astronaut figure for blood oxygen.
- Heart rate variability: no human HRV table was found in the Life Sciences Portal, so that figure still comes from the Otsuka paper.

## Figures for adults on Earth (same card)

The card also places each reading next to a published figure for adults on Earth, shown as mean ± 1 SD.
Read on 2026-11-15 by Claude Code from the open-access pages (page text, not the PDFs), not by an
independent human reviewer: **Review status: Pending.**

| Measurement | Figure used | Source | Where in the source |
| --- | --- | --- | --- |
| Heart rate | 74.6 ± 8.6 bpm, combined by us from men 73 ± 9 (1,825) and women 76 ± 8 (2,117) | Persson AP, Måneheim A, Economou Lundeberg J, et al. Reference ranges for ambulatory heart rate measurements in a middle-aged population. *Heart* 2024;110(12):831-837. [PMC11137473](https://pmc.ncbi.nlm.nih.gov/articles/PMC11137473/), CC BY 4.0 | Table 2, "Mean heart rate", subgroup of 3,942 without listed conditions; 24-hour ECG, ages 50 to 65, Sweden |
| Resting heart rate | 65.5 ± 7.7 bpm, 92,457 adults | Quer G, Gouda P, Galarnyk M, Topol EJ, Steinhubl SR. Inter- and intraindividual variability in daily resting heart rate. *PLoS ONE* 2020;15(2):e0227709. [Article](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0227709), CC BY 4.0 | Results, first paragraph; Fitbit wrist trackers worn at least 20 hours a day |
| Heart rate variability | SDNN 50 ± 16 ms across 27 studies | Nunan D, Sandercock GRH, Brodie DA. *Pacing Clin Electrophysiol* 2010;33(11):1407-1417, read from Table 6 of Shaffer F, Ginsberg JP. An Overview of Heart Rate Variability Metrics and Norms. *Front Public Health* 2017;5:258. [PMC5624990](https://pmc.ncbi.nlm.nih.gov/articles/PMC5624990/), CC BY | Table 6, SDNN row (range 32 to 93 ms); recordings of about 5 minutes |
| Breathing rate | 15.4 ± 2.35 breaths/min, 10,000 people aged 20 to 69 | Natarajan A, Su H-W, Heneghan C, et al. Measurement of respiratory rate using wearable devices and applications to COVID-19 detection. *npj Digit Med* 2021;4:136. [PMC8443549](https://pmc.ncbi.nlm.nih.gov/articles/PMC8443549/), CC BY 4.0 | Results ("The mean of the distribution is 15.4 ... standard deviation is 2.35"); Fitbit, during sleep |
| Blood oxygen | Daytime 96.17 ± 1.28%, 33,080 people | Shapiro I, Stein J, MacRae C, O'Reilly M. Pulse oximetry values from 33,080 participants in the Apple Heart & Movement Study. *npj Digit Med* 2023;6:134. [PMC10374661](https://pmc.ncbi.nlm.nih.gov/articles/PMC10374661/), CC BY 4.0 | Results, full-cohort sentence; night-time figure 95.38 ± 1.47% not used |

Limits a reviewer should check:

- Heart rate: the paper gives men and women separately; the single figure is our combination of the two rows from their rounded table values. Everyone was 50 to 65.
- Resting heart rate: the paper writes "65.5 ± 7.7" without naming the ± figure; it is read as the SD.
- Heart rate variability: Nunan's table summarises study averages, so its spread is taken to be between studies, not between people (our reading of the table's "Studies" column and range). The Nunan paper itself is not open access; only the reproduced table was read. Its title contains "normal" and "healthy", which the card shows only inside the citation.
- Breathing rate: the paper also gives a 90% range of 11.8 to 19.2 and a 95% range of 11.2 to 20.0 breaths/min.
- Blood oxygen: the study's device details and its day and night time windows were not read in full; the card calls the figure "daytime" as the paper does. The Watch figure averages the whole day.
- Three of the five studies used Fitbit or ECG equipment, not an Apple Watch.
