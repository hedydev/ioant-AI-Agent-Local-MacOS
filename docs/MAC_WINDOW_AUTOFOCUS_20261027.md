# 2026-10-27 OpenClaw window auto-focus repair

Observed on Mac after mac-openclaw-window-20261027-001: ui_permission_or_focus_failure; the read-only diagnostic returned SYSTEM_EVENTS=accessible, FRONTMOST=other_or_unavailable and FOCUSED_INPUT=unavailable. This establishes that the app was not foreground at observation time, not that Accessibility permissions are fully sufficient.

Prior `mac-window-text` demanded that the registered app already be foreground. That is inconvenient for a browser-driven ChatGPT Worker, which normally leaves ChatGPT/Chrome foreground.

Updated action (same exact protocol, task fields and existing local operator grant) verifies the existing app process by approved process name and bundle ID, verifies a window exists, activates only that approved bundle ID, waits for exact frontmost identity, and checks the focused element. If it is not an editable text area or field, it searches the activated front window accessibility tree, and selects an input only if exactly ONE AXTextArea/AXTextField is found. It reconfirms target app foreground and bundle ID immediately before keystrokes. Ambiguous or inaccessible editors stop without typing.

Changes are bounded to this one GUI action. It neither adds arbitrary app access nor changes terminal grants. It explicitly changes frontmost application focus to the approved OpenClaw app. Activation is not message delivery, and a successful key event is not guaranteed to be read by the target UI. `submit:false` is mandatory in first real-world smoke; if any error, do NOT retry automatically, because partial keystrokes cannot be ruled out.

AppleScript returns sanitized diagnostic reason categories (e.g. target_input_unfocused_or_ambiguous) rather than raw UI text or error messages. It does not inspect or disclose message content.

Validation: tests require exact identity before activation and before typing, unique input selection, absence of unsolicited submit, bounded result codes, and no shell/clipboard/external-app actions. The normal `project-update-verify` full test gate must pass before Runtime changes. Existing Agent models, OpenClaw Gateway and Worker LaunchAgent plist are unchanged.
