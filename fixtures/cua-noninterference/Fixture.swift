// Disposable native AppKit fixture for strict noninterference CUA testing.
// Each run has a fresh 96-bit lowercase hex token in its window title.
// --prove-window independently checks WindowServer's exact title -> PID
// relationship; it never prints PIDs, titles, bounds or other window data.
import AppKit
import CoreGraphics
import Darwin

private let prefix = "IOANT CUA Noninterference Fixture"

private func validToken(_ token: String) -> Bool {
  token.utf8.count == 24 &&
    token.utf8.allSatisfy { ($0 >= 48 && $0 <= 57) || ($0 >= 97 && $0 <= 102) }
}
private func fixtureTitle(_ token: String) -> String {
  "\(prefix) [\(token)]"
}
// A passive diagnostic for this one synthetic test PID and its nonce only.
// No other application names, windows, PIDs, bounds or content are returned.
// CGPreflightScreenCaptureAccess does not request or change permission.
private struct WindowProofEvidence {
  var metadataAvailable = false
  var screenRecordingGranted = false
  var ownedWindowCount = 0
  var ownedNormalWindowSeen = false
  var ownedWindowNameVisible = false
  var exactTitleCount = 0
  var exactTitleOwnedByTarget = false
  var exactTitleOwnedAtNormalLayer = false
  var verified = false

  func safeJSON() -> String {
    func flag(_ value: Bool) -> String { value ? "true" : "false" }
    let count = ownedWindowCount == 0 ? "none" :
      ownedWindowCount == 1 ? "one" : "multiple"
    return "{" +
      "\"verified\":\(flag(verified))," +
      "\"metadataAvailable\":\(flag(metadataAvailable))," +
      "\"screenRecordingGranted\":\(flag(screenRecordingGranted))," +
      "\"targetPidWindowCount\":\"\(count)\"," +
      "\"targetPidNormalWindowSeen\":\(flag(ownedNormalWindowSeen))," +
      "\"targetPidWindowNameVisible\":\(flag(ownedWindowNameVisible))," +
      "\"exactTitleWindowCount\":\"\(exactTitleCount == 0 ? "none" : exactTitleCount == 1 ? "one" : "multiple")\"," +
      "\"exactTitleOwnerMatched\":\(flag(exactTitleOwnedByTarget))," +
      "\"exactTitleNormalLayerMatched\":\(flag(exactTitleOwnedAtNormalLayer))" +
      "}"
  }
}
private func windowOwnershipEvidence(pid: Int32, token: String) -> WindowProofEvidence {
  var evidence = WindowProofEvidence()
  guard pid > 1, validToken(token) else { return evidence }
  evidence.screenRecordingGranted = CGPreflightScreenCaptureAccess()
  guard let rows = CGWindowListCopyWindowInfo(
    [.optionAll, .excludeDesktopElements],
    kCGNullWindowID) as? [[String: Any]] else { return evidence }
  evidence.metadataAvailable = true
  let title = fixtureTitle(token)
  for row in rows {
    let owner = (row[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value
    let layer = (row[kCGWindowLayer as String] as? NSNumber)?.intValue
    let name = row[kCGWindowName as String] as? String
    if owner == pid {
      evidence.ownedWindowCount += 1
      if layer == 0 { evidence.ownedNormalWindowSeen = true }
      if name != nil { evidence.ownedWindowNameVisible = true }
    }
    if name == title {
      evidence.exactTitleCount += 1
      if owner == pid {
        evidence.exactTitleOwnedByTarget = true
        if layer == 0 { evidence.exactTitleOwnedAtNormalLayer = true }
      }
    }
  }
  evidence.verified = evidence.exactTitleCount == 1 &&
    evidence.exactTitleOwnedByTarget &&
    evidence.exactTitleOwnedAtNormalLayer
  return evidence
}

// The fixture can inspect its *own* NSWindow title without Screen
// Recording authorization. WindowServer metadata verifies the exact
// NSWindow.windowNumber belongs to this process and is a normal window,
// without needing the privacy-protected kCGWindowName property.
// The nonce/PID/verified result is sent only through its own child stdout
// pipe. The parent validates it against spawn.pid and never logs it.
private func ownWindowReady(_ window: NSWindow, token: String) -> Bool {
  guard window.title == fixtureTitle(token),
        window.windowNumber > 0,
        window.isVisible,
        window.level == .normal,
        !window.isKeyWindow,
        !NSApplication.shared.isActive else { return false }
  let ownWindowId = CGWindowID(window.windowNumber)
  guard let rows = CGWindowListCopyWindowInfo(
    [.optionIncludingWindow, .excludeDesktopElements],
    ownWindowId) as? [[String: Any]] else { return false }
  let verifiedRows = rows.filter { row in
    let windowID = (row[kCGWindowNumber as String] as? NSNumber)?.uint32Value
    let owner = (row[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value
    let layer = (row[kCGWindowLayer as String] as? NSNumber)?.intValue
    return windowID == ownWindowId && owner == getpid() && layer == 0
  }
  return verifiedRows.count == 1
}
private func ownedNormalWindowPresent(pid: Int32) -> Bool {
  guard pid > 1,
        let rows = CGWindowListCopyWindowInfo(
          [.optionAll, .excludeDesktopElements],
          kCGNullWindowID) as? [[String: Any]] else { return false }
  return rows.contains { row in
    let owner = (row[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value
    let layer = (row[kCGWindowLayer as String] as? NSNumber)?.intValue
    return owner == pid && layer == 0
  }
}

final class ProofDelegate: NSObject, NSApplicationDelegate {
  private var proofWindow: NSWindow?
  private let title: String
  private let token: String
  init(token: String) {
    self.token = token
    self.title = fixtureTitle(token)
    super.init()
  }
  private func publishReady(window: NSWindow, attempt: Int = 0) {
    let ready = ownWindowReady(window, token: token)
    if !ready && attempt < 15 {
      DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(100)) {
        self.publishReady(window: window, attempt: attempt + 1)
      }
      return
    }
    // Not a public log: the observer owns this exact child stdout pipe.
    print("IOANT_FIXTURE_READY_V1 \(token) \(getpid()) \(ready ? "1" : "0")")
    fflush(stdout)
  }
  func applicationDidFinishLaunching(_ notification: Notification) {
    let window = NSWindow(
      contentRect: NSRect(x: 300, y: 250, width: 440, height: 180),
      styleMask: [.titled, .closable],
      backing: .buffered,
      defer: false)
    window.title = self.title
    window.isReleasedWhenClosed = false
    let field = NSTextField(frame: NSRect(x: 25, y: 65, width: 380, height: 30))
    field.stringValue = "IOANT-FIXTURE-INITIAL"
    field.identifier = NSUserInterfaceItemIdentifier("ioant-cua-only-editable")
    field.setAccessibilityLabel("IOANT CUA Fixture Editable")
    window.contentView?.addSubview(field)
    // Order behind existing windows. Never activate or take foreground focus.
    window.orderBack(nil)
    proofWindow = window
    publishReady(window: window)
    DispatchQueue.main.asyncAfter(deadline: .now() + .seconds(120)) {
      NSApplication.shared.terminate(nil)
    }
  }
}

let args = Array(CommandLine.arguments.dropFirst())
if args == ["--state"] {
  let app = NSWorkspace.shared.frontmostApplication
  let name = app?.bundleIdentifier ?? "unknown"
  let mouse = NSEvent.mouseLocation
  print("{\"frontmost\":\"\(name.replacingOccurrences(of: "\"", with: ""))\",\"mouseX\":\(mouse.x),\"mouseY\":\(mouse.y)}")
} else if args.count == 3 && args[0] == "--prove-window" {
  let pid = Int32(args[1]) ?? 0
  let evidence = windowOwnershipEvidence(pid: pid, token: args[2])
  print("{\"verified\":\(evidence.verified ? "true" : "false")}")
  if !evidence.verified { exit(1) }
} else if args.count == 2 && args[0] == "--prove-owned-window" {
  let pid = Int32(args[1]) ?? 0
  let verified = ownedNormalWindowPresent(pid: pid)
  print("{\"verified\":\(verified ? "true" : "false")}")
  if !verified { exit(1) }
} else if args.count == 3 && args[0] == "--diagnose-window" {
  let pid = Int32(args[1]) ?? 0
  let evidence = windowOwnershipEvidence(pid: pid, token: args[2])
  print(evidence.safeJSON())
} else if args.count == 2 && args[0] == "--run" && validToken(args[1]) {
  let app = NSApplication.shared
  let delegate = ProofDelegate(token: args[1])
  app.delegate = delegate
  app.setActivationPolicy(.accessory)
  app.run()
} else {
  exit(2)
}
