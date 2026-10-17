/* Docly - preference.js
 * Runs BEFORE app.js (see index.html). It keeps the browser settings (every localStorage key
 * that starts with "docly-": theme, language, spell check, ruler, minimap, toolbar, margins,
 * page setup, recent colors...) in sync with documents/preference.json, through the
 * /api/settings endpoint of server.py. That way settings follow the documents folder
 * and survive a change of browser.
 */
(function () {
  "use strict";

  var KEY_RE = /^docly-[a-z0-9-]{1,40}$/;   // same rule as server.py (save_settings)
  var MAX_VALUE = 50000;
  var MAX_KEYS = 60;
  var ENDPOINT = "/api/settings";
  var DELAY = 300;

  var store;
  try { store = window.localStorage; store.length; } catch (e) { return; }   // storage blocked: nothing to do

  var rawSet = Storage.prototype.setItem;
  var rawRemove = Storage.prototype.removeItem;
  var rawClear = Storage.prototype.clear;

  function managedKeys() {
    var keys = [];
    for (var i = 0; i < store.length; i++) {
      var k = store.key(i);
      if (KEY_RE.test(k)) keys.push(k);
    }
    return keys;
  }

  function snapshot() {
    var out = {}, n = 0;
    managedKeys().forEach(function (k) {
      var v = store.getItem(k);
      if (typeof v === "string" && v.length <= MAX_VALUE && n < MAX_KEYS) { out[k] = v; n++; }
    });
    return out;
  }

  // 1. Load: server -> localStorage (synchronous, so app.js sees the values at startup)
  var serverSettings = null;
  try {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", ENDPOINT, false);
    xhr.send(null);
    if (xhr.status === 200) {
      var res = JSON.parse(xhr.responseText);
      if (res && res.settings && typeof res.settings === "object") serverSettings = res.settings;
    }
  } catch (e) { /* server not reachable: keep the local values */ }

  if (serverSettings) {
    managedKeys().forEach(function (k) { rawRemove.call(store, k); });
    Object.keys(serverSettings).forEach(function (k) {
      if (KEY_RE.test(k) && typeof serverSettings[k] === "string") rawSet.call(store, k, serverSettings[k]);
    });
  }

  // 2. Save: localStorage -> server (debounced)
  var timer = null, dirty = false;

  function send(useBeacon) {
    timer = null;
    if (!dirty) return;
    dirty = false;
    var body = JSON.stringify({ settings: snapshot() });
    try {
      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
        return;
      }
      var x = new XMLHttpRequest();
      x.open("PUT", ENDPOINT, true);
      x.setRequestHeader("Content-Type", "application/json");
      x.send(body);
    } catch (e) { /* ignore */ }
  }

  function schedule() {
    dirty = true;
    if (timer === null) timer = setTimeout(function () { send(false); }, DELAY);
  }

  function isLocal(obj) { return obj === store; }

  Storage.prototype.setItem = function (k, v) {
    rawSet.call(this, k, v);
    if (isLocal(this) && KEY_RE.test(String(k))) schedule();
  };
  Storage.prototype.removeItem = function (k) {
    rawRemove.call(this, k);
    if (isLocal(this) && KEY_RE.test(String(k))) schedule();
  };
  Storage.prototype.clear = function () {
    rawClear.call(this);
    if (isLocal(this)) schedule();
  };

  // First run (no settings on the server yet): push what the browser already has.
  if (!serverSettings && managedKeys().length) schedule();

  window.addEventListener("pagehide", function () { if (dirty) send(true); });
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden" && dirty) send(true); });
})();
