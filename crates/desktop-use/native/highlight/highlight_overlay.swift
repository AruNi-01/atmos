import AppKit
import CoreGraphics
import Foundation
import QuartzCore

/// Atmos Desktop Use — click-through **blinking** border that tracks target window z-order.
///
/// Coordinate space: top-left origin, logical points (engine list_windows bounds).
///
/// Z-order: normal window level, ordered **just above** the target CGWindow when
/// `--above-window-id` is set so covering windows also cover the border. Never uses
/// statusBar / screenSaver levels (those would paint over every app and every display).
///
/// Usage:
///   atmos-desktop-highlight show --x N --y N --width N --height N [--above-window-id ID] ...
///   atmos-desktop-highlight desktop ...
///   atmos-desktop-highlight caption --x N --y N --label TEXT ...

struct Args {
    var mode: String = "show"
    var x: Double = 0
    var y: Double = 0
    var width: Double = 0
    var height: Double = 0
    var inset: Double = 3
    var thickness: CGFloat = 3
    var colorHex: String = "3B82F6"
    var label: String = ""
    var cursorX: Double? = nil
    var cursorY: Double? = nil
    var idleMs: Double = 8000
    var blink: Bool = true
    /// Full inhale+exhale cycle in ms (slower = calmer breath).
    var blinkPeriodMs: Double = 2200
    /// CGWindowID of the app window we should sit just above (same stacking as that app).
    var aboveWindowId: Int? = nil
    /// Corner radius matching typical macOS app chrome (~10–12pt).
    var cornerRadius: CGFloat = 10
}

func parseArgs() -> Args {
    var a = Args()
    var it = CommandLine.arguments.dropFirst().makeIterator()
    if let first = it.next() {
        a.mode = first
    }
    while let key = it.next() {
        switch key {
        case "--x": a.x = Double(it.next() ?? "0") ?? 0
        case "--y": a.y = Double(it.next() ?? "0") ?? 0
        case "--width", "--w": a.width = Double(it.next() ?? "0") ?? 0
        case "--height", "--h": a.height = Double(it.next() ?? "0") ?? 0
        case "--inset": a.inset = Double(it.next() ?? "3") ?? 3
        case "--thickness": a.thickness = CGFloat(Double(it.next() ?? "3") ?? 3)
        case "--color": a.colorHex = it.next() ?? a.colorHex
        case "--label": a.label = it.next() ?? ""
        case "--cursor-x": a.cursorX = Double(it.next() ?? "0")
        case "--cursor-y": a.cursorY = Double(it.next() ?? "0")
        case "--idle-ms": a.idleMs = Double(it.next() ?? "8000") ?? 8000
        case "--blink": a.blink = true
        case "--no-blink": a.blink = false
        case "--blink-period-ms": a.blinkPeriodMs = Double(it.next() ?? "2200") ?? 2200
        case "--above-window-id": a.aboveWindowId = Int(it.next() ?? "")
        case "--corner-radius": a.cornerRadius = CGFloat(Double(it.next() ?? "10") ?? 10)
        default: break
        }
    }
    return a
}

func color(from hex: String) -> NSColor {
    var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    if s.hasPrefix("#") { s.removeFirst() }
    var value: UInt64 = 0
    Scanner(string: s).scanHexInt64(&value)
    let r = CGFloat((value >> 16) & 0xFF) / 255.0
    let g = CGFloat((value >> 8) & 0xFF) / 255.0
    let b = CGFloat(value & 0xFF) / 255.0
    return NSColor(calibratedRed: r, green: g, blue: b, alpha: 1.0)
}

/// Global desktop top-left (y down, origin = primary top-left) → Cocoa global frame.
/// Handles multi-monitor by using the primary screen's maxY as the global top reference
/// (same convention as CGWindow bounds / engine list_windows).
func cocoaFrame(x: Double, y: Double, width: Double, height: Double) -> NSRect {
    // Primary display top edge in Cocoa global coordinates.
    let primaryTop: CGFloat
    if let primary = NSScreen.screens.first(where: { $0.frame.origin == .zero })
        ?? NSScreen.main
        ?? NSScreen.screens.first
    {
        primaryTop = primary.frame.maxY
    } else {
        primaryTop = CGFloat(y + height)
    }
    let cocoaY = primaryTop - CGFloat(y) - CGFloat(height)
    return NSRect(x: CGFloat(x), y: cocoaY, width: CGFloat(width), height: CGFloat(height))
}

func desktopBounds(inset: Double) -> (Double, Double, Double, Double) {
    // Highlight only the display that contains the mouse (or main), not a fake
    // spanning rect across all monitors that would look like "covering other displays".
    // Never index `NSScreen.screens[0]` — empty array traps. Prefer main, then first.
    guard let screen = NSScreen.main ?? NSScreen.screens.first else {
        return (0, 0, 0, 0)
    }
    let f = screen.frame
    // Convert Cocoa frame (bottom-left global) → engine top-left relative to primary top.
    let primaryTop: CGFloat
    if let primary = NSScreen.screens.first(where: { $0.frame.origin == .zero })
        ?? NSScreen.main
        ?? NSScreen.screens.first
    {
        primaryTop = primary.frame.maxY
    } else {
        primaryTop = f.maxY
    }
    let topLeftY = Double(primaryTop - f.maxY)
    let topLeftX = Double(f.minX)
    let w = Double(f.width) - inset * 2
    let h = Double(f.height) - inset * 2
    return (topLeftX + inset, topLeftY + inset, max(1, w), max(1, h))
}

final class BorderView: NSView {
    var borderColor: NSColor = .systemBlue
    var thickness: CGFloat = 3
    var cornerRadius: CGFloat = 10

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        ctx.clear(bounds)
        ctx.setStrokeColor(borderColor.cgColor)
        ctx.setLineWidth(thickness)
        let inset = thickness / 2
        let rect = bounds.insetBy(dx: inset, dy: inset)
        // Match typical macOS app chrome (small continuous corner radius).
        let r = min(cornerRadius, min(rect.width, rect.height) / 2)
        let path = CGPath(roundedRect: rect, cornerWidth: r, cornerHeight: r, transform: nil)
        ctx.addPath(path)
        ctx.strokePath()
    }

    override var isOpaque: Bool { false }
}

func makeOverlayWindow(frame: NSRect) -> NSWindow {
    let win = NSWindow(
        contentRect: frame,
        styleMask: [.borderless],
        backing: .buffered,
        defer: false
    )
    win.isOpaque = false
    win.backgroundColor = .clear
    win.hasShadow = false
    // Stay in the normal app stack — never floating / status bar chrome.
    win.level = .normal
    // Do NOT join all spaces as a stationary HUD; follow active Space like a normal window.
    win.collectionBehavior = [.managed, .fullScreenAuxiliary]
    win.ignoresMouseEvents = true
    win.isReleasedWhenClosed = false
    win.hidesOnDeactivate = false
    win.alphaValue = 1.0
    return win
}

func cgNumber(_ value: Any?) -> Int? {
    if let i = value as? Int { return i }
    if let n = value as? NSNumber { return n.intValue }
    return nil
}

func cgFloatVal(_ value: Any?) -> CGFloat? {
    if let d = value as? Double { return CGFloat(d) }
    if let f = value as? CGFloat { return f }
    if let i = value as? Int { return CGFloat(i) }
    if let n = value as? NSNumber { return CGFloat(n.doubleValue) }
    return nil
}

func cgRect(from bounds: [String: Any]?) -> CGRect? {
    guard let bounds = bounds,
          let x = cgFloatVal(bounds["X"]),
          let y = cgFloatVal(bounds["Y"]),
          let w = cgFloatVal(bounds["Width"]),
          let h = cgFloatVal(bounds["Height"])
    else { return nil }
    return CGRect(x: x, y: y, width: w, height: h)
}

/// On-screen window list (front → back).
func onScreenWindows() -> [[String: Any]] {
    (CGWindowListCopyWindowInfo(
        [.optionOnScreenOnly, .excludeDesktopElements],
        kCGNullWindowID
    ) as? [[String: Any]]) ?? []
}

/// True when another on-screen window intersects the target (user is working on top).
/// When the target is covered we hide chrome so border/capsule never paint over other apps.
func targetIsCovered(windowId: Int) -> Bool {
    let list = onScreenWindows()
    guard let target = list.first(where: { cgNumber($0[kCGWindowNumber as String]) == windowId }),
          let targetRect = cgRect(from: target[kCGWindowBounds as String] as? [String: Any])
    else {
        // Unknown / off-screen target — hide rather than paint over the user's work.
        return true
    }
    for info in list {
        let num = cgNumber(info[kCGWindowNumber as String])
        if num == windowId { break }
        guard let r = cgRect(from: info[kCGWindowBounds as String] as? [String: Any]) else { continue }
        // Ignore tiny system chrome / menubar-ish strips.
        if r.height < 24 || r.width < 24 { continue }
        // Skip fully transparent / zero-alpha if reported.
        if let alpha = cgFloatVal(info[kCGWindowAlpha as String]), alpha < 0.05 { continue }
        if r.intersects(targetRect) {
            return true
        }
    }
    return false
}

/// Place our window just above the target CGWindow so covering windows also cover us.
func orderWithTarget(_ win: NSWindow, aboveWindowId: Int?) {
    guard let wid = aboveWindowId, wid > 0 else {
        // Desktop / no target: stay normal-level without force-topping over the user's work.
        win.orderFront(nil)
        return
    }
    // If the user has another app covering the target, hide chrome entirely so we
    // never flash a border/capsule on top of their work.
    if targetIsCovered(windowId: wid) {
        win.orderOut(nil)
        return
    }
    // CGWindowID matches Cocoa windowNumber for standard windows on modern macOS.
    win.order(.above, relativeTo: wid)
}

func makeCaptionWindow(
    label: String,
    accent: NSColor,
    anchorX: Double,
    anchorY: Double,
    aboveWindowId: Int?
) -> NSWindow {
    let font = NSFont.systemFont(ofSize: 12, weight: .semibold)
    let text = label as NSString
    let textSize = text.size(withAttributes: [.font: font])
    let padX: CGFloat = 12
    let padY: CGFloat = 7
    let w = max(48, textSize.width + padX * 2)
    let h = max(24, textSize.height + padY * 2)
    let frame = cocoaFrame(x: anchorX + 14, y: anchorY + 18, width: Double(w), height: Double(h))

    let win = makeOverlayWindow(frame: frame)
    win.hasShadow = true

    let container = NSView(frame: NSRect(origin: .zero, size: frame.size))
    container.wantsLayer = true
    container.layer?.backgroundColor = NSColor(calibratedWhite: 0.08, alpha: 0.92).cgColor
    container.layer?.cornerRadius = h / 2
    container.layer?.borderWidth = 1
    container.layer?.borderColor = accent.withAlphaComponent(0.85).cgColor

    let field = NSTextField(labelWithString: label)
    field.font = font
    field.textColor = .white
    field.alignment = .center
    field.backgroundColor = .clear
    field.isBezeled = false
    field.isEditable = false
    field.isSelectable = false
    field.drawsBackground = false
    field.frame = NSRect(x: 0, y: (h - textSize.height) / 2 - 1, width: w, height: textSize.height + 2)
    container.addSubview(field)

    let bar = NSView(frame: NSRect(x: 6, y: (h - 10) / 2, width: 3, height: 10))
    bar.wantsLayer = true
    bar.layer?.backgroundColor = accent.cgColor
    bar.layer?.cornerRadius = 1.5
    container.addSubview(bar)

    win.contentView = container
    orderWithTarget(win, aboveWindowId: aboveWindowId)
    return win
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    var windows: [NSWindow] = []
    var idleTimer: Timer?
    var reorderTimer: Timer?
    /// Breath phase: true = fading toward peak (inhale), false = toward trough (exhale).
    var breathInhale = false
    var breathActive = false
    let args: Args

    init(args: Args) {
        self.args = args
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        let accent = color(from: args.colorHex)
        let label = args.label.trimmingCharacters(in: .whitespacesAndNewlines)

        if args.mode == "caption" {
            guard !label.isEmpty else {
                fputs("highlight_overlay: caption requires --label\n", stderr)
                NSApp.terminate(nil)
                return
            }
            // Caption mode is always anchored at the provided x/y (agent pointer).
            let win = makeCaptionWindow(
                label: label,
                accent: accent,
                anchorX: args.x,
                anchorY: args.y,
                aboveWindowId: args.aboveWindowId
            )
            windows.append(win)
        } else {
            let (x, y, w, h): (Double, Double, Double, Double)
            if args.mode == "desktop" {
                (x, y, w, h) = desktopBounds(inset: args.inset)
            } else {
                (x, y, w, h) = (args.x, args.y, args.width, args.height)
            }
            guard w > 0, h > 0 else {
                fputs("highlight_overlay: invalid bounds\n", stderr)
                NSApp.terminate(nil)
                return
            }

            let frame = cocoaFrame(x: x, y: y, width: w, height: h)
            let win = makeOverlayWindow(frame: frame)
            let view = BorderView(frame: NSRect(origin: .zero, size: frame.size))
            view.borderColor = accent
            view.thickness = args.thickness
            view.cornerRadius = args.cornerRadius
            view.wantsLayer = true
            view.layer?.backgroundColor = NSColor.clear.cgColor
            win.contentView = view
            orderWithTarget(win, aboveWindowId: args.aboveWindowId)
            windows.append(win)

            // Status capsule ONLY under the agent pointer (cursor-x/y). Never float a
            // free-standing pill near the window chrome when there is no cursor.
            if !label.isEmpty, let cx = args.cursorX, let cy = args.cursorY {
                let cap = makeCaptionWindow(
                    label: label,
                    accent: accent,
                    anchorX: cx,
                    anchorY: cy,
                    aboveWindowId: args.aboveWindowId
                )
                windows.append(cap)
            }

            if args.blink {
                startBreathing(periodMs: args.blinkPeriodMs)
            }

            // Keep sitting just above the target if the window stack reshuffles;
            // hide entirely while the user covers the target with another app.
            if let wid = args.aboveWindowId, wid > 0 {
                reorderTimer = Timer.scheduledTimer(withTimeInterval: 0.35, repeats: true) { [weak self] _ in
                    guard let self = self else { return }
                    if targetIsCovered(windowId: wid) {
                        for w in self.windows { w.orderOut(nil) }
                        return
                    }
                    for w in self.windows {
                        w.order(.above, relativeTo: wid)
                    }
                }
            }
        }

        if args.idleMs > 0 {
            idleTimer = Timer.scheduledTimer(withTimeInterval: args.idleMs / 1000.0, repeats: false) { [weak self] _ in
                self?.shutdown()
            }
        }

        signal(SIGTERM) { _ in
            DispatchQueue.main.async { NSApp.terminate(nil) }
        }
        signal(SIGINT) { _ in
            DispatchQueue.main.async { NSApp.terminate(nil) }
        }
    }

    /// Soft continuous breath: ease-in-out between two alphas (no hard on/off flash).
    func startBreathing(periodMs: Double) {
        guard let border = windows.first else { return }
        breathActive = true
        // Peak stays readable; trough still visible — avoids “gone / on” strobe.
        let peak: CGFloat = 0.92
        let trough: CGFloat = 0.38
        let half = max(0.7, periodMs / 2000.0) // one half-cycle (inhale or exhale)
        border.alphaValue = peak
        breathInhale = false
        stepBreath(border: border, peak: peak, trough: trough, halfDuration: half)
    }

    func stepBreath(border: NSWindow, peak: CGFloat, trough: CGFloat, halfDuration: TimeInterval) {
        guard breathActive else { return }
        let target = breathInhale ? peak : trough
        breathInhale.toggle()
        NSAnimationContext.runAnimationGroup({ ctx in
            ctx.duration = halfDuration
            ctx.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
            ctx.allowsImplicitAnimation = true
            border.animator().alphaValue = target
        }, completionHandler: { [weak self] in
            self?.stepBreath(
                border: border,
                peak: peak,
                trough: trough,
                halfDuration: halfDuration
            )
        })
    }

    func shutdown() {
        breathActive = false
        idleTimer?.invalidate()
        reorderTimer?.invalidate()
        for w in windows {
            w.orderOut(nil)
        }
        NSApp.terminate(nil)
    }
}

let args = parseArgs()
if args.mode == "help" || args.mode == "--help" || args.mode == "-h" {
    print("""
    atmos-desktop-highlight show --x N --y N --width N --height N [--above-window-id ID] [--label TEXT] [--idle-ms N]
    atmos-desktop-highlight desktop [--label TEXT] [--idle-ms N]
    atmos-desktop-highlight caption --x N --y N --label TEXT [--above-window-id ID]
    """)
    exit(0)
}

let app = NSApplication.shared
let delegate = AppDelegate(args: args)
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
