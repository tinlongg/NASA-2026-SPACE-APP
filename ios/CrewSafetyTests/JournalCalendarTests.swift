import XCTest
@testable import CrewSafety

final class JournalCalendarTests: XCTestCase {
    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "GMT")!
        calendar.firstWeekday = 1 // Sunday
        return calendar
    }

    private func date(_ day: Int, hour: Int = 12) -> Date {
        calendar.date(from: DateComponents(year: 2026, month: 11, day: day, hour: hour))!
    }

    private func entry(_ date: Date) -> JournalEntry {
        JournalEntry(id: UUID(), crewMemberID: UUID(), timestamp: date, body: "x", summary: nil)
    }

    func testMonthGridStartsOnTheRightWeekdayAndHasEveryDay() {
        // 1 Nov 2026 is a Sunday, so no blanks; November has 30 days.
        let grid = JournalCalendar.monthGrid(for: date(15), calendar: calendar)
        XCTAssertEqual(grid.count, 30)
        XCTAssertEqual(grid.first!, calendar.startOfDay(for: date(1)))
        // December 2026 starts on a Tuesday: two blanks before the 1st.
        let december = calendar.date(from: DateComponents(year: 2026, month: 12, day: 10))!
        let decGrid = JournalCalendar.monthGrid(for: december, calendar: calendar)
        XCTAssertEqual(decGrid.prefix(2).compactMap { $0 }.count, 0)
        XCTAssertEqual(decGrid.count, 2 + 31)
    }

    func testDaysWithEntriesGroupsByDay() {
        let entries = [entry(date(10, hour: 8)), entry(date(10, hour: 22)), entry(date(12))]
        let days = JournalCalendar.daysWithEntries(entries, calendar: calendar)
        XCTAssertEqual(days, [calendar.startOfDay(for: date(10)), calendar.startOfDay(for: date(12))])
    }

    func testEntriesOnADayAreFiltered() {
        let entries = [entry(date(10, hour: 8)), entry(date(10, hour: 22)), entry(date(12))]
        XCTAssertEqual(JournalCalendar.entries(on: date(10), in: entries, calendar: calendar).count, 2)
        XCTAssertTrue(JournalCalendar.entries(on: date(11), in: entries, calendar: calendar).isEmpty)
    }
}
