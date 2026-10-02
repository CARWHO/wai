import CoreText
import SwiftUI

// Chivo for text, Chivo Mono for labels, units and readings, Archivo (width axis) for the wordmark.
// All three are variable fonts; weight and width are set through the font variation axes.
public enum WaiFont {
  /// PostScript names of the registered fonts, empty when registration failed.
  public static let registered: [String] = register()

  public static func sans(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
    make("Chivo", size, weight, fallback: .system(size: size, weight: weight))
  }

  public static func mono(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
    make("Chivo Mono", size, weight, fallback: .system(size: size, weight: weight, design: .monospaced))
  }

  /// `font-logo font-semibold [font-stretch:125%]`
  public static func logo(_ size: CGFloat, _ weight: Font.Weight = .semibold) -> Font {
    make("Archivo", size, weight, width: 125, fallback: .system(size: size, weight: weight).width(.expanded))
  }

  private static func make(_ family: String, _ size: CGFloat, _ weight: Font.Weight, width: Double? = nil, fallback: Font) -> Font {
    guard registered.contains(where: { $0.hasPrefix(family.replacingOccurrences(of: " ", with: "")) }) else { return fallback }
    var axes: [NSNumber: Double] = [wght: numeric(weight)]
    if let width { axes[wdth] = width }
    let desc = CTFontDescriptorCreateWithAttributes([
      kCTFontFamilyNameAttribute: family,
      kCTFontVariationAttribute: axes,
    ] as CFDictionary)
    return Font(CTFontCreateWithFontDescriptor(desc, size, nil))
  }

  private static let wght = NSNumber(value: 0x7767_6874) // 'wght'
  private static let wdth = NSNumber(value: 0x7764_7468) // 'wdth'

  private static func numeric(_ w: Font.Weight) -> Double {
    switch w {
    case .ultraLight: 200
    case .thin: 100
    case .light: 300
    case .medium: 500
    case .semibold: 600
    case .bold: 700
    case .heavy: 800
    case .black: 900
    default: 400
    }
  }

  private static func register() -> [String] {
    ["Chivo", "ChivoMono", "Archivo"].flatMap { name -> [String] in
      guard let url = Bundle.module.url(forResource: name, withExtension: "ttf")
        ?? Bundle.module.url(forResource: name, withExtension: "ttf", subdirectory: "Fonts") else { return [] }
      var error: Unmanaged<CFError>?
      let ok = CTFontManagerRegisterFontsForURL(url as CFURL, .process, &error)
      // Already registered (e.g. a second call in the same process) counts as success
      let code = error.map { CFErrorGetCode($0.takeRetainedValue()) }
      guard ok || code == CTFontManagerError.alreadyRegistered.rawValue else { return [] }
      let descs = CTFontManagerCreateFontDescriptorsFromURL(url as CFURL) as? [CTFontDescriptor] ?? []
      return descs.compactMap { CTFontDescriptorCopyAttribute($0, kCTFontNameAttribute) as? String }
    }
  }
}
