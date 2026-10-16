import ExpoModulesCore
import UIKit

/// Hides `UIScrollEdgeEffect` on every scroll view under this view.
///
/// react-native-screens applies `scrollEdgeEffects` only to the first
/// descendant scroll view. The pill row is a later sibling, so iOS 26 still
/// blurs its right edge. The gamma scroll-view marker is not in the pod.
final class AtmosScrollEdgeView: ExpoView {
  public override func didAddSubview(_ subview: UIView) {
    super.didAddSubview(subview)
    hideScrollEdgeEffects(in: subview)
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    hideScrollEdgeEffects(in: self)
  }

  private func hideScrollEdgeEffects(in view: UIView) {
    if #available(iOS 26.0, *) {
      if let scrollView = view as? UIScrollView {
        hide(scrollView.topEdgeEffect)
        hide(scrollView.bottomEdgeEffect)
        hide(scrollView.leftEdgeEffect)
        hide(scrollView.rightEdgeEffect)
      }
    }
    for child in view.subviews {
      hideScrollEdgeEffects(in: child)
    }
  }

  @available(iOS 26.0, *)
  private func hide(_ effect: UIScrollEdgeEffect) {
    if !effect.isHidden {
      effect.isHidden = true
    }
  }
}

public final class AtmosScrollEdgeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AtmosScrollEdge")

    View(AtmosScrollEdgeView.self) {}
  }
}
