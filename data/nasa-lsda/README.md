# NASA Life Sciences Data Archive tables for the Watch comparison

Downloaded 2026-11-15 from the NASA Life Sciences Portal (https://nlsp.nasa.gov), which hosts NASA's Life
Sciences Data Archive (LSDA). All three datasets are listed there as **Available online** and downloaded
without signing in. They are small summary tables that NASA made from published papers, not raw or
continuous recordings. NASA states that some individual-level data in the archive is restricted and must
be requested; nothing here came through a request.

| File in `raw/` | NASA dataset | Experiment and missions | Bytes | SHA-256 |
| --- | --- | --- | --- | --- |
| `178066__3141149154.xlsx` | [Average Resting Data by Subject](https://nlsp.nasa.gov/explore/data/details/IDP-LSDA_DATASET-0000000000001059?dataType=DATASETS) | 178066, Inflight Study of Cardiovascular Deconditioning; STS-40 and STS-58 (Spacelab Life Sciences 1 and 2) | 11841 | `ed9d1059f22231b0434d3b334669b19e7bd68874e91060a2a1e30e2213651cbc` |
| `96_E044_2110117370.xls` | [Ventilation, Pulmonary Gas Exchange, VA/Q, and Pulmonary Perfusion](https://nlsp.nasa.gov/explore/data/details/IDP-LSDA_DATASET-0000000000001294?dataType=DATASETS) | 96-E044, The Effects of EVA and Long-Term Exposure to Microgravity on Pulmonary Function; ISS Expeditions 3 to 6 | 31744 | `c39d8c5badbf2826bafacee042e10c26f86325a6ba13602a989683e682e2ea11` |
| `96_E044_1950418134.xls` | [Resting Gas Exchange in ISS Crewmembers](https://nlsp.nasa.gov/explore/data/details/IDP-LSDA_DATASET-0000000000000770?dataType=DATASETS) | Same experiment | 35840 | `9b2be86dc84d540e1691c6679d5c86364f2daa24508034b3ca0e0361461d808d` |

Files are stored under NASA's inventory names (the portal appends a mission and timestamp suffix to the
download name). File route used: `https://nlsp.nasa.gov/api/v1/files/<file id>/download`.

## What the app uses

`ios/CrewSafety/Features/Telemetry/HealthComparison.swift` holds the numbers; the files are kept for checking.

- **Resting heart rate.** `178066__3141149154.xlsx`, Table 2, rows under "In flight", column "HR, beats/min",
  subjects 1 to 6: 66, 52, 58, 57, 54, 59. The app works out the mean (57.7) and sample SD (4.8) itself.
  The same table gives preflight erect (80, 74, 65, 74, 78, 63) and preflight supine (69, 62, 58, 69, 63, 57).
  Table source: Shykoff BE, et al. J Appl Physiol 1996;81(1):26-32.
- **Breathing rate.** `96_E044_2110117370.xls`, row "In-flight", column "fB, breaths/min": 11.9 +/- 0.4,
  (62) measurements, "means +/- SE", ten subjects (9 male, 1 female) per the dataset description. The app
  turns the standard error into an SD (0.4 × √62 ≈ 3.15) to draw a range. That is our arithmetic, not a
  NASA figure, and it mixes between-person and between-session spread.
  Table source: Prisk GK, et al. J Appl Physiol 2006;101:439-447.

## Read but not used

- In-flight resting heart rate on the ISS, same row: 61.0 +/- 0.9 (62). `96_E044_1950418134.xls` gives
  60.3 +/- 1.2 before spacewalks (n=45) and breathing frequency 12.2 +/- 0.5; its heart-rate row is
  labelled "ml/min" in NASA's file, which looks like a unit typo.
- Cardiac output, blood pressure, stroke volume and lung-function columns.

## Limits

Six and ten people, measured awake at rest during experiments, decades ago. These are context for a
demo, not reference ranges for health, and they say nothing about whether the camera detector works.
The two older `.xls` files were read through macOS Quick Look's HTML rendering, the `.xlsx` by its XML.
A second person should open the files and confirm the numbers.
