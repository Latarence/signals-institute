/* Member space client. Passkeys use the browser's WebAuthn; the member card uses the Chief card
   bridge (window.chiefCardBridge.sign(challenge) -> { card_id, certificate_pem, signature }). */
(function () {
  var API = "/member";
  var st = document.getElementById("status");
  function say(msg, err) { if (st) { st.textContent = msg; st.className = "member-status" + (err ? " err" : ""); } }
  function b64uToBuf(s) { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; var b = atob(s), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a.buffer; }
  function bufToB64u(buf) { var a = new Uint8Array(buf), s = ""; for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  function post(path, body) {
    return fetch(API + path, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { throw new Error(typeof j.detail === "string" ? j.detail : "The request could not be completed."); } return j; }); });
  }
  function needWebAuthn() { if (!window.PublicKeyCredential || !navigator.credentials) { throw new Error("Passkeys are available in current browsers. Please update your browser, or sign in with your member card."); } }
  function busy(on) { Array.prototype.forEach.call(document.querySelectorAll(".member-btn"), function (b) { b.disabled = on; }); }
  function run(fn) { busy(true); return Promise.resolve().then(fn).catch(function (e) { say(e.message === "The operation either timed out or was not allowed." ? "The passkey prompt was closed. Please try again when you are ready." : e.message, true); }).then(function () { busy(false); }); }
  function done(r) { say("Welcome, " + r.member + "."); window.location.href = "member.html"; }

  function passkeyLogin() {
    needWebAuthn(); say("Please confirm on your device.");
    return post("/passkey/login/options").then(function (o) {
      return navigator.credentials.get({ publicKey: { challenge: b64uToBuf(o.challenge), rpId: o.rpId, userVerification: "required", timeout: o.timeout } });
    }).then(function (c) {
      var r = c.response;
      return post("/passkey/login/verify", { response: { id: c.id, clientDataJSON: bufToB64u(r.clientDataJSON), authenticatorData: bufToB64u(r.authenticatorData), signature: bufToB64u(r.signature) } });
    }).then(done);
  }
  function passkeyEnroll(code) {
    needWebAuthn(); say("Please confirm on your device to create your passkey.");
    return post("/passkey/enroll/options", { invite: code }).then(function (o) {
      o.challenge = b64uToBuf(o.challenge); o.user.id = b64uToBuf(o.user.id);
      o.excludeCredentials = (o.excludeCredentials || []).map(function (c) { return { type: c.type, id: b64uToBuf(c.id) }; });
      return navigator.credentials.create({ publicKey: o });
    }).then(function (c) {
      return post("/passkey/enroll/verify", { invite: code, response: { id: c.id, clientDataJSON: bufToB64u(c.response.clientDataJSON), attestationObject: bufToB64u(c.response.attestationObject) } });
    }).then(done);
  }
  function cardLogin() {
    say("Requesting a challenge.");
    return post("/card/challenge").then(function (c) {
      if (!window.chiefCardBridge || typeof window.chiefCardBridge.sign !== "function") { throw new Error("Please connect your card reader and open the Chief card reader, then try again."); }
      say("Waiting for your card.");
      return window.chiefCardBridge.sign(c.challenge).then(function (s) {
        return post("/card/login", { challenge: c.challenge, card_id: s.card_id, certificate_pem: s.certificate_pem, signature: s.signature });
      });
    }).then(done);
  }
  function on(id, fn) { var el = document.getElementById(id); if (el) el.addEventListener("click", fn); }

  on("passkeyLogin", function () { run(passkeyLogin); });
  on("cardLogin", function () { run(cardLogin); });
  on("enrollGo", function () {
    var code = (document.getElementById("invite").value || "").trim();
    if (!code) { say("Please enter your invitation.", true); return; }
    run(function () { return passkeyEnroll(code); });
  });

  // member.html: show who is signed in, offer sign-out.
  var who = document.getElementById("who");
  if (who) {
    fetch(API + "/session", { credentials: "same-origin" }).then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (s) { who.textContent = "You are signed in as " + s.member + ", using your " + (s.method === "card" ? "member card" : "passkey") + "."; })
      .catch(function () { window.location.href = "member-login.html"; });
    on("logout", function () { run(function () { return post("/logout").then(function () { window.location.href = "member-login.html"; }); }); });
  }
})();
