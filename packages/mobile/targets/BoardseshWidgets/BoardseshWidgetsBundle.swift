import WidgetKit
import SwiftUI

@main
struct BoardseshWidgetsBundle: WidgetBundle {
    @WidgetBundleBuilder
    var body: some Widget {
        if #available(iOS 17.0, *) {
            ClimbSessionLiveActivity()
        }
    }
}
