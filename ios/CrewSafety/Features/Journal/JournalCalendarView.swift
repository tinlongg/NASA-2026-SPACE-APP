import SwiftUI

/// Pure calendar helpers, kept apart from the view so they can be tested.
enum JournalCalendar {
    /// Start-of-day dates that have at least one entry.
    static func daysWithEntries(_ entries: [JournalEntry], calendar: Calendar = .current) -> Set<Date> {
        Set(entries.map { calendar.startOfDay(for: $0.timestamp) })
    }

    static func entries(on day: Date, in entries: [JournalEntry], calendar: Calendar = .current) -> [JournalEntry] {
        entries.filter { calendar.isDate($0.timestamp, inSameDayAs: day) }
    }

    /// One cell per grid slot for the month containing `month`: nil for the blanks before the 1st,
    /// then the start of each day. Weeks start on the calendar's first weekday.
    static func monthGrid(for month: Date, calendar: Calendar = .current) -> [Date?] {
        guard let interval = calendar.dateInterval(of: .month, for: month),
              let days = calendar.range(of: .day, in: .month, for: month) else { return [] }
        let weekday = calendar.component(.weekday, from: interval.start)
        let blanks = (weekday - calendar.firstWeekday + 7) % 7
        let dates = days.compactMap { calendar.date(byAdding: .day, value: $0 - 1, to: interval.start) }
        return Array(repeating: nil, count: blanks) + dates.map { Optional($0) }
    }
}

/// Month grid above the journal history. Days with entries are marked; tap one to read that day.
struct JournalCalendarView: View {
    let entries: [JournalEntry]
    @Binding var selectedDay: Date?
    @State private var month = Date.now
    private let calendar = Calendar.current
    private let columns = Array(repeating: GridItem(.flexible(), spacing: 4), count: 7)

    var body: some View {
        let marked = JournalCalendar.daysWithEntries(entries, calendar: calendar)
        VStack(spacing: Theme.Spacing.s) {
            HStack {
                Button { shift(-1) } label: { Image(systemName: "chevron.left") }
                    .accessibilityLabel("Previous month")
                Spacer()
                Text(month.formatted(.dateTime.month(.wide).year())).font(.headline)
                Spacer()
                Button { shift(1) } label: { Image(systemName: "chevron.right") }
                    .accessibilityLabel("Next month")
            }
            .buttonStyle(.borderless)
            LazyVGrid(columns: columns, spacing: 4) {
                ForEach(Array(weekdaySymbols.enumerated()), id: \.offset) { _, symbol in
                    Text(symbol).font(.caption2).foregroundStyle(Theme.tertiaryText)
                }
                ForEach(Array(JournalCalendar.monthGrid(for: month, calendar: calendar).enumerated()), id: \.offset) { _, day in
                    if let day { cell(for: day, marked: marked.contains(day)) } else { Color.clear.frame(height: 36) }
                }
            }
        }
        .padding(.vertical, Theme.Spacing.xs)
    }

    private var weekdaySymbols: [String] {
        let symbols = calendar.veryShortStandaloneWeekdaySymbols
        let start = calendar.firstWeekday - 1
        return Array(symbols[start...] + symbols[..<start])
    }

    @ViewBuilder
    private func cell(for day: Date, marked: Bool) -> some View {
        let number = calendar.component(.day, from: day)
        let isSelected = selectedDay.map { calendar.isDate($0, inSameDayAs: day) } ?? false
        let isToday = calendar.isDateInToday(day)
        Button {
            selectedDay = isSelected ? nil : day
        } label: {
            Text("\(number)")
                .font(.subheadline.weight(isSelected ? .semibold : .regular))
                .frame(maxWidth: .infinity, minHeight: 36)
                .foregroundStyle(isSelected ? Theme.onAccent : (marked ? Theme.primaryText : Theme.tertiaryText))
                .background(isSelected ? Theme.accent : (marked ? Theme.raised : .clear),
                            in: RoundedRectangle(cornerRadius: Theme.controlRadius))
                .overlay {
                    RoundedRectangle(cornerRadius: Theme.controlRadius)
                        .strokeBorder(isToday ? Theme.cardBorder : .clear, lineWidth: 1)
                }
                .overlay(alignment: .bottom) {
                    if marked { Circle().fill(isSelected ? Theme.onAccent : Theme.accent).frame(width: 4, height: 4).padding(.bottom, 3) }
                }
        }
        .buttonStyle(.plain)
        .disabled(!marked)
        .accessibilityLabel(day.formatted(date: .complete, time: .omitted) + (marked ? ", has entries" : ""))
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    private func shift(_ months: Int) {
        month = calendar.date(byAdding: .month, value: months, to: month) ?? month
    }
}
