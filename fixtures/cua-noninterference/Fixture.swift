// Dedicated disposable Mac native GUI fixture. No browser or AppleScript.
// Launch ONLY in background by a later explicitly scoped proof command.
import AppKit

final class ProofDelegate: NSObject, NSApplicationDelegate {
  private var proofWindow: NSWindow?
  func applicationDidFinishLaunching(_ notification: Notification) {
    let window = NSWindow(
      contentRect: NSRect(x: 300, y: 250, width: 440, height: 180),
      styleMask: [.titled, .closable],
      backing: .buffered,
      defer: false)
    window.title = "IOANT CUA Noninterference Fixture"
    window.isReleasedWhenClosed = false
    let field = NSTextField(frame: NSRect(x: 25, y: 65, width: 380, height: 30))
    field.stringValue = "IOANT-FIXTURE-INITIAL"
    field.identifier = NSUserInterfaceItemIdentifier("ioant-cua-only-editable")
    field.setAccessibilityLabel("IOANT CUA Fixture Editable")
    window.contentView?.addSubview(field)
    // Showing behind existing windows without activating. Never call activate.
    window.orderBack(nil)
    proofWindow = window
    // The fixture is always temporary, even if the operator loses connection.
    DispatchQueue.main.asyncAfter(deadline: .now() + .seconds(120)) {
      NSApplication.shared.terminate(nil)
    }
  }
}

if CommandLine.arguments.dropFirst().first == "--state" {
  let app = NSWorkspace.shared.frontmostApplication
  let name = app?.bundleIdentifier ?? "unknown"
  let mouse = NSEvent.mouseLocation
  print("{\"frontmost\":\"\(name.replacingOccurrences(of: "\"", with: ""))\",\"mouseX\":\(mouse.x),\"mouseY\":\(mouse.y)}")
} else {
  let app = NSApplication.shared
  let delegate = ProofDelegate()
  app.delegate = delegate
  app.setActivationPolicy(.accessory)
  app.run()
}
