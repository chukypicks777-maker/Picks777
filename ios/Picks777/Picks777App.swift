import SwiftUI

@main
@MainActor
struct Picks777App: App {
    @StateObject private var browser = PicksBrowser()
    @State private var selectedTab = 0

    var body: some Scene {
        WindowGroup {
            TabView(selection: $selectedTab) {
                NavigationStack {
                    ZStack {
                        PicksWebView(browser: browser)
                        if let error = browser.error {
                            VStack(spacing: 16) {
                                Image(systemName: "wifi.exclamationmark").font(.largeTitle)
                                Text(error).multilineTextAlignment(.center)
                                Button("Reintentar") { browser.reload() }
                            }.padding().frame(maxWidth: .infinity, maxHeight: .infinity)
                                .background(Color(red: 0.03, green: 0.04, blue: 0.07))
                        }
                        if browser.loading { ProgressView().padding().background(.regularMaterial).clipShape(RoundedRectangle(cornerRadius: 12)) }
                    }
                    .navigationTitle("777 Picks").navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .topBarLeading) {
                            Button { browser.back() } label: { Image(systemName: "chevron.backward") }
                                .disabled(!browser.canGoBack).accessibilityLabel("Volver")
                        }
                        ToolbarItem(placement: .topBarTrailing) {
                            Button { browser.reload() } label: { Image(systemName: "arrow.clockwise") }
                                .accessibilityLabel("Actualizar")
                        }
                    }
                }.tabItem { Label("Partidos", systemImage: "sportscourt") }.tag(0)
                ProbabilityTool().tabItem { Label("Probabilidades", systemImage: "percent") }.tag(1)
                NavigationStack {
                    List {
                        Section("Tu cuenta") {
                            Button("Eliminar mi cuenta") { browser.load(path: "/eliminar-cuenta"); selectedTab = 0 }
                            Text("El borrado requiere confirmar la cuenta titular. No elimina tu cuenta de Google.")
                                .font(.footnote).foregroundStyle(.secondary)
                        }
                        Section("Ayuda") {
                            Link("Soporte", destination: URL(string: "mailto:chukypicks777@gmail.com")!)
                            Link("Privacidad", destination: browser.origin.appendingPathComponent("privacidad.html"))
                            Text("Los pronósticos son estimaciones. No garantizan resultados ni ganancias. La app necesita conexión para consultar partidos y membresías.")
                        }
                        Section("Aplicación") { Text("777 Picks · \(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "")") }
                    }.navigationTitle("Cuenta y ayuda")
                }.tabItem { Label("Cuenta", systemImage: "person.crop.circle") }.tag(2)
            }
            .preferredColorScheme(.dark)
        }
    }
}

struct ProbabilityTool: View {
    @State private var decimal = "2.00"
    private var odds: Double? { Double(decimal.replacingOccurrences(of: ",", with: ".")) }
    var body: some View {
        NavigationStack {
            Form {
                Section("Cuota decimal") {
                    TextField("Ejemplo: 2.00", text: $decimal).keyboardType(.decimalPad)
                        .accessibilityLabel("Cuota decimal")
                    if let value = odds, value > 1, value.isFinite {
                        LabeledContent("Probabilidad implícita", value: (100 / value).formatted(.number.precision(.fractionLength(2))) + "%")
                    } else { Text("Introduce una cuota decimal mayor que 1.") }
                }
                Section("Cómo se calcula") {
                    Text("Probabilidad implícita = 100 ÷ cuota decimal. Es una conversión matemática, no una predicción validada del partido. No elimina el margen del proveedor.")
                    Text("Esta herramienta funciona sin conexión y no coloca apuestas.")
                }
            }.navigationTitle("Probabilidades")
        }
    }
}
