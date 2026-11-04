package com.fertiliapp.fertiliapp;

import java.util.UUID;

/** Local association identity, never a hardware serial or measurement identifier. */
final class FemometerIdentityStore {
    static final class Binding {
        final String address;
        final String key;
        Binding(String address, String key) { this.address = address; this.key = key; }
    }
    interface Storage {
        String legacyAddress(String user);
        Binding read(String user); // null = not migrated; null fields = forgotten tombstone
        boolean write(String user, Binding binding);
    }
    private final Storage storage;
    FemometerIdentityStore(Storage storage) { this.storage = storage; }
    synchronized Binding get(String user) {
        Binding binding = storage.read(user);
        if (binding != null) return binding;
        String address = storage.legacyAddress(user);
        binding = new Binding(address, address == null ? null : UUID.randomUUID().toString());
        save(user, binding);
        return binding;
    }
    synchronized Binding remember(String user, String address) {
        Binding old = get(user);
        if (address.equals(old.address) && old.key != null) return old;
        Binding next = new Binding(address, UUID.randomUUID().toString());
        save(user, next);
        return next;
    }
    synchronized void forget(String user) { save(user, new Binding(null, null)); }
    synchronized String keyForAddress(String user, String address) {
        if (user == null || address == null) return null;
        Binding binding = get(user);
        return address.equals(binding.address) ? binding.key : null;
    }
    private void save(String user, Binding binding) {
        if (!storage.write(user, binding)) throw new IllegalStateException("PERSISTENCE_FAILED");
    }
}
