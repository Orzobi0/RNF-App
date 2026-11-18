package com.fertiliapp.fertiliapp;
import org.junit.Test;
import static org.junit.Assert.*;

public class ThermometerVerificationTest {
    @Test public void evidenceBindsAccountDeviceSessionAndReceivedReading() {
        ThermometerVerification<String> proof = new ThermometerVerification<>();
        String session = proof.begin("a", "private-device"); String reading = proof.add("received");
        assertEquals("received", proof.confirmed("a", "private-device", session, reading, true));
        reject(() -> proof.confirmed("b", "private-device", session, reading, true));
        reject(() -> proof.confirmed("a", "another", session, reading, true));
        reject(() -> proof.confirmed("a", "private-device", session, "invented", true));
        reject(() -> proof.confirmed("a", "private-device", session, reading, false));
        proof.clear(); // cancel, background, disconnect or timeout
        assertNull(proof.add("late"));
        reject(() -> proof.confirmed("a", "private-device", session, reading, true));
        proof.begin("a", "private-device");
        reject(() -> proof.confirmed("a", "private-device", session, reading, true));
    }
    private void reject(Runnable action) {
        try { action.run(); fail("stale or fabricated evidence"); }
        catch (IllegalStateException expected) { assertEquals("VERIFICATION_INVALID", expected.getMessage()); }
    }
}
