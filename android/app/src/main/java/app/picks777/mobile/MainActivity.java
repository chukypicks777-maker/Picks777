package app.picks777.mobile;

import android.app.Activity;
import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** App-owned window; no browser dependency at launch and no JavaScript bridge. */
public class MainActivity extends Activity {
    WebView web;
    private LinearLayout root;
    private ProgressBar progress;
    private LinearLayout errorPanel;
    private String origin;

    static boolean isAppUrl(String url, String origin) {
        if (url == null) return false;
        Uri uri = Uri.parse(url), base = Uri.parse(origin);
        return "https".equalsIgnoreCase(uri.getScheme()) && base.getHost().equalsIgnoreCase(uri.getHost())
            && uri.getUserInfo() == null && (uri.getPort() == -1 || uri.getPort() == 443);
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        }
        origin = getString(R.string.app_origin);
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(9, 13, 20));
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            } else {
                view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        setContentView(root);
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        root.addView(progress, new LinearLayout.LayoutParams(-1, 6));
        try { web = new WebView(this); }
        catch (RuntimeException error) {
            showError("Actualiza Android System WebView desde la tienda de tu teléfono y vuelve a abrir 777 Picks.");
            return;
        }
        WebSettings settings = web.getSettings();
        Matcher engine = Pattern.compile("Chrome/(\\d+)").matcher(settings.getUserAgentString());
        if (engine.find() && Integer.parseInt(engine.group(1)) < 111) {
            web.destroy(); web = null;
            showError("777 Picks necesita Android System WebView 111 o posterior. Actualiza el componente desde la tienda del teléfono. Si tu sistema ya no admite actualizaciones, usa un dispositivo más reciente.");
            return;
        }
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setUserAgentString(settings.getUserAgentString() + " Picks777Android/1");
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        web.setBackgroundColor(Color.rgb(9, 13, 20));
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view, int value) {
                progress.setProgress(value);
                progress.setVisibility(value < 100 ? View.VISIBLE : View.GONE);
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return navigate(request.getUrl().toString(), request.isForMainFrame(), request.hasGesture());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) { return navigate(url, true, true); }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showError("No se pudo cargar 777 Picks. Comprueba tu conexión y vuelve a intentarlo.");
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame()) showError("El servicio no está disponible en este momento. Inténtalo de nuevo.");
            }
        });
        root.addView(web, new LinearLayout.LayoutParams(-1, 0, 1));
        if (state == null || web.restoreState(state) == null) {
            String link = getIntent().getDataString();
            web.loadUrl(isAppUrl(link, origin) && !"/mobile-auth".equals(Uri.parse(link).getPath()) ? link : origin + "/");
        }
    }

    boolean navigate(String url, boolean mainFrame, boolean gesture) {
        if (isAppUrl(url, origin) && !"/mobile-auth".equals(Uri.parse(url).getPath())) return false;
        if (!mainFrame) return true;
        Uri uri = Uri.parse(url);
        boolean auth = isAppUrl(url, origin) && "/mobile-auth".equals(uri.getPath());
        if (!gesture && !auth) return true;
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        if (!(scheme.equals("https") || scheme.equals("mailto") || scheme.equals("tel"))) return true;
        try {
            Intent external = new Intent(Intent.ACTION_VIEW, uri);
            external.addCategory(Intent.CATEGORY_BROWSABLE);
            if (auth) external.setSelector(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_APP_BROWSER));
            startActivity(external);
        } catch (ActivityNotFoundException error) {
            new AlertDialog.Builder(this).setMessage("Para iniciar sesión con Google o abrir enlaces externos necesitas un navegador instalado.").setPositiveButton("Aceptar", null).show();
        }
        return true;
    }

    private void showError(String message) {
        progress.setVisibility(View.GONE);
        if (web != null) web.setVisibility(View.GONE);
        if (errorPanel != null) root.removeView(errorPanel);
        errorPanel = new LinearLayout(this);
        errorPanel.setOrientation(LinearLayout.VERTICAL);
        errorPanel.setPadding(32, 64, 32, 32);
        TextView text = new TextView(this);
        text.setText(message); text.setTextColor(Color.WHITE); text.setTextSize(18);
        errorPanel.addView(text);
        Button retry = new Button(this); retry.setText("Reintentar");
        retry.setOnClickListener(view -> {
            if (web == null) { recreate(); return; }
            root.removeView(errorPanel); errorPanel = null;
            web.setVisibility(View.VISIBLE); web.loadUrl(origin + "/");
        });
        errorPanel.addView(retry); root.addView(errorPanel);
    }
    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String url = intent.getDataString();
        // auth-return carries no credential: the original page resumes its protected poll.
        if (web != null && isAppUrl(url, origin) && !"/mobile-auth".equals(Uri.parse(url).getPath())) web.loadUrl(url);
    }
    @Override protected void onSaveInstanceState(Bundle state) {
        if (web != null) web.saveState(state);
        super.onSaveInstanceState(state);
    }
    @Override protected void onPause() {
        if (web != null) { web.onPause(); CookieManager.getInstance().flush(); }
        super.onPause();
    }
    @Override protected void onResume() { super.onResume(); if (web != null) web.onResume(); }
    private void handleBack() { if (web != null && web.canGoBack()) web.goBack(); else finish(); }
    // API 33+ uses the registered predictive-back callback; this is only the older API fallback.
    @SuppressLint("GestureBackNavigation")
    @Override public void onBackPressed() { handleBack(); }
    @Override protected void onDestroy() {
        if (web != null) { root.removeView(web); web.destroy(); }
        super.onDestroy();
    }
}
