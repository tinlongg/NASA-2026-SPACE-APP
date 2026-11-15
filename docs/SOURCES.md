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

## Candidate sources for the suit readiness check (not in the MUSE corpus)

Found by web search on 2026-11-15 for roadmap Phase 5. **Not yet read in full or verified**: only search-result
summaries were seen, so no layer names may be taken from them until a person reads the primary pages. Review status: Pending.

| Topic | Source | What the summary said |
| --- | --- | --- |
| EMU layer count | [NASA Out-of-School Learning, Living and Working in Space](https://www.nasa.gov/wp-content/uploads/2019/08/nosl-grc-ps-01984-living-working-module.pdf) | 14 layers (not 12) |
| Layer groups | [NASA NIAC Phase I report (Dunbar)](https://www.nasa.gov/wp-content/uploads/2025/06/niac-2022-phi-dunbar-spacesuit-tagged.pdf) | Cooling garment 3 + pressure bladder/restraint 2 + thermal micrometeoroid garment 9; other NASA text says the thermal micrometeoroid garment has 7 layers |
| Systems | [NASA OIG IG-17-018](https://oig.nasa.gov/docs/IG-17-018.pdf) | EMU = Pressure Garment System + Primary Life Support System |
| Outer shell | [ICES-2025-56 Artemis suit material overview](https://ntrs.nasa.gov/api/citations/20250003726/downloads/ICES-2025-56%20Artemis%20Suit%20Material%20Overview%20FINAL.pdf) | Ortho-Fabric shell |
| Pre-EVA checkout | [NTRS 20170009505](https://ntrs.nasa.gov/api/citations/20170009505/downloads/20170009505.pdf) | Table of contents lists Pre-EVA Checkout (manual, automatic) and a Leakage Check section 3.2.5.2 |
