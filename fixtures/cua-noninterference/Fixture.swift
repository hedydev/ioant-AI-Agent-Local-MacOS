// Disposable native AppKit fixture for strict noninterference CUA testing.
// Each run has a fresh 96-bit lowercase hex token in its window title.
// --prove-window independently checks WindowServer's exact title -> PID
// relationship; it never prints PIDs, titles, bounds or other window data.
import AppKit
import CoreGraphics

private let prefix = "IOANT CUA Noninterference Fixture"

private func validToken(_ token: String) -> Bool {
  token.utf8.count == 24 &&
    token.utf8.allSatisfy { ($0 >= 48 && $0 <= 57) || ($0 >= 97 && $0 <= 102) }
}
private func fixtureTitle(_ token: String) -> String {
  "\(prefix) [\(token)]"
}
private func windowOwnershipProved(pid: Int32, token: String) -> Bool {
  guard pid > 1, validToken(token) else { return false }
  // Only compare the known synthetic title. Never emit any other
  // application's title, ownership or content.
  guard let rows = CGWindowListCopyWindowInfo(
    [.optionAll, .excludeDesktopElements],
    kCGNullWindowID) as? [[String: Any]] else { return false }
  let hits = rows.filter {
    ($0[kCGWindowName as String] as? String) == fixtureTitle(token)
  }
  guard hits.count == 1, let row = hits.first else { return false }
  guard let owner = row[kCGWindowOwnerPID as String] as? NSNumber,
        let layer = row[kCGWindowLayer as String] as? NSNumber else {
    return false
  }
  return owner.int32Value == pid && layer.intValue == 0
}

final class ProofDelegate: NSObject, NSApplicationDelegate {
  private var proofWindow: NSWindow?
  private let title: String
  init(title: String) { self.title = title; super.init() }
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
  let verified = windowOwnershipProved(pid: pid, token: args[2])
  print("{\"verified\":\(verified ? "true" : "false")}")
  if !verified { exit(1) }
} else if args.count == 2 && args[0] == "--run" && validToken(args[1]) {
  let app = NSApplication.shared
  let delegate = ProofDelegate(title: fixtureTitle(args[1]))
  app.delegate = delegate
  app.setActivationPolicy(.accessory)
  app.run()
} else {
  exit(2)
}
