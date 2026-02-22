// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "AppFinanceiro",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "AppFinanceiro",
            path: "AppFinanceiro",
            swiftSettings: [
                .unsafeFlags(["-parse-as-library"])
            ]
        )
    ]
)
