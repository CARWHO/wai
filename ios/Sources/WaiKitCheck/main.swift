import Foundation
import WaiKit

checkClose("parseISO plain", parseISO("2026-09-29T10:00:00+00:00"), 1_790_676_000_000, tol: 1e-12)
checkClose("parseISO 6 fractional digits", parseISO("2026-09-29T10:00:00.123456+00:00"), 1_790_676_000_123, tol: 1e-12)
finish()
