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
  }
}
