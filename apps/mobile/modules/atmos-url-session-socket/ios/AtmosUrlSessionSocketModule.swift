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

    let session = URLSession(configuration: .default, delegate: delegate, delegateQueue: nil)
    let task = session.webSocketTask(with: url)
    stateLock.lock()
    self.session = session
    self.task = task
    stateLock.unlock()
    task.resume()
  }

  func send(text: String) {
    stateLock.lock()
    let task = self.task
    let isOpen = opened && !finished
    stateLock.unlock()
    guard isOpen, let task else { return }
    task.send(.string(text)) { _ in }
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
      case .failure:
        break
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
        sock.send(text: text)
      }

      Function("close") { (sock: AtmosUrlSessionSocket, code: Int, reason: String) in
        sock.close(code: code, reason: reason)
      }
    }
  }
}
