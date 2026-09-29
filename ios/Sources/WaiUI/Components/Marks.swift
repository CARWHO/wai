import SwiftUI

// Wai logo, copied from the landing page (wai-web/src/components/Koru.tsx).
// Pounamu koru: a log-spiral band that unfurls from the ring.
// The default viewBox crops to the disc. Pass the full 0 0 1000 1000 box to add space on the left.
public struct Koru: View {
  var viewBox: CGRect
  public init(viewBox: CGRect = CGRect(x: 265, y: 145, width: 710, height: 710)) { self.viewBox = viewBox }
  public var body: some View { KoruShape(viewBox: viewBox).accessibilityHidden(true) }
}

struct KoruShape: Shape {
  var viewBox: CGRect
  private static let spiral = svgPath("M366 514L377 472L393 437L413 406L437 379L464 358L493 341L522 330L552 323L582 322L610 325L637 332L661 342L683 356L702 372L717 391L728 410L737 431L741 451L743 472L741 492L736 510L729 527L720 542L709 554L696 565L683 573L669 579L655 582L641 583L628 582L615 579L604 574L593 568L585 561L578 552L572 543L568 534L566 525L565 516L566 507L567 498L570 491L574 484L579 478L585 473L590 470L596 467L602 465L608 465L614 465L620 466L624 468L629 470L633 473L636 477L638 480L640 484L641 488L642 491L642 495L641 498L640 501L639 504L637 507L635 509L633 510L631 511L629 512L626 513L623 513A23 23 0 0 0 617 558L617 558L625 560L635 560L644 558L654 555L663 550L672 544L680 536L686 527L691 516L695 505L696 493L696 481L694 468L690 456L683 444L675 433L665 424L653 415L640 409L626 405L610 402L594 403L579 406L563 411L548 419L534 430L522 443L511 458L503 475L498 494L495 513L496 534L499 554L507 574L517 594L531 611L548 627L567 640L589 651L613 658L639 661L665 660L691 655L717 645L742 632L765 614L785 592L802 567L815 538L824 507L828 474L827 440L820 406L808 373L790 341L766 311L738 285L705 263L668 246L627 234L585 230L541 232L496 241L453 258L412 282L374 312L340 349L312 393L290 441L277 490Z")
  // Ring and spiral overlap; a union keeps the overlap filled under the nonzero rule
  private static let mark = Path(ellipseIn: CGRect(x: 620 - 302, y: 500 - 302, width: 604, height: 604))
    .strokedPath(StrokeStyle(lineWidth: 107)).union(spiral)

  func path(in rect: CGRect) -> Path { Self.mark.applying(fit(viewBox, in: rect)) }
}

// Koru + "wai", as in the landing page header
public struct Wordmark: View {
  public init() {}
  public var body: some View {
    HStack(spacing: 8) {
      Koru().frame(width: 24, height: 24)
      Text("wai").font(WaiFont.logo(28)).tracking(28 * Theme.Tracking.tight)
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("Wai")
  }
}

// Two sparkles: marks AI features
public struct Sparkles: View {
  var size: CGFloat
  public init(size: CGFloat = 16) { self.size = size }
  public var body: some View {
    SparklesShape().frame(width: size, height: size).accessibilityLabel("AI")
  }
}

struct SparklesShape: Shape {
  private static let p = svgPath("M10 4l1.9 5.6L17.5 11.5l-5.6 1.9L10 19l-1.9-5.6L2.5 11.5l5.6-1.9zM19 2l.9 2.3L22 5.2l-2.1.9L19 8.5l-.9-2.4L16 5.2l2.1-.9z")
  func path(in rect: CGRect) -> Path { Self.p.applying(fit(CGRect(x: 0, y: 0, width: 24, height: 24), in: rect)) }
}

/// SVG `preserveAspectRatio="xMidYMid meet"`: scale the viewBox into rect and centre it.
func fit(_ box: CGRect, in rect: CGRect) -> CGAffineTransform {
  let s = min(rect.width / box.width, rect.height / box.height)
  let dx = rect.minX + (rect.width - box.width * s) / 2 - box.minX * s
  let dy = rect.minY + (rect.height - box.height * s) / 2 - box.minY * s
  return CGAffineTransform(a: s, b: 0, c: 0, d: s, tx: dx, ty: dy)
}

/// Minimal SVG path data parser: M, L, A (circular arcs only), Z, absolute and relative.
func svgPath(_ d: String) -> Path {
  let re = try! NSRegularExpression(pattern: "[MmLlAaZz]|-?(?:\\d+\\.?\\d*|\\.\\d+)")
  let tokens = re.matches(in: d, range: NSRange(d.startIndex..., in: d)).map { String(d[Range($0.range, in: d)!]) }
  var p = Path(), i = 0, cmd = "M", cur = CGPoint.zero, start = CGPoint.zero
  func num() -> CGFloat { defer { i += 1 }; return CGFloat(Double(tokens[i]) ?? 0) }
  while i < tokens.count {
    if tokens[i].first!.isLetter { cmd = tokens[i]; i += 1 }
    let rel = cmd == cmd.lowercased()
    func pt(_ x: CGFloat, _ y: CGFloat) -> CGPoint { rel ? CGPoint(x: cur.x + x, y: cur.y + y) : CGPoint(x: x, y: y) }
    switch cmd.uppercased() {
    case "M":
      cur = pt(num(), num()); start = cur; p.move(to: cur)
      cmd = rel ? "l" : "L" // further pairs are line-tos
    case "L":
      cur = pt(num(), num()); p.addLine(to: cur)
    case "A":
      let r = num(); _ = num(); _ = num() // ry and rotation: only circles are used
      let large = num() != 0, sweep = num() != 0
      let end = pt(num(), num())
      addArc(&p, from: cur, to: end, r: r, large: large, sweep: sweep)
      cur = end
    default: // Z
      p.closeSubpath(); cur = start
    }
  }
  return p
}

// SVG arc endpoint parameterisation to centre parameterisation (SVG 1.1 F.6.5), for rx == ry, no rotation
private func addArc(_ p: inout Path, from a: CGPoint, to b: CGPoint, r: CGFloat, large: Bool, sweep: Bool) {
  let mx = (a.x - b.x) / 2, my = (a.y - b.y) / 2
  let r = max(r, (mx * mx + my * my).squareRoot())
  let k = (large != sweep ? 1 : -1) * max(0, (r * r - mx * mx - my * my) / (mx * mx + my * my)).squareRoot()
  let cx = k * my + (a.x + b.x) / 2, cy = -k * mx + (a.y + b.y) / 2
  let t1 = atan2(a.y - cy, a.x - cx)
  var dt = atan2(b.y - cy, b.x - cx) - t1
  if sweep, dt < 0 { dt += 2 * .pi }
  if !sweep, dt > 0 { dt -= 2 * .pi }
  // y points down, so a positive sweep is an increasing angle (clockwise: false in CoreGraphics terms)
  p.addArc(center: CGPoint(x: cx, y: cy), radius: r, startAngle: .radians(t1), endAngle: .radians(t1 + dt), clockwise: dt < 0)
}
