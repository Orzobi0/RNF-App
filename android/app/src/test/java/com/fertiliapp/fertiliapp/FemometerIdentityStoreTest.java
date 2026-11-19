package com.fertiliapp.fertiliapp;

import org.junit.Test;
import static org.junit.Assert.*;
import java.util.HashMap;
import java.util.Map;

public class FemometerIdentityStoreTest {
    @Test public void standardMetadataDoesNotInventModelAndPreservesLegacyKeys() {
        Memory memory = new Memory(); memory.records.put("a", new FemometerIdentityStore.Binding("old", "old-key"));
        FemometerIdentityStore store = new FemometerIdentityStore(memory);
        FemometerIdentityStore.Binding standard = store.remember("a", "new", null, "My thermometer", "Maker", "health-thermometer", "1", "experimental");
        assertNull(standard.model); assertEquals("health-thermometer", standard.protocol);
        assertEquals("old-key", store.forAddress("a", "old").key);
        assertEquals("vinca2", store.forAddress("a", "old").protocol);
        assertTrue(standard.matches(null, "Maker", "1", "health-thermometer"));
        assertFalse(standard.matches(null, "Maker", "2", "health-thermometer"));
        assertEquals(standard.key, store.remember("a", "new", null, "New label", "Maker", "health-thermometer", "1", "experimental").key);
        assertEquals(2, store.all("a").devices.size());
    }
    @Test public void explicitReverificationPreservesKeyButCannotChangeProtocol() {
        FemometerIdentityStore store = new FemometerIdentityStore(new Memory());
        FemometerIdentityStore.Binding first = store.remember("a", "address", null, "Name", "Maker", "health-thermometer", "1", "experimental");
        FemometerIdentityStore.Binding next = store.remember("a", "address", null, "Name", "Maker", "health-thermometer", "2", "experimental");
        assertEquals(first.key, next.key); assertEquals("2", next.firmware);
        try { store.remember("a", "address", "EBT-300", "Name", "Maker", "easyhome-ebt300", "2", "experimental"); fail("protocol"); }
        catch (IllegalStateException expected) { assertEquals("DEVICE_PROTOCOL_CHANGED", expected.getMessage()); }
        assertEquals(first.key, store.get("a").key);
    }
    static class Memory implements FemometerIdentityStore.Storage {
        Map<String, String> legacy = new HashMap<>();
        Map<String, FemometerIdentityStore.Binding> records = new HashMap<>();
        Map<String, FemometerIdentityStore.Bindings> groups = new HashMap<>();
        public FemometerIdentityStore.Bindings readBindings(String user) { return groups.get(user); }
        public boolean writeBindings(String user, FemometerIdentityStore.Bindings value) {
            if (fail) return false; groups.put(user, value); return true;
        }
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
    @Test public void separatesAccountsAndRetainsOtherDevicesWhenSelectedDeviceIsForgotten() {
        Memory memory = new Memory(); memory.legacy.put("a", "one");
        FemometerIdentityStore store = new FemometerIdentityStore(memory);
        String first = store.get("a").key;
        assertEquals(first, store.remember("a", "one").key);
        assertNotEquals(first, store.remember("b", "one").key);
        assertNotEquals(first, store.remember("a", "two").key);
        store.forget("a");
        assertNull(new FemometerIdentityStore(memory).get("a").key); // old legacy must not resurrect
        assertEquals(first, store.keyForAddress("a", "one"));
        assertEquals(first, store.remember("a", "one").key);
    }
    @Test public void failedMigrationCannotReturnEphemeralIdentity() {
        Memory memory = new Memory(); memory.legacy.put("a", "one"); memory.fail = true;
        try { new FemometerIdentityStore(memory).get("a"); fail("must reject failed commit"); }
        catch (IllegalStateException expected) { assertEquals("PERSISTENCE_FAILED", expected.getMessage()); }
    }
    @Test public void migratesV2WithoutRotatingKeyAndKeepsMultipleBindings() {
        Memory memory = new Memory(); memory.records.put("a", new FemometerIdentityStore.Binding("one", "existing-key"));
        FemometerIdentityStore store = new FemometerIdentityStore(memory);
        assertEquals("existing-key", store.get("a").key);
        String second = store.remember("a", "two").key;
        assertEquals(2, store.all("a").devices.size());
        store.select("a", "existing-key"); assertEquals("existing-key", store.get("a").key);
        assertEquals(second, store.remember("a", "two").key); assertEquals(2, store.all("a").devices.size());
        store.forget("a", "existing-key"); assertEquals(second, store.get("a").key);
        store.forget("a", second); assertNull(store.get("a").key);
        assertEquals(0, new FemometerIdentityStore(memory).all("a").devices.size());
    }
    @Test public void failedAdditionOrSelectionDoesNotChangePreviousCollection() {
        Memory memory = new Memory(); FemometerIdentityStore store = new FemometerIdentityStore(memory);
        String first = store.remember("a", "one").key; String second = store.remember("a", "two").key;
        memory.fail = true;
        try { store.remember("a", "three"); fail(); } catch (IllegalStateException expected) { }
        try { store.select("a", first); fail(); } catch (IllegalStateException expected) { }
        assertEquals(2, store.all("a").devices.size()); assertEquals(second, store.get("a").key);
        memory.fail = false; store.forget("a", second);
        assertNull(store.get("a").key); assertEquals(first, store.all("a").devices.get(0).key);
    }

}
