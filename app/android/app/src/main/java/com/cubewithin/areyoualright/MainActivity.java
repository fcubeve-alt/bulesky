package com.cubewithin.areyoualright;

import android.os.Bundle;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

/**
 * The window the sky is drawn in.
 *
 * <p>Everything here is about one thing: the WebView has to reach all four
 * edges of the screen. By default Android lays a window out <em>inside</em> the
 * status bar and the navigation bar, so the page stops short of both and what
 * shows in the gap is the window background — a flat band above and below the
 * night sky. That is the bug this file exists to prevent.
 *
 * <p>{@code setDecorFitsSystemWindows(false)} is the half that has to be done
 * in code; the transparent bar colours are the half in {@code styles.xml}, and
 * neither is any use without the other. The page then places its own buttons
 * clear of the bars using {@code env(safe-area-inset-*)}, which is why
 * index.html carries {@code viewport-fit=cover}.
 *
 * <p>The bar glyphs are forced to their light variant. They sit directly on the
 * sky now, and the sky is nearly black — the dark glyphs a light system theme
 * would ask for are invisible against it.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        WindowInsetsControllerCompat bars =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        bars.setAppearanceLightStatusBars(false);
        bars.setAppearanceLightNavigationBars(false);
    }
}
