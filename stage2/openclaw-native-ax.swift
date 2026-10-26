// OpenClaw native Accessibility (AX) focused editor locator.
// All stdout values are fixed diagnostic codes: never print UI content.
// Probe is strictly read-only; focus is allowed only on a caller-bound bundle ID.
import Foundation
import AppKit
import ApplicationServices

func finish(_ code: String, _ exitCode: Int32 = 1) -> Never {
    print(code)
    exit(exitCode)
}
func attribute(_ element: AXUIElement, _ key: CFString) -> CFTypeRef? {
    AXUIElementSetMessagingTimeout(element, 0.4)
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, key, &value) == .success else {
        return nil
    }
    return value
}
func role(_ element: AXUIElement) -> String {
    attribute(element, kAXRoleAttribute as CFString) as? String ?? "unknown"
}
func children(_ element: AXUIElement) -> [AXUIElement] {
    attribute(element, kAXChildrenAttribute as CFString) as? [AXUIElement] ?? []
}
func focusedRole(_ app: AXUIElement) -> String {
    guard let focus = attribute(app, kAXFocusedUIElementAttribute as CFString) else {
        return "unavailable"
    }
    guard CFGetTypeID(focus) == AXUIElementGetTypeID() else {
        return "unavailable"
    }
    return role(focus as! AXUIElement)
}
guard CommandLine.arguments.count == 3 else { finish("AX_BAD_ARGUMENTS") }
let mode = CommandLine.arguments[1]
let bundle = CommandLine.arguments[2]
guard mode == "probe" || mode == "focus" else { finish("AX_BAD_MODE") }
guard bundle == "ai.openclaw.mac" else { finish("AX_APP_NOT_ALLOWLISTED") }
guard AXIsProcessTrusted() else { finish("AX_NOT_TRUSTED") }
let apps = NSRunningApplication.runningApplications(withBundleIdentifier: bundle)
guard apps.count == 1 else { finish("AX_APP_NOT_UNIQUE") }
let running = apps[0]
guard !running.isTerminated else { finish("AX_APP_NOT_RUNNING") }
let app = AXUIElementCreateApplication(running.processIdentifier)
AXUIElementSetMessagingTimeout(app, 0.5)
guard let windows = attribute(app, kAXWindowsAttribute as CFString) as? [AXUIElement],
      windows.count == 1 else { finish("AX_WINDOW_NOT_UNIQUE") }
// Search the app's actual window, not application MenuBar or its huge menu tree.
var nodes: [(AXUIElement, Int)] = [(windows[0], 0)]
var index = 0
var examined = 0
var candidates: [AXUIElement] = []
var truncated = false
while index < nodes.count {
    let (element, depth) = nodes[index]
    index += 1
    examined += 1
    let currentRole = role(element)
    if currentRole == "AXTextArea" || currentRole == "AXTextField" {
        candidates.append(element)
    }
    if examined >= 360 || nodes.count >= 400 {
        truncated = true
        break
    }
    if depth < 16 && currentRole != "AXMenu" && currentRole != "AXMenuBar" {
        let childNodes = children(element)
        if childNodes.count > 100 {
            truncated = true
            break
        }
        for child in childNodes {
            nodes.append((child, depth + 1))
            if nodes.count >= 400 { truncated = true; break }
        }
        if truncated { break }
    }
}
if truncated { finish("AX_TREE_BOUNDED") }
guard candidates.count == 1 else { finish(candidates.isEmpty ? "AX_EDITOR_NOT_FOUND" : "AX_EDITOR_AMBIGUOUS") }
let editor = candidates[0]
let currentRole = role(editor)
var enabledValue: CFTypeRef?
let enabledStatus = AXUIElementCopyAttributeValue(editor, kAXEnabledAttribute as CFString, &enabledValue)
if enabledStatus == .success, let enabled = enabledValue as? Bool, !enabled {
    finish("AX_EDITOR_DISABLED")
}
var focusSettable = DarwinBoolean(false)
let focusCapability = AXUIElementIsAttributeSettable(editor, kAXFocusedAttribute as CFString, &focusSettable)
let existingValue = attribute(editor, kAXValueAttribute as CFString) as? String
if mode == "probe" {
    let capability = focusCapability == .success && focusSettable.boolValue ? "yes" : "no"
    let draft = existingValue == nil ? "unknown" : (existingValue!.isEmpty ? "empty" : "present")
    print("AX_PROBE_OK role=\(currentRole) candidates=1 focusSettable=\(capability) draft=\(draft) focusedRole=\(focusedRole(app)) examined=\(examined)")
    exit(0)
}
if let content = existingValue, !content.isEmpty { finish("AX_EDITOR_NOT_EMPTY") }
guard focusCapability == .success && focusSettable.boolValue else { finish("AX_EDITOR_NOT_FOCUSABLE") }
if !running.isActive {
    guard running.activate(options: [.activateIgnoringOtherApps]) else { finish("AX_ACTIVATION_FAILED") }
}
var ready = false
for _ in 0..<22 {
    if NSWorkspace.shared.frontmostApplication?.bundleIdentifier == bundle {
        ready = true
        break
    }
    Thread.sleep(forTimeInterval: 0.12)
}
guard ready else { finish("AX_NOT_FRONTMOST") }
let focusResult = AXUIElementSetAttributeValue(editor, kAXFocusedAttribute as CFString, kCFBooleanTrue)
guard focusResult == .success else { finish("AX_FOCUS_REJECTED") }
var focused = false
for _ in 0..<8 {
    if focusedRole(app) == "AXTextArea" || focusedRole(app) == "AXTextField" {
        focused = true
        break
    }
    Thread.sleep(forTimeInterval: 0.10)
}
guard focused else { finish("AX_FOCUS_UNVERIFIED") }
guard NSWorkspace.shared.frontmostApplication?.bundleIdentifier == bundle else {
    finish("AX_FRONTMOST_CHANGED")
}
finish("AX_FOCUS_READY", 0)
