package app.picks777.mobile;
import static org.junit.Assert.*;
import android.webkit.WebSettings;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.Robolectric;
import org.robolectric.Shadows;
import org.robolectric.annotation.Config;
@RunWith(RobolectricTestRunner.class)
@Config(sdk = {24, 28, 35})
public class LauncherIntegrationTest {
    @Test public void launcherLoadsInsideAppWithoutStartingBrowser() {
        try (var controller = Robolectric.buildActivity(MainActivity.class).setup()) {
            MainActivity a = controller.get();
            assertEquals("https://picks777.vercel.app/", Shadows.shadowOf(a.web).getLastLoadedUrl());
            assertNull(Shadows.shadowOf(a).getNextStartedActivity());
            assertFalse(a.web.getSettings().getAllowFileAccess());
            assertFalse(a.web.getSettings().getAllowContentAccess());
            assertEquals(WebSettings.MIXED_CONTENT_NEVER_ALLOW, a.web.getSettings().getMixedContentMode());
        }
    }
    @Test public void navigationStaysInAppAndBlocksUnsafeSchemes() {
        try (var controller = Robolectric.buildActivity(MainActivity.class).setup()) {
            MainActivity a = controller.get();
            assertFalse(a.navigate("https://picks777.vercel.app/eliminar-cuenta", true, true));
            assertTrue(a.navigate("file:///etc/passwd", true, true));
            assertTrue(a.navigate("javascript:alert(1)", true, true));
            assertTrue(a.navigate("https://evil.example", true, false));
            assertTrue(a.navigate("https://evil.example", false, true));
            assertNull(Shadows.shadowOf(a).getNextStartedActivity());
        }
    }
    @Test public void rejectsSpoofedOrigins() {
        String o = "https://picks777.vercel.app";
        assertTrue(MainActivity.isAppUrl(o + "/", o));
        assertFalse(MainActivity.isAppUrl(o + ".evil.example/", o));
        assertFalse(MainActivity.isAppUrl("https://user@picks777.vercel.app/", o));
        assertFalse(MainActivity.isAppUrl(o + ":1234/", o));
        assertFalse(MainActivity.isAppUrl("http://picks777.vercel.app/", o));
    }
    @Test public void explicitGoogleAuthUsesBrowserSelectorOnlyForLogin() {
        try (var controller = Robolectric.buildActivity(MainActivity.class).setup()) {
            MainActivity a = controller.get();
            String url = "https://picks777.vercel.app/mobile-auth#" + "a".repeat(64);
            assertTrue(a.navigate(url, true, false));
            android.content.Intent intent = Shadows.shadowOf(a).getNextStartedActivity();
            assertNotNull(intent);
            assertEquals(url, intent.getDataString());
            assertTrue(intent.getSelector().hasCategory(android.content.Intent.CATEGORY_APP_BROWSER));
        }
    }
}
