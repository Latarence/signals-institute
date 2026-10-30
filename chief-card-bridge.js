/*! chief-card-bridge client 0.1.0. Vendorable, no dependencies.
 *  window.chiefCardBridge.sign(challenge, cardId) -> Promise<{card_id, certificate_pem, signature, alg}>
 *  Talks to the local agent (127.0.0.1 only). The PIN is entered in the agent's own dialog, never here.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) { module.exports = api; }
  if (root && !root.chiefCardBridge) { root.chiefCardBridge = api; }
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function () {
  "use strict";
  var cfg = { baseUrl: "http://127.0.0.1:17843", timeoutMs: 120000 };

  function BridgeError(code, message, details) {
    var e = new Error(message || code);
    e.name = "ChiefCardBridgeError";
    e.code = code;
    e.details = details || {};
    return e;
  }

  function call(method, path, body, timeoutMs) {
    var ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, timeoutMs || cfg.timeoutMs) : null;
    var init = { method: method, mode: "cors", credentials: "omit", cache: "no-store" };
    if (ctl) { init.signal = ctl.signal; }
    if (body !== undefined) {
      init.headers = { "Content-Type": "application/json" };
      init.body = JSON.stringify(body);
    }
    return fetch(cfg.baseUrl + path, init).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (json) {
        if (!res.ok) {
          var er = (json && json.error) || {};
          throw BridgeError(er.code || "HTTP_" + res.status, er.message || "bridge error " + res.status, er);
        }
        return json;
      });
    }, function (err) {
      if (err && err.name === "AbortError") { throw BridgeError("TIMEOUT", "no response from the card bridge"); }
      throw BridgeError("BRIDGE_UNAVAILABLE",
        "Card bridge not reachable. Start the Chief card bridge on this computer and allow this site.");
    }).then(function (v) { if (timer) { clearTimeout(timer); } return v; },
            function (e) { if (timer) { clearTimeout(timer); } throw e; });
  }

  return {
    version: "0.1.0",
    configure: function (opts) {
      opts = opts || {};
      if (opts.baseUrl) {
        if (!/^http:\/\/(127\.0\.0\.1|localhost):\d{1,5}$/.test(opts.baseUrl)) {
          throw BridgeError("BAD_CONFIG", "baseUrl must be http://127.0.0.1:<port> or http://localhost:<port>");
        }
        cfg.baseUrl = opts.baseUrl;
      }
      if (opts.timeoutMs) { cfg.timeoutMs = opts.timeoutMs; }
    },
    status: function () { return call("GET", "/v1/status", undefined, 5000); },
    isAvailable: function () { return call("GET", "/v1/status", undefined, 3000).then(function () { return true; }, function () { return false; }); },
    sign: function (challenge, cardId) {
      if (typeof challenge !== "string" || !challenge) {
        return Promise.reject(BridgeError("BAD_REQUEST", "challenge must be a non-empty string"));
      }
      if (cardId !== undefined && cardId !== null && (typeof cardId !== "string" || !cardId)) {
        return Promise.reject(BridgeError("BAD_REQUEST", "cardId must be a non-empty string when given"));
      }
      var body = { challenge: challenge };
      if (cardId) { body.card_id = cardId; }
      return call("POST", "/v1/sign", body).then(function (r) {
        return { card_id: r.card_id, certificate_pem: r.certificate_pem, signature: r.signature, alg: r.alg };
      });
    }
  };
});
