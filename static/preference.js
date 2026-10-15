/* Docly: interface preferences (theme, language, page setup, ruler...) are kept in documents/preference.json,
   next to the documents, instead of only in the browser. If the Docly folder is moved or opened with another
   browser, everything is still there. Runs before app.js. */
(function () {
  "use strict";
  var PREFIX = /^docly-/;
  var ls;
  try { ls = window.localStorage; ls.length; } catch (e) { return; }

  function request(method, body) {            // synchronous on purpose: settings must be in place before the app starts
    try {
      var x = new XMLHttpRequest();
      x.open(method, "/api/settings", false);
      x.setRequestHeader("Content-Type", "application/json");
      x.send(body || null);
      return x.status >= 200 && x.status < 300 ? x.responseText : null;
    } catch (e) { return null; }
  }
  function local() {
    var o = {};
    for (var i = 0; i < ls.length; i++) { var k = ls.key(i); if (PREFIX.test(k)) o[k] = ls.getItem(k); }
    return o;
  }

  var remote = null, txt = request("GET");
  if (txt) { try { remote = JSON.parse(txt).settings; } catch (e) { remote = null; } }

  if (remote && typeof remote === "object") {
    // the file is the source of truth
    Object.keys(local()).forEach(function (k) { if (!(k in remote)) ls.removeItem(k); });
    Object.keys(remote).forEach(function (k) { if (PREFIX.test(k) && ls.getItem(k) !== remote[k]) ls.setItem(k, remote[k]); });
  } else if (txt !== null) {
    // first run with this file: keep what this browser already had
    var existing = local();
    if (Object.keys(existing).length) request("PUT", JSON.stringify({ settings: existing }));
  }

  // from now on every change is written to the file (a moment after the last change)
  var timer = 0;
  function flush() {
    if (timer) { clearTimeout(timer); timer = 0; }
    try { fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings: local() }), keepalive: true }); } catch (e) { /* ignore */ }
  }
  function schedule() { if (timer) clearTimeout(timer); timer = setTimeout(flush, 300); }
  var proto = Storage.prototype, setItem = proto.setItem, removeItem = proto.removeItem, clear = proto.clear;
  proto.setItem = function (k, v) { setItem.call(this, k, v); if (this === ls && PREFIX.test(String(k))) schedule(); };
  proto.removeItem = function (k) { removeItem.call(this, k); if (this === ls && PREFIX.test(String(k))) schedule(); };
  proto.clear = function () { clear.call(this); if (this === ls) schedule(); };
  window.addEventListener("pagehide", function () { if (timer) flush(); });
})();
