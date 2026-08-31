// Regenerate on macOS: swift scripts/render_icons.swift extension/icons
import AppKit

let output = URL(fileURLWithPath: CommandLine.arguments.dropFirst().first ?? "extension/icons")
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)

for size in [16, 32, 48, 128] {
    let side = CGFloat(size)
    let emoji = NSImage(size: NSSize(width: side, height: side))
    emoji.lockFocus()
    let font = NSFont(name: "Apple Color Emoji", size: side * 0.80)!
    let text = NSAttributedString(string: "🤖", attributes: [.font: font])
    let bounds = text.size()
    text.draw(at: NSPoint(x: (side - bounds.width) / 2, y: (side - bounds.height) / 2))
    emoji.unlockFocus()
    for variant in ["robot", "idle", "active"] {
        let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
            bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
            colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
        emoji.draw(in: NSRect(x: 0, y: 0, width: side, height: side), from: .zero,
            operation: .sourceOver, fraction: variant == "idle" ? 0.38 : 1)
        if variant == "active" {
            let diameter = side * 0.31
            let circle = NSBezierPath(ovalIn: NSRect(x: side * 0.65, y: side * 0.015, width: diameter, height: diameter))
            NSColor.white.setStroke()
            circle.lineWidth = max(1, side * 0.055)
            circle.stroke()
            NSColor(srgbRed: 0.12, green: 0.70, blue: 0.30, alpha: 1).setFill()
            circle.fill()
        }
        NSGraphicsContext.restoreGraphicsState()
        try bitmap.representation(using: .png, properties: [:])!.write(to: output.appendingPathComponent("\(variant)-\(size).png"))
    }
}
print("Rendered robot, idle (38% opacity), and active icons at 16, 32, 48, and 128 pixels")
