import XCTest

final class PillTapUITests: XCTestCase {
  func testTapScrollPill() {
    let atmos = XCUIApplication(bundleIdentifier: "land.atmos.mobile")
    atmos.activate()
    let pill = atmos.buttons["agent-chat-scroll-pill"]
    if pill.waitForExistence(timeout: 20) {
      pill.tap()
      return
    }
    let other = atmos.otherElements["agent-chat-scroll-pill"]
    XCTAssertTrue(other.waitForExistence(timeout: 5), "scroll pill was not in the accessibility tree")
    other.tap()
  }

  func testTapCardPills() {
    let atmos = XCUIApplication(bundleIdentifier: "land.atmos.mobile")
    atmos.activate()
    let plan = atmos.buttons["agent-chat-card-pill-plan"]
    XCTAssertTrue(plan.waitForExistence(timeout: 30), "plan pill was not in the accessibility tree")
    plan.tap()
    Thread.sleep(forTimeInterval: 1.2)
    let queue = atmos.buttons["agent-chat-card-pill-queue"]
    XCTAssertTrue(queue.waitForExistence(timeout: 10), "queue pill was not in the accessibility tree")
    queue.tap()
    Thread.sleep(forTimeInterval: 1.2)
    queue.tap()
    Thread.sleep(forTimeInterval: 1.2)
    let questions = atmos.buttons["agent-chat-card-pill-permission"]
    XCTAssertTrue(questions.waitForExistence(timeout: 10), "questions pill was not in the accessibility tree")
    questions.tap()
    Thread.sleep(forTimeInterval: 1.2)
    let skip = atmos.buttons["agent-chat-permission-skip"]
    XCTAssertTrue(skip.waitForExistence(timeout: 10), "skip was not in the accessibility tree")
    skip.tap()
  }

  func testSwipeCardPills() {
    let atmos = XCUIApplication(bundleIdentifier: "land.atmos.mobile")
    atmos.activate()
    let scroll = atmos.buttons["agent-chat-scroll-pill"]
    XCTAssertTrue(scroll.waitForExistence(timeout: 30), "scroll pill was not in the accessibility tree")
    if let row = cardPillScroller(atmos) {
      row.swipeLeft()
    } else {
      let questions = atmos.buttons["agent-chat-card-pill-permission"]
      XCTAssertTrue(questions.waitForExistence(timeout: 10), "questions pill was not in the accessibility tree")
      let start = questions.coordinate(withNormalizedOffset: CGVector(dx: 0.8, dy: 0.5))
      let end = scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5))
      start.press(forDuration: 0.05, thenDragTo: end)
    }
    Thread.sleep(forTimeInterval: 0.8)
    let plan = atmos.buttons["agent-chat-card-pill-plan"]
    XCTAssertTrue(plan.waitForExistence(timeout: 10), "plan pill was not in the accessibility tree")
    plan.tap()
    Thread.sleep(forTimeInterval: 0.8)
    scroll.tap()
  }

  /// React Native puts the ScrollView testID on the wrapper, not on UIScrollView.
  /// Run 39234251245 found three ScrollViews and none named this id, while the
  /// scroll pill button was on screen.
  private func cardPillScroller(_ atmos: XCUIApplication) -> XCUIElement? {
    let scrollView = atmos.scrollViews["agent-chat-card-pill-scroller"]
    if scrollView.waitForExistence(timeout: 3) {
      return scrollView
    }
    let other = atmos.otherElements["agent-chat-card-pill-scroller"]
    if other.waitForExistence(timeout: 5) {
      return other
    }
    return nil
  }

  func testTapComposerField() {
    let atmos = XCUIApplication(bundleIdentifier: "land.atmos.mobile")
    atmos.activate()
    let view = atmos.textViews["agent-chat-composer-input"]
    if view.waitForExistence(timeout: 30) {
      view.tap()
    } else {
      let field = atmos.textFields["agent-chat-composer-input"]
      XCTAssertTrue(field.waitForExistence(timeout: 5), "composer field was not in the accessibility tree")
      field.tap()
    }
    XCTAssertTrue(atmos.keyboards.firstMatch.waitForExistence(timeout: 8), "software keyboard did not open")
    Thread.sleep(forTimeInterval: 0.6)
  }
}
