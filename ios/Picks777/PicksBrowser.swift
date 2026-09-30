import SwiftUI
import UIKit
import WebKit
import AuthenticationServices
import Combine

@MainActor
final class PicksBrowser: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate, ASWebAuthenticationPresentationContextProviding {
    let origin = URL(string: Bundle.main.object(forInfoDictionaryKey: "PicksOrigin") as! String)!
    @Published var loading = false
    @Published var canGoBack = false
    @Published var error: String?
    let web: WKWebView
    private var authentication: ASWebAuthenticationSession?
    private var backObservation: NSKeyValueObservation?

    override init() {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.applicationNameForUserAgent = "Picks777iOS/1"
        web = WKWebView(frame: .zero, configuration: configuration)
        super.init()
        web.navigationDelegate = self
        web.uiDelegate = self
        web.isOpaque = false
        web.backgroundColor = UIColor(red: 0.03, green: 0.04, blue: 0.07, alpha: 1)
        web.allowsBackForwardNavigationGestures = true
        backObservation = web.observe(\.canGoBack, options: [.new]) { [weak self] view, _ in
            Task { @MainActor [weak self] in self?.canGoBack = view.canGoBack }
        }
        load(path: "/")
    }

    func load(path: String) { error = nil; web.load(URLRequest(url: origin.appendingPathComponent(path))) }
    func reload() { error = nil; if web.url == nil { load(path: "/") } else { web.reload() } }
    func back() { if web.canGoBack { web.goBack() } }
    private func isOwnOrigin(_ url: URL) -> Bool {
        url.scheme == "https" && url.host == origin.host && (url.port == nil || url.port == 443) && url.user == nil && url.password == nil
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if isOwnOrigin(url) {
            if url.path == "/mobile-auth" {
                decisionHandler(.cancel)
                // The secret verifier remains in the original WKWebView; only the request id leaves it.
                startAuthentication(url)
            } else { decisionHandler(.allow) }
            return
        }
        decisionHandler(.cancel)
        guard action.navigationType == .linkActivated else { return }
        if url.scheme == "mailto" { UIApplication.shared.open(url) }
    }

    private func startAuthentication(_ url: URL) {
        guard authentication == nil else { return }
        let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "picks777") { [weak self] _, authError in
            Task { @MainActor [weak self] in
                self?.authentication = nil
                if authError != nil {
                    // Cancelling the system browser must also stop the poll in the original page.
                    self?.web.evaluateJavaScript("window.dispatchEvent(new Event('picks-mobile-auth-cancel'))", completionHandler: nil)
                }
            }
        }
        session.presentationContextProvider = self
        session.prefersEphemeralWebBrowserSession = true
        authentication = session
        if !session.start() { authentication = nil; error = "No se pudo abrir el acceso seguro. Reintenta la conexión." }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        web.window ?? ASPresentationAnchor()
    }
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) { loading = true; error = nil }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { loading = false }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError cause: Error) {
        if (cause as NSError).code != NSURLErrorCancelled { loading = false; error = "No se pudo cargar 777 Picks. Comprueba tu conexión y vuelve a intentarlo." }
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError cause: Error) {
        self.webView(webView, didFailProvisionalNavigation: navigation, withError: cause)
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { loading = false; error = "La aplicación necesita recargar. Pulsa Reintentar." }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url, isOwnOrigin(url) { webView.load(action.request) }
        else if let url = action.request.url, url.scheme == "mailto", action.navigationType == .linkActivated { UIApplication.shared.open(url) }
        return nil
    }
}

struct PicksWebView: UIViewRepresentable {
    @ObservedObject var browser: PicksBrowser
    func makeUIView(context: Context) -> WKWebView { browser.web }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
