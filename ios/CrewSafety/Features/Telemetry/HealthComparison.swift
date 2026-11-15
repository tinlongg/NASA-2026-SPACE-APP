import Foundation

/// Compares Apple Watch readings with three things: the wearer's own recent days, figures published
/// for adults on Earth, and figures published for astronauts in flight. Pure logic: no HealthKit, so
/// it can be unit-tested.
///
/// The output is descriptive only ("above your usual range"). It never says a reading is good, bad,
/// safe or a sign of anything, and nothing here feeds the alert logic.
enum HealthMetric: String, CaseIterable, Identifiable, Sendable {
    case heartRate, restingHeartRate, heartRateVariability, respiratoryRate, bloodOxygen

    var id: String { rawValue }

    var title: String {
        switch self {
        case .heartRate: "Heart rate"
        case .restingHeartRate: "Resting heart rate"
        case .heartRateVariability: "Heart rate variability"
        case .respiratoryRate: "Breathing rate"
        case .bloodOxygen: "Blood oxygen"
        }
    }

    /// What the daily number is, in a few words.
    var note: String {
        switch self {
        case .heartRate: "Average of the day's Watch readings"
        case .restingHeartRate: "Apple's daily resting estimate"
        case .heartRateVariability: "SDNN, average of the day's readings"
        case .respiratoryRate: "Average while asleep"
        case .bloodOxygen: "Average of the day's readings"
        }
    }

    var unit: String {
        switch self {
        case .heartRate, .restingHeartRate: "bpm"
        case .heartRateVariability: "ms"
        case .respiratoryRate: "breaths/min"
        case .bloodOxygen: "%"
        }
    }

    var fractionDigits: Int { self == .respiratoryRate ? 1 : 0 }

    /// The value at the precision shown on screen. Comparisons use this, so the sentence always
    /// agrees with the numbers printed next to it.
    func rounded(_ value: Double) -> Double {
        let scale = pow(10, Double(fractionDigits))
        return (value * scale).rounded() / scale
    }

    func number(_ value: Double) -> String { String(format: "%.\(fractionDigits)f", rounded(value)) }

    func format(_ value: Double) -> String { self == .bloodOxygen ? "\(number(value))%" : "\(number(value)) \(unit)" }

    func formatRange(_ low: Double, _ high: Double) -> String {
        self == .bloodOxygen ? "\(number(low))–\(number(high))%" : "\(number(low))–\(number(high)) \(unit)"
    }
}

/// One value per calendar day, `day` being the start of that day.
struct DailyValue: Equatable, Sendable {
    let day: Date
    let value: Double
}

enum Standing: Equatable, Sendable {
    case below, within, above

    var word: String {
        switch self {
        case .below: "Below"
        case .within: "Within"
        case .above: "Above"
        }
    }
}

/// The middle 80% of the wearer's own recent daily values.
struct UsualRange: Equatable, Sendable {
    let low: Double
    let high: Double
    /// How many days of history the range is built from.
    let days: Int
}

struct ReferenceSource: Equatable, Sendable {
    let id: String
    let citation: String
    let url: URL
    let licence: String
    let retrievedOn: String
}

/// A published figure for a group of people: mean and standard deviation. Used both for astronauts
/// in flight and for adults on Earth.
struct PublishedReference: Equatable, Sendable {
    let metric: HealthMetric
    let mean: Double
    let sd: Double
    /// How many people the figure covers, where the source gives a count.
    let participants: Int?
    /// Short description used in the comparison sentence.
    let group: String
    /// How and when the study measured it.
    let setting: String
    /// Why the study's number and the Watch's number are not measured the same way.
    let caveat: String
    let source: ReferenceSource
    /// How the range was formed, shown in the comparison sentence.
    var rangeLabel = "mean ± 1 SD"

    var low: Double { mean - sd }
    var high: Double { mean + sd }
}

struct ECGSummary: Equatable, Sendable {
    /// Apple's own label for the recording, e.g. "Sinus rhythm".
    let label: String
    let averageHeartRate: Double?
    let recordedAt: Date
}

struct MetricComparison: Identifiable, Equatable, Sendable {
    let metric: HealthMetric
    /// The most recent daily value, if there is one from the last few days.
    let value: Double?
    let day: Date?
    let usual: UsualRange?
    /// Days of history found, whether or not they were enough for a usual range.
    let historyDays: Int
    let baselineStanding: Standing?
    /// The figure for astronauts in flight.
    let reference: PublishedReference?
    let referenceStanding: Standing?
    /// The figure for adults on Earth.
    let everyday: PublishedReference?
    let everydayStanding: Standing?

    var id: String { metric.id }

    var baselineSentence: String {
        guard value != nil else { return "No recent reading in Health." }
        guard let usual, let baselineStanding else {
            return "Your usual range needs \(HealthComparison.minimumHistoryDays) earlier days of readings; \(historyDays) found."
        }
        return "\(baselineStanding.word) your usual range (\(metric.formatRange(usual.low, usual.high)), last \(usual.days) days with readings)."
    }

    var referenceSentence: String {
        sentence(for: reference, standing: referenceStanding, missing: "No astronaut figure has been verified for this measurement.")
    }

    var everydaySentence: String {
        sentence(for: everyday, standing: everydayStanding, missing: "No figure for adults on Earth has been verified for this measurement.")
    }

    private func sentence(for reference: PublishedReference?, standing: Standing?, missing: String) -> String {
        guard let reference else { return missing }
        let range = "\(metric.formatRange(reference.low, reference.high)), \(reference.rangeLabel)"
        guard let standing else { return "Reported for \(reference.group): \(range)." }
        return "\(standing.word) the range reported for \(reference.group) (\(range))."
    }
}

enum HealthComparison {
    /// How far back the wearer's own history goes.
    static let historyWindowDays = 28
    /// Fewer earlier days than this and no usual range is shown.
    static let minimumHistoryDays = 7
    /// A daily value older than this is not treated as current.
    static let latestMaxAgeDays = 3

    // MARK: Published in-flight figures

    static let otsuka2019 = ReferenceSource(
        id: "otsuka-2019",
        citation: "Otsuka K, Cornelissen G, Kubo Y, et al. Anti-aging effects of long-term space missions, estimated by heart rate variability. Scientific Reports 2019;9:8995.",
        url: URL(string: "https://pmc.ncbi.nlm.nih.gov/articles/PMC6586662/")!,
        licence: "CC BY 4.0",
        retrievedOn: "2026-11-15")

    private static let otsukaSetting = "24-hour ECG recordings about 139 days after launch (session ISS02, geomagnetically quiet days), Table 2"

    /// NASA Life Sciences Data Archive, experiment 178066 (STS-40 and STS-58, Spacelab Life Sciences 1 and 2).
    static let nasaSpacelabResting = ReferenceSource(
        id: "nasa-lsda-178066",
        citation: "NASA Life Sciences Data Archive: Average Resting Data by Subject, Inflight Study of Cardiovascular Deconditioning (experiment 178066, STS-40 and STS-58). Table from Shykoff BE, Farhi LE, Olszowka AJ, et al. J Appl Physiol 1996;81(1):26-32.",
        url: URL(string: "https://nlsp.nasa.gov/explore/data/details/IDP-LSDA_DATASET-0000000000001059?dataType=DATASETS")!,
        licence: "NASA public archive",
        retrievedOn: "2026-11-15")

    /// NASA Life Sciences Data Archive, experiment 96-E044 (ISS Expeditions 3 to 6).
    static let nasaISSPulmonary = ReferenceSource(
        id: "nasa-lsda-96-e044",
        citation: "NASA Life Sciences Data Archive: Ventilation, Pulmonary Gas Exchange, VA/Q, and Pulmonary Perfusion, The Effects of EVA and Long-Term Exposure to Microgravity on Pulmonary Function (experiment 96-E044, ISS Expeditions 3 to 6). Table from Prisk GK, Fine JM, Cooper TK, West JB. J Appl Physiol 2006;101:439-447.",
        url: URL(string: "https://nlsp.nasa.gov/explore/data/details/IDP-LSDA_DATASET-0000000000001294?dataType=DATASETS")!,
        licence: "NASA public archive",
        retrievedOn: "2026-11-15")

    /// In-flight resting heart rate of each of the six Spacelab astronauts, beats per minute, in the
    /// order of the NASA table ("In flight" rows, subjects 1 to 6). The mean and SD are worked out here.
    static let spacelabInflightRestingHeartRates: [Double] = [66, 52, 58, 57, 54, 59]

    /// ISS in-flight breathing frequency: mean and standard error over this many measurements.
    static let issBreathingMean = 11.9, issBreathingStandardError = 0.4, issBreathingMeasurements = 62

    static func mean(_ values: [Double]) -> Double { values.reduce(0, +) / Double(values.count) }

    /// Sample standard deviation (n − 1).
    static func standardDeviation(_ values: [Double]) -> Double {
        let average = mean(values)
        return (values.reduce(0) { $0 + ($1 - average) * ($1 - average) } / Double(values.count - 1)).squareRoot()
    }

    /// Only measurements with a figure read from the source itself are listed. Blood oxygen has none
    /// yet, and the card says so rather than borrowing a number.
    static let spaceflightReferences: [PublishedReference] = [
        PublishedReference(
            metric: .heartRate, mean: 74.6, sd: 8.2, participants: 7,
            group: "7 astronauts on the ISS",
            setting: otsukaSetting,
            caveat: "The study averaged a continuous 24-hour ECG, including sleep. Your figure averages the readings the Watch happened to take that day.",
            source: otsuka2019),
        PublishedReference(
            metric: .heartRateVariability, mean: 63.0, sd: 22.7, participants: 7,
            group: "7 astronauts on the ISS",
            setting: otsukaSetting,
            caveat: "The study's figure is the SDNN index (by its standard definition, the average of 5-minute SDNN values across a 24-hour ECG). Apple Watch works SDNN out from shorter readings taken mostly at rest, so the two are only roughly comparable.",
            source: otsuka2019),
        PublishedReference(
            metric: .restingHeartRate,
            mean: mean(spacelabInflightRestingHeartRates), sd: standardDeviation(spacelabInflightRestingHeartRates),
            participants: spacelabInflightRestingHeartRates.count,
            group: "6 astronauts on Spacelab shuttle flights",
            setting: "Measured at rest in flight during a cardiovascular experiment on the 9-day STS-40 and 14-day STS-58 missions; mean and SD worked out from NASA's per-astronaut table",
            caveat: "NASA's table gives each astronaut's average at rest during the experiment. Apple's resting heart rate is an estimate drawn from the whole day.",
            source: nasaSpacelabResting),
        PublishedReference(
            metric: .respiratoryRate,
            mean: issBreathingMean, sd: issBreathingStandardError * Double(issBreathingMeasurements).squareRoot(),
            participants: 10,
            group: "10 ISS crew members",
            setting: "\(issBreathingMeasurements) in-flight measurements across stays of 4 to 6 months, Expeditions 3 to 6",
            caveat: "The crew were awake and at rest during lung-function tests; the Watch measures breathing during sleep. NASA's table gives mean ± standard error (11.9 ± 0.4); the range here uses the SD that implies (SE × √62), which mixes differences between people with differences between sessions.",
            source: nasaISSPulmonary,
            rangeLabel: "mean ± 1 SD, SD worked out from the standard error"),
    ]

    static func reference(for metric: HealthMetric) -> PublishedReference? {
        spaceflightReferences.first { $0.metric == metric }
    }

    // MARK: Published figures for adults on Earth

    static let persson2024 = ReferenceSource(
        id: "persson-2024",
        citation: "Persson AP, Måneheim A, Economou Lundeberg J, et al. Reference ranges for ambulatory heart rate measurements in a middle-aged population. Heart 2024;110(12):831-837.",
        url: URL(string: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11137473/")!,
        licence: "CC BY 4.0",
        retrievedOn: "2026-11-15")

    static let quer2020 = ReferenceSource(
        id: "quer-2020",
        citation: "Quer G, Gouda P, Galarnyk M, Topol EJ, Steinhubl SR. Inter- and intraindividual variability in daily resting heart rate and its associations with age, sex, sleep, BMI, and time of year. PLoS ONE 2020;15(2):e0227709.",
        url: URL(string: "https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0227709")!,
        licence: "CC BY 4.0",
        retrievedOn: "2026-11-15")

    /// The review itself is not open access; its table is read from an open-access overview that reproduces it.
    static let nunan2010 = ReferenceSource(
        id: "nunan-2010",
        citation: "Nunan D, Sandercock GRH, Brodie DA. A quantitative systematic review of normal values for short-term heart rate variability in healthy adults. Pacing Clin Electrophysiol 2010;33(11):1407-1417. Read from Table 6 of Shaffer F, Ginsberg JP. An Overview of Heart Rate Variability Metrics and Norms. Front Public Health 2017;5:258.",
        url: URL(string: "https://pmc.ncbi.nlm.nih.gov/articles/PMC5624990/")!,
        licence: "CC BY",
        retrievedOn: "2026-11-15")

    static let natarajan2021 = ReferenceSource(
        id: "natarajan-2021",
        citation: "Natarajan A, Su H-W, Heneghan C, Blunt L, O'Connor C, Niehaus L. Measurement of respiratory rate using wearable devices and applications to COVID-19 detection. npj Digital Medicine 2021;4:136.",
        url: URL(string: "https://pmc.ncbi.nlm.nih.gov/articles/PMC8443549/")!,
        licence: "CC BY 4.0",
        retrievedOn: "2026-11-15")

    static let shapiro2023 = ReferenceSource(
        id: "shapiro-2023",
        citation: "Shapiro I, Stein J, MacRae C, O'Reilly M. Pulse oximetry values from 33,080 participants in the Apple Heart & Movement Study. npj Digital Medicine 2023;6:134.",
        url: URL(string: "https://pmc.ncbi.nlm.nih.gov/articles/PMC10374661/")!,
        licence: "CC BY 4.0",
        retrievedOn: "2026-11-15")

    /// 24-hour mean heart rate in the Swedish study, Table 2: the paper gives men and women separately.
    static let swedishHeartRateGroups: [(count: Int, mean: Double, sd: Double)] = [
        (count: 1825, mean: 73, sd: 9), // men
        (count: 2117, mean: 76, sd: 8), // women
    ]

    /// Mean and SD of several groups taken together, from each group's size, mean and SD.
    static func combined(_ groups: [(count: Int, mean: Double, sd: Double)]) -> (count: Int, mean: Double, sd: Double) {
        let total = Double(groups.reduce(0) { $0 + $1.count })
        let mean = groups.reduce(0) { $0 + Double($1.count) * $1.mean } / total
        let variance = groups.reduce(0) { $0 + Double($1.count) * ($1.sd * $1.sd + ($1.mean - mean) * ($1.mean - mean)) } / total
        return (Int(total), mean, variance.squareRoot())
    }

    /// One figure per measurement, each read from the source itself. Where a study used a wrist
    /// wearable it was preferred, because that is closest to how the Watch measures.
    static let everydayReferences: [PublishedReference] = {
        let swedish = combined(swedishHeartRateGroups)
        return [
            PublishedReference(
                metric: .heartRate, mean: swedish.mean, sd: swedish.sd, participants: swedish.count,
                group: "3,942 adults aged 50 to 65 in Sweden",
                setting: "24-hour ECG recordings, Table 2, in the study's subgroup without diabetes, high blood pressure, or heart and lung disease",
                caveat: "The paper gives men (73 ± 9 bpm) and women (76 ± 8 bpm) separately; the two are combined here. Everyone was aged 50 to 65, and a continuous ECG is not the same as the readings the Watch happened to take.",
                source: persson2024,
                rangeLabel: "mean ± 1 SD, men's and women's figures combined"),
            PublishedReference(
                metric: .restingHeartRate, mean: 65.5, sd: 7.7, participants: 92_457,
                group: "92,457 adults wearing Fitbit trackers",
                setting: "Daily resting heart rate from wrist trackers worn at least 20 hours a day, over a median of 320 days; average age 46",
                caveat: "Fitbit and Apple each work out resting heart rate with their own formula. The paper writes 65.5 ± 7.7 bpm without naming the ± figure; it is read here as the SD.",
                source: quer2020),
            PublishedReference(
                metric: .heartRateVariability, mean: 50, sd: 16, participants: nil,
                group: "adults in 27 studies of short recordings",
                setting: "A review of studies using recordings of about 5 minutes",
                caveat: "The figure is the average of 27 studies' results, so its spread is between studies and not between people. Apple Watch works SDNN out from shorter readings.",
                source: nunan2010),
            PublishedReference(
                metric: .respiratoryRate, mean: 15.4, sd: 2.35, participants: 10_000,
                group: "10,000 Fitbit wearers aged 20 to 69",
                setting: "Breathing rate during sleep, worked out from the wrist heart-rate signal",
                caveat: "The study also reports that 90% of values fell between 11.8 and 19.2 breaths/min. Fitbit and Apple each use their own method.",
                source: natarajan2021),
            PublishedReference(
                metric: .bloodOxygen, mean: 96.17, sd: 1.28, participants: 33_080,
                group: "33,080 Apple Watch wearers",
                setting: "Daytime readings in the Apple Heart and Movement Study",
                caveat: "This is the study's daytime figure; its night-time figure was lower, at 95.38 ± 1.47%. Your figure averages all of the day's readings.",
                source: shapiro2023),
        ]
    }()

    static func everydayReference(for metric: HealthMetric) -> PublishedReference? {
        everydayReferences.first { $0.metric == metric }
    }

    // MARK: Comparison

    /// Linear-interpolated percentile of ascending values, `fraction` from 0 to 1.
    static func percentile(_ sorted: [Double], _ fraction: Double) -> Double {
        guard let first = sorted.first else { return .nan }
        guard sorted.count > 1 else { return first }
        let position = min(max(fraction, 0), 1) * Double(sorted.count - 1)
        let lower = Int(position.rounded(.down)), upper = min(lower + 1, sorted.count - 1)
        return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - Double(lower))
    }

    /// The 10th to 90th percentile of the wearer's earlier daily values, or nil with too little history.
    static func usualRange(from history: [Double]) -> UsualRange? {
        let values = history.filter(\.isFinite).sorted()
        guard values.count >= minimumHistoryDays else { return nil }
        return UsualRange(low: percentile(values, 0.1), high: percentile(values, 0.9), days: values.count)
    }

    static func standing(of value: Double, low: Double, high: Double, metric: HealthMetric) -> Standing {
        let shown = metric.rounded(value)
        if shown < metric.rounded(low) { return .below }
        if shown > metric.rounded(high) { return .above }
        return .within
    }

    /// Takes the newest daily value as "now" and the days before it as the wearer's history.
    static func compare(metric: HealthMetric, daily: [DailyValue], now: Date, calendar: Calendar = .current) -> MetricComparison {
        let reference = reference(for: metric), everyday = everydayReference(for: metric)
        let today = calendar.startOfDay(for: now)
        let ordered = daily.filter { $0.value.isFinite && $0.day <= now }.sorted { $0.day < $1.day }
        guard let latest = ordered.last,
              let age = calendar.dateComponents([.day], from: calendar.startOfDay(for: latest.day), to: today).day,
              age <= latestMaxAgeDays else {
            return MetricComparison(metric: metric, value: nil, day: nil, usual: nil, historyDays: 0,
                                    baselineStanding: nil, reference: reference, referenceStanding: nil,
                                    everyday: everyday, everydayStanding: nil)
        }
        let windowStart = calendar.date(byAdding: .day, value: -historyWindowDays, to: calendar.startOfDay(for: latest.day)) ?? .distantPast
        let history = ordered.dropLast().filter { $0.day >= windowStart }.map(\.value)
        let usual = usualRange(from: history)
        return MetricComparison(
            metric: metric, value: latest.value, day: latest.day, usual: usual, historyDays: history.count,
            baselineStanding: usual.map { standing(of: latest.value, low: $0.low, high: $0.high, metric: metric) },
            reference: reference,
            referenceStanding: reference.map { standing(of: latest.value, low: $0.low, high: $0.high, metric: metric) },
            everyday: everyday,
            everydayStanding: everyday.map { standing(of: latest.value, low: $0.low, high: $0.high, metric: metric) })
    }

    static func compareAll(_ readings: [HealthMetric: [DailyValue]], now: Date, calendar: Calendar = .current) -> [MetricComparison] {
        HealthMetric.allCases.map { compare(metric: $0, daily: readings[$0] ?? [], now: now, calendar: calendar) }
    }

    /// "today", "yesterday" or a short date, for the label next to a value.
    static func dayLabel(_ day: Date, now: Date, calendar: Calendar = .current) -> String {
        let age = calendar.dateComponents([.day], from: calendar.startOfDay(for: day), to: calendar.startOfDay(for: now)).day ?? 0
        switch age {
        case 0: return "today"
        case 1: return "yesterday"
        default: return "\(age) days ago"
        }
    }
}
