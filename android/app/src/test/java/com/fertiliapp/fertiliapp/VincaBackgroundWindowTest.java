package com.fertiliapp.fertiliapp;

import org.junit.Test;
import static org.junit.Assert.*;

public class VincaBackgroundWindowTest {
    @Test public void foregroundHasNoDeadline() {
        VincaBackgroundWindow window = new VincaBackgroundWindow();
        assertFalse(window.expired(900_000));
    }
    @Test public void repeatedStopsDoNotExtendSixMinutes() {
        VincaBackgroundWindow window = new VincaBackgroundWindow();
        assertTrue(window.enter(10_000));
        assertFalse(window.enter(130_000));
        assertFalse(window.expired(369_999));
        assertTrue(window.expired(370_000));
    }
    @Test public void earlyReturnCancelsAndNextBackgroundGetsNewWindow() {
        VincaBackgroundWindow window = new VincaBackgroundWindow();
        window.enter(0); window.cancel();
        assertFalse(window.expired(360_000));
        assertTrue(window.enter(400_000));
        assertFalse(window.expired(759_999));
        assertTrue(window.expired(760_000));
    }
    @Test public void lateWakeMustExpireBeforeReturnCancellation() {
        VincaBackgroundWindow window = new VincaBackgroundWindow();
        window.enter(1_000);
        assertTrue(window.expired(900_000));
        window.cancel();
        assertFalse(window.expired(900_001));
    }
}
