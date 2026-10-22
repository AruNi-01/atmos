import ExpoModulesCore
import Foundation

/// One Computer or terminal WebSocket, opened with URLSession.
///
/// React Native's WebSocket uses SocketRocket, which dials a single DNS answer
/// and has no Happy Eyeballs. URLSession is the stack the phone's REST calls
/// already use, so a relay upgrade follows the same path that can list Computers.
struct AtmosSocketEvent: Record {
  @Field var data: String = ""
  @Field var code: Int = 0
  @Field var reason: String = ""
  @Field var wasClean: Bool = false
  @Field var message: String = ""
}

enum AtmosSocketSendError: LocalizedError {
  case notOpen

  var errorDescription: String? {
    switch self {
    case .notOpen:
      return "WebSocket is not open"
    }
  }
}

/// Session for Computer/terminal WebSockets.
///
/// Do not use `URLSessionConfiguration.default`. When
/// `EX_DEV_CLIENT_NETWORK_INSPECTOR` is true, expo-dev-launcher swizzles that
/// getter and prepends `ExpoRequestInterceptorProtocol`. The interceptor
/// replays the handshake as a data task and swallows HTTP 101 Switching Protocols,
/// after which `URLSessionWebSocketTask` fails with `NSURLErrorDomain -1005`.
/// Release is unaffected because the interceptor is
/// compiled out. `ephemeral` is not swizzled today; if a future inspector
/// also replaces it, allocate a configuration that does not go through those
/// class getters and drop inspector `URLProtocol` classes.
private enum AtmosRelayWebSocketSession {
  static func configuration() -> URLSessionConfiguration {
    let config = URLSessionConfiguration.ephemeral
    applySharedDefaultTransportSettings(to: config)
    stripExpoNetworkInspectorProtocols(from: config)
    if containsExpoNetworkInspectorProtocol(config) {
      let clean = URLSessionConfiguration()
      applySharedDefaultTransportSettings(to: clean)
      stripExpoNetworkInspectorProtocols(from: clean)
      if containsExpoNetworkInspectorProtocol(clean) {
        clean.protocolClasses = []
      }
      return clean
    }
    return config
  }

  /// Copy timeout, cookie, and header settings from `.default` so the
  /// handshake matches the previous session. Do not copy `protocolClasses`:
  /// that array is where the Expo inspector lives.
  private static func applySharedDefaultTransportSettings(to config: URLSessionConfiguration) {
    let shared = URLSessionConfiguration.default
    config.timeoutIntervalForRequest = shared.timeoutIntervalForRequest
    config.timeoutIntervalForResource = shared.timeoutIntervalForResource
    config.waitsForConnectivity = shared.waitsForConnectivity
    config.httpCookieAcceptPolicy = shared.httpCookieAcceptPolicy
    config.httpShouldSetCookies = shared.httpShouldSetCookies
    config.httpCookieStorage = shared.httpCookieStorage
    config.httpAdditionalHeaders = shared.httpAdditionalHeaders
  }

  private static func stripExpoNetworkInspectorProtocols(from config: URLSessionConfiguration) {
    guard let classes = config.protocolClasses else { return }
    config.protocolClasses = classes.filter { !isExpoNetworkInspectorProtocol($0) }
  }

  private static func containsExpoNetworkInspectorProtocol(_ config: URLSessionConfiguration)
    -> Bool
  {
    config.protocolClasses?.contains(where: isExpoNetworkInspectorProtocol) ?? false
  }

  private static func isExpoNetworkInspectorProtocol(_ cls: AnyClass) -> Bool {
    let name = NSStringFromClass(cls)
    if name == "EXRequestInterceptorProtocol" || name == "ExpoRequestInterceptorProtocol" {
      return true
    }
    return name.hasSuffix(".ExpoRequestInterceptorProtocol")
      || name.hasSuffix(".EXRequestInterceptorProtocol")
  }
}

/// URLSession's delegate is an Objective-C protocol, so it cannot be the Expo shared object.
final class AtmosSocketDelegate: NSObject, URLSessionWebSocketDelegate {
  weak var owner: AtmosUrlSessionSocket?

  func urlSession(
    _ session: URLSession,
    webSocketTask: URLSessionWebSocketTask,
    didOpenWithProtocol protocol: String?
  ) {
    owner?.socketDidOpen(webSocketTask)
  }

  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    didCompleteWithError error: Error?
  ) {
    owner?.socketDidComplete(task: task, error: error)
  }
}

final class AtmosUrlSessionSocket: SharedObject {
  private static let maxMessageSize = 16 * 1024 * 1024

  private let stateLock = NSLock()
  private let delegate = AtmosSocketDelegate()
  private var session: URLSession?
  private var task: URLSessionWebSocketTask?
  private var opened = false
  private var finished = false

  override init() {
    super.init()
    delegate.owner = self
  }

  func connect(urlString: String) {
    guard let url = URL(string: urlString), let scheme = url.scheme?.lowercased(),
      scheme == "ws" || scheme == "wss"
    else {
      complete(error: URLError(.badURL), code: 1006, reason: "Invalid WebSocket URL")
      return
    }

    let session = URLSession(
      configuration: AtmosRelayWebSocketSession.configuration(),
      delegate: delegate,
      delegateQueue: nil
    )
    let task = session.webSocketTask(with: url)
    task.maximumMessageSize = Self.maxMessageSize
    stateLock.lock()
    self.session = session
    self.task = task
    stateLock.unlock()
    task.resume()
  }

  func send(text: String) throws {
    stateLock.lock()
    let task = self.task
    let isOpen = opened && !finished
    stateLock.unlock()
    guard isOpen, let task else {
      throw AtmosSocketSendError.notOpen
    }
    task.send(.string(text)) { [weak self] error in
      guard let error else { return }
      self?.emit(
        event: "error",
        payload: AtmosSocketEvent(message: error.localizedDescription)
      )
    }
  }

  func ping() {
    stateLock.lock()
    let task = self.task
    let isOpen = opened && !finished
    stateLock.unlock()
    guard isOpen, let task else {
      emit(event: "error", payload: AtmosSocketEvent(message: "WebSocket is not open"))
      return
    }
    task.sendPing { [weak self] error in
      guard let self else { return }
      if let error {
        self.emit(event: "error", payload: AtmosSocketEvent(message: error.localizedDescription))
        return
      }
      self.emit(event: "pong", payload: AtmosSocketEvent())
    }
  }

  func close(code: Int, reason: String) {
    stateLock.lock()
    let task = self.task
    let alreadyFinished = finished
    stateLock.unlock()
    if alreadyFinished { return }
    let closeCode = URLSessionWebSocketTask.CloseCode(rawValue: code) ?? .normalClosure
    task?.cancel(with: closeCode, reason: Data(reason.utf8))
  }

  func socketDidOpen(_ webSocketTask: URLSessionWebSocketTask) {
    stateLock.lock()
    opened = true
    stateLock.unlock()
    emit(event: "open", payload: AtmosSocketEvent())
    receiveNext(on: webSocketTask)
  }

  func socketDidComplete(task: URLSessionTask, error: Error?) {
    let socketTask = task as? URLSessionWebSocketTask
    let rawCode = socketTask?.closeCode.rawValue ?? 0
    let code = rawCode == 0 ? 1006 : rawCode
    let reason = (error as NSError?)?.localizedDescription ?? ""
    complete(error: error, code: code, reason: reason)
  }

  public override func sharedObjectWillRelease() {
    stateLock.lock()
    finished = true
    let task = self.task
    let session = self.session
    self.task = nil
    self.session = nil
    stateLock.unlock()
    task?.cancel(with: .goingAway, reason: nil)
    session?.invalidateAndCancel()
  }

  private func receiveNext(on task: URLSessionWebSocketTask) {
    task.receive { [weak self] result in
      guard let self else { return }
      switch result {
      case .success(let message):
        switch message {
        case .string(let text):
          self.emit(event: "message", payload: AtmosSocketEvent(data: text))
        case .data(let data):
          if let text = String(data: data, encoding: .utf8) {
            self.emit(event: "message", payload: AtmosSocketEvent(data: text))
          }
        @unknown default:
          break
        }
        self.receiveNext(on: task)
      case .failure(let error):
        let rawCode = task.closeCode.rawValue
        if rawCode == 0 {
          // Close code is still invalid; urlSession(_:task:didCompleteWithError:) reports it.
          return
        }
        let isNormal = rawCode == URLSessionWebSocketTask.CloseCode.normalClosure.rawValue
        self.complete(
          error: isNormal ? nil : error,
          code: rawCode,
          reason: error.localizedDescription
        )
      }
    }
  }

  private func complete(error: Error?, code: Int, reason: String) {
    stateLock.lock()
    if finished {
      stateLock.unlock()
      return
    }
    finished = true
    let session = self.session
    self.task = nil
    self.session = nil
    stateLock.unlock()

    let failed = error != nil && code != URLSessionWebSocketTask.CloseCode.normalClosure.rawValue
    if failed {
      emit(
        event: "error",
        payload: AtmosSocketEvent(message: error?.localizedDescription ?? reason)
      )
    }
    emit(
      event: "close",
      payload: AtmosSocketEvent(
        code: code,
        reason: reason,
        wasClean: code == URLSessionWebSocketTask.CloseCode.normalClosure.rawValue && error == nil
      )
    )
    session?.finishTasksAndInvalidate()
  }
}

public class AtmosUrlSessionSocketModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AtmosUrlSessionSocket")

    Class("AtmosUrlSessionSocket", AtmosUrlSessionSocket.self) {
      Constructor { AtmosUrlSessionSocket() }

      Function("connect") { (sock: AtmosUrlSessionSocket, url: String) in
        sock.connect(urlString: url)
      }

      Function("send") { (sock: AtmosUrlSessionSocket, text: String) in
        try sock.send(text: text)
      }

      Function("ping") { (sock: AtmosUrlSessionSocket) in
        sock.ping()
      }

      Function("close") { (sock: AtmosUrlSessionSocket, code: Int, reason: String) in
        sock.close(code: code, reason: reason)
      }
    }
  }
}
