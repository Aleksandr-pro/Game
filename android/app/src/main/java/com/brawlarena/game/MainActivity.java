package com.brawlarena.game;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Brawl Arena для Android.
 *
 * Игра целиком лежит в assets/index.html (офлайн-сборка), поэтому работает без интернета.
 * Сеть используется только для проверки и скачивания обновлений:
 * см. мост AndroidApp и src/updater.js на стороне игры.
 */
public class MainActivity extends Activity {

    private static final String GAME_URL = "file:///android_asset/index.html";
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final AtomicInteger httpIds = new AtomicInteger(1);
    private WebView web;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        web = new WebView(this);
        web.setBackgroundColor(0xFF070A12);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        try {
            s.setAllowFileAccessFromFileURLs(true);
            s.setAllowUniversalAccessFromFileURLs(true);
        } catch (Throwable ignored) {
            // на новых WebView эти флаги могут быть недоступны
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            s.setSafeBrowsingEnabled(false);
        }

        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                // внешние ссылки — в системный браузер, игру оставляем внутри
                if (url.startsWith("file://") || url.startsWith("about:")) return false;
                openExternal(url);
                return true;
            }
        });
        web.addJavascriptInterface(new Bridge(), "AndroidApp");

        hideSystemUi();
        web.loadUrl(GAME_URL);
    }

    private void hideSystemUi() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.systemBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_FULLSCREEN);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            // «Назад» — это пауза внутри игры, а не выход
            web.evaluateJavascript("window.__androidBack && window.__androidBack();", null);
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) {
            web.onResume();
            hideSystemUi();
        }
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.loadUrl("about:blank");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    private void toast(final String text) {
        ui.post(() -> Toast.makeText(MainActivity.this, text, Toast.LENGTH_SHORT).show());
    }

    private void openExternal(String url) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Exception e) {
            toast("Не удалось открыть ссылку");
        }
    }

    // ---------- Установка обновления ----------

    private void downloadApk(final String urlString) {
        toast("Загрузка обновления…");
        new Thread(() -> {
            try {
                URL url = new URL(urlString);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setInstanceFollowRedirects(true);
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(60000);
                conn.connect();
                int code = conn.getResponseCode();
                if (code < 200 || code >= 400) throw new Exception("HTTP " + code);

                File dir = new File(getCacheDir(), "updates");
                if (!dir.exists() && !dir.mkdirs()) throw new Exception("нет доступа к кэшу");
                File out = new File(dir, "brawl-arena-update.apk");
                try (InputStream in = conn.getInputStream();
                     OutputStream fos = new FileOutputStream(out)) {
                    byte[] buf = new byte[64 * 1024];
                    int read;
                    while ((read = in.read(buf)) > 0) fos.write(buf, 0, read);
                }
                if (out.length() < 50_000) throw new Exception("файл слишком мал");

                ui.post(() -> installApk(out));
            } catch (Exception e) {
                ui.post(() -> {
                    toast("Не удалось скачать обновление, открываю браузер");
                    openExternal(urlString);
                });
            }
        }).start();
    }

    private void installApk(File file) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    && !getPackageManager().canRequestPackageInstalls()) {
                toast("Разрешите установку приложений для Brawl Arena");
                Intent settings = new Intent(
                        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + getPackageName()));
                startActivity(settings);
                return;
            }
            Uri uri = Uri.parse("content://" + getPackageName() + ApkProvider.AUTHORITY_SUFFIX + "/" + file.getName());
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            grantUriPermission(getPackageName(), uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(intent);
        } catch (Exception e) {
            toast("Не получилось запустить установщик");
        }
    }

    // ---------- Мост в игру ----------

    public class Bridge {

        @JavascriptInterface
        public int versionCode() {
            return BuildConfig.VERSION_CODE;
        }

        @JavascriptInterface
        public String versionName() {
            return BuildConfig.VERSION_NAME;
        }

        @JavascriptInterface
        public String platform() {
            return "android";
        }

        @JavascriptInterface
        public void openUrl(String url) {
            openExternal(url);
        }

        @JavascriptInterface
        public void downloadUpdate(String url) {
            if (url == null || !url.startsWith("https://")) {
                toast("Некорректная ссылка обновления");
                return;
            }
            downloadApk(url);
        }

        @JavascriptInterface
        public void exitApp() {
            ui.post(MainActivity.this::finish);
        }

        /**
         * HTTP GET в обход CORS для file:// — на случай, если WebView не пускает fetch.
         * Результат приходит в JS: window.__androidHttp(id, status, body).
         */
        @JavascriptInterface
        public int httpGet(final String url, final String accept) {
            final int id = httpIds.getAndIncrement();
            new Thread(() -> {
                int status = 0;
                String body = "";
                try {
                    HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
                    conn.setInstanceFollowRedirects(true);
                    conn.setConnectTimeout(12000);
                    conn.setReadTimeout(12000);
                    conn.setRequestProperty("Accept", accept == null ? "application/json" : accept);
                    conn.setRequestProperty("User-Agent", "BrawlArena-Android");
                    status = conn.getResponseCode();
                    InputStream in = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
                    if (in != null) {
                        java.io.ByteArrayOutputStream buf = new java.io.ByteArrayOutputStream();
                        byte[] chunk = new byte[16 * 1024];
                        int read;
                        while ((read = in.read(chunk)) > 0) buf.write(chunk, 0, read);
                        body = buf.toString("UTF-8");
                    }
                } catch (Exception e) {
                    status = -1;
                    body = e.getMessage() == null ? "network error" : e.getMessage();
                }
                final String payload = JSONObject.quote(body);
                final int finalStatus = status;
                ui.post(() -> {
                    String js = "window.__androidHttp&&window.__androidHttp(" + id + "," + finalStatus + "," + payload + ")";
                    web.evaluateJavascript(js, null);
                });
            }).start();
            return id;
        }
    }
}
