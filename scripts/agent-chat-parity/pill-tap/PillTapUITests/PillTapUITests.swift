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
}
