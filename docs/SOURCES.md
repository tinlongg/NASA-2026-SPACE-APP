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
