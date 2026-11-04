package com.fertiliapp.fertiliapp;

import org.junit.Test;
import static org.junit.Assert.*;
import java.util.HashMap;
import java.util.Map;

public class FemometerIdentityStoreTest {
    static class Memory implements FemometerIdentityStore.Storage {
        Map<String, String> legacy = new HashMap<>();
        Map<String, FemometerIdentityStore.Binding> records = new HashMap<>();
        boolean fail;
        public String legacyAddress(String user) { return legacy.get(user); }
        public FemometerIdentityStore.Binding read(String user) { return records.get(user); }
        public boolean write(String user, FemometerIdentityStore.Binding value) {
            if (fail) return false;
            records.put(user, value); return true;
        }
    }
    @Test public void migratesAndSurvivesNewOwnerWithoutExposingAddressAsKey() {
        Memory memory = new Memory(); memory.legacy.put("a", "private-address");
        String first = new FemometerIdentityStore(memory).get("a").key;
        assertNotNull(first); assertNotEquals("private-address", first);
        FemometerIdentityStore next = new FemometerIdentityStore(memory);
        assertEquals(first, next.get("a").key);
        assertEquals(first, next.keyForAddress("a", "private-address"));
        assertNull(next.keyForAddress("a", "different-address"));
    }
    @Test public void separatesAccountsAndRotatesOnReplacementOrForget() {
        Memory memory = new Memory(); memory.legacy.put("a", "one");
        FemometerIdentityStore store = new FemometerIdentityStore(memory);
        String first = store.get("a").key;
        assertEquals(first, store.remember("a", "one").key);
        assertNotEquals(first, store.remember("b", "one").key);
        assertNotEquals(first, store.remember("a", "two").key);
        store.forget("a");
        assertNull(new FemometerIdentityStore(memory).get("a").key); // old legacy must not resurrect
        assertNull(store.keyForAddress("a", "one"));
        assertNotEquals(first, store.remember("a", "one").key);
    }
    @Test public void failedMigrationCannotReturnEphemeralIdentity() {
        Memory memory = new Memory(); memory.legacy.put("a", "one"); memory.fail = true;
        try { new FemometerIdentityStore(memory).get("a"); fail("must reject failed commit"); }
        catch (IllegalStateException expected) { assertEquals("PERSISTENCE_FAILED", expected.getMessage()); }
    }
}
