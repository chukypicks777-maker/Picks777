package app.picks777.mobile;

import android.content.ComponentName;
import android.content.Context;
import android.content.pm.PackageManager;
import com.google.androidbrowserhelper.trusted.ManageDataLauncherActivity;
import com.google.androidbrowserhelper.trusted.LauncherActivity;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.Robolectric;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28)
public class LauncherIntegrationTest {
    @Test public void launcherStartsAndClosesWithoutBrowserInstalled() {
        Robolectric.buildActivity(LauncherActivity.class).create().start().resume().pause().stop().destroy();
    }

    @Test public void startupCanConfigureSiteSettingsWithoutMissingComponent() throws Exception {
        Context context = RuntimeEnvironment.getApplication();
        ComponentName component = new ComponentName(context, ManageDataLauncherActivity.class);
        context.getPackageManager().getActivityInfo(component, PackageManager.MATCH_DISABLED_COMPONENTS);
        // LauncherActivity always calls this even when the browser lacks site settings support.
        ManageDataLauncherActivity.addSiteSettingsShortcut(context, null);
        context.getPackageManager().setComponentEnabledSetting(component,
                PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
        context.getPackageManager().getActivityInfo(component, 0);
    }
}
