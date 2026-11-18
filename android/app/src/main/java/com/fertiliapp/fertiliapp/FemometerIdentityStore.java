package com.fertiliapp.fertiliapp;

import java.util.UUID;
import java.util.List;
import java.util.ArrayList;
import java.util.Collections;

/** Native-only addresses; public keys survive migration and selection changes. */
final class FemometerIdentityStore {
    static final class Binding {
        final String address, key, model;
        Binding(String address, String key) { this(address, key, "BM-Vinca2"); }
        Binding(String address, String key, String model) { this.address = address; this.key = key; this.model = model; }
    }
    static final class Bindings {
        final List<Binding> devices;
        final String selectedKey;
        Bindings(List<Binding> devices, String selectedKey) {
            this.devices = Collections.unmodifiableList(new ArrayList<>(devices)); this.selectedKey = selectedKey;
        }
    }
    interface Storage {
        String legacyAddress(String user);
        Binding read(String user);
        boolean write(String user, Binding binding); // retained for v1/v2 storage compatibility
        Bindings readBindings(String user);
        boolean writeBindings(String user, Bindings bindings);
    }
    private final Storage storage;
    FemometerIdentityStore(Storage storage) { this.storage = storage; }
    synchronized Bindings all(String user) {
        Bindings result = storage.readBindings(user);
        if (result != null) return result;
        Binding old = storage.read(user);
        if (old == null) {
            String address = storage.legacyAddress(user);
            old = new Binding(address, address == null ? null : UUID.randomUUID().toString());
        }
        List<Binding> devices = new ArrayList<>();
        if (old.address != null && old.key != null) devices.add(old);
        result = new Bindings(devices, devices.isEmpty() ? null : old.key);
        save(user, result); // atomic v3 commit before migration is visible
        return result;
    }
    synchronized Binding get(String user) {
        Bindings bindings = all(user);
        for (Binding binding : bindings.devices) if (binding.key.equals(bindings.selectedKey)) return binding;
        return new Binding(null, null);
    }
    synchronized Binding remember(String user, String address) {
        Bindings old = all(user);
        for (Binding binding : old.devices) if (address.equals(binding.address)) { select(user, binding.key); return binding; }
        Binding next = new Binding(address, UUID.randomUUID().toString());
        List<Binding> devices = new ArrayList<>(old.devices); devices.add(next);
        save(user, new Bindings(devices, next.key)); return next;
    }
    synchronized void select(String user, String key) {
        Bindings old = all(user);
        for (Binding binding : old.devices) if (binding.key.equals(key)) { save(user, new Bindings(old.devices, key)); return; }
        throw new IllegalStateException("DEVICE_NOT_FOUND");
    }
    synchronized void forget(String user) { forget(user, get(user).key); }
    synchronized void forget(String user, String key) {
        Bindings old = all(user);
        List<Binding> devices = new ArrayList<>(old.devices);
        devices.removeIf(binding -> binding.key.equals(key));
        // Never silently switch the automatic reconnect target after deletion.
        save(user, new Bindings(devices, key != null && key.equals(old.selectedKey) ? null : old.selectedKey));
    }
    synchronized String keyForAddress(String user, String address) {
        if (user == null || address == null) return null;
        for (Binding binding : all(user).devices) if (address.equals(binding.address)) return binding.key;
        return null;
    }
    private void save(String user, Bindings bindings) {
        if (!storage.writeBindings(user, bindings)) throw new IllegalStateException("PERSISTENCE_FAILED");
    }
}
