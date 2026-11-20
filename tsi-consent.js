/* The Signals Institute analytics consent. Google Analytics 4 loads only after the visitor chooses Accept.
   Before that choice, and after Decline, no request goes to Google and no analytics cookie is set.
   The choice is remembered in localStorage (key tsi_consent: "yes" or "no"). Pattern follows the lab's shared consent loaders. */
(function () {
  'use strict';
  var GA = 'G-SKC5ERT7VL';
  var KEY = 'tsi_consent';
  var started = false;

  function get() { try { return window.localStorage.getItem(KEY); } catch (e) { return null; } }
  function set(v) { try { window.localStorage.setItem(KEY, v); } catch (e) {} }

  function clearCookies() {
    var host = location.hostname, parts = host.split('.'), domains = ['', host, '.' + host];
    if (parts.length > 2) domains.push('.' + parts.slice(-2).join('.'));
    document.cookie.split(';').forEach(function (c) {
      var n = c.split('=')[0].replace(/^\s+/, '');
      if (n === '_ga' || n.indexOf('_ga_') === 0) {
        domains.forEach(function (d) {
          document.cookie = n + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' + (d ? '; domain=' + d : '');
        });
      }
    });
  }

  function start() {
    if (started) return; started = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    window.gtag('js', new Date());
    window.gtag('config', GA, { allow_google_signals: false, allow_ad_personalization_signals: false });
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA;
    document.head.appendChild(s);
  }

  function stop() {
    if (started && window.gtag) {
      window.gtag('consent', 'update', { analytics_storage: 'denied' });
      window['ga-disable-' + GA] = true;
    }
    clearCookies();
  }

  function injectStyle() {
    if (document.getElementById('tsi-consent-style')) return;
    var st = document.createElement('style');
    st.id = 'tsi-consent-style';
    st.textContent =
      '.tsi-consent{position:fixed;left:16px;right:16px;bottom:16px;max-width:560px;z-index:9999;padding:16px 18px;' +
      'background:var(--card,#141414);color:var(--text,#ddd);border:1px solid var(--text-dim,rgba(221,221,221,.45));' +
      'font:14px/1.55 var(--font-sans,system-ui,sans-serif);box-shadow:0 8px 32px rgba(0,0,0,.35)}' +
      '.tsi-consent p{margin:0 0 12px}.tsi-consent a{color:var(--blue,#00A8E8);text-decoration:underline}' +
      '.tsi-consent-row{display:flex;gap:10px;flex-wrap:wrap}' +
      '.tsi-consent button{flex:1 1 120px;min-height:44px;padding:10px 16px;font:inherit;font-weight:600;cursor:pointer;' +
      'background:transparent;color:var(--text-bright,#fff);border:1px solid var(--text-bright,#fff);border-radius:0}' +
      '.tsi-consent button:hover{background:var(--text-bright,#fff);color:var(--on-accent,#0a0a0a)}' +
      '.tsi-consent button:focus-visible,.tsi-consent a:focus-visible,.tsi-consent-link:focus-visible{outline:3px solid var(--blue,#00A8E8);outline-offset:2px}' +
      '.tsi-consent-link{background:none;border:0;padding:0;margin:0;font:inherit;color:inherit;text-decoration:underline;cursor:pointer}';
    document.head.appendChild(st);
  }

  function banner() {
    if (document.getElementById('tsi-consent')) return;
    injectStyle();
    var d = document.createElement('div');
    d.id = 'tsi-consent';
    d.className = 'tsi-consent';
    d.setAttribute('role', 'dialog');
    d.setAttribute('aria-label', 'Analytics choice');
    d.innerHTML =
      '<p>The Signals Institute would like to use Google Analytics to understand how visitors use this site. ' +
      'It loads only if you accept, and it sets a cookie that identifies your browser. ' +
      'You can decline, and you can change your choice at any time. Details are in our <a href="/privacy#analytics">Privacy Policy</a>.</p>' +
      '<div class="tsi-consent-row"><button type="button" id="tsi-consent-no">Decline</button>' +
      '<button type="button" id="tsi-consent-yes">Accept</button></div>';
    document.body.appendChild(d);
    document.getElementById('tsi-consent-no').onclick = function () { set('no'); stop(); d.remove(); };
    document.getElementById('tsi-consent-yes').onclick = function () { set('yes'); d.remove(); start(); };
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape' && document.getElementById('tsi-consent')) { set('no'); stop(); d.remove(); document.removeEventListener('keydown', esc); }
    });
  }

  function footerLink() {
    var host = document.querySelector('.footer-bottom span');
    if (!host || document.getElementById('tsi-consent-open')) return;
    host.appendChild(document.createTextNode(' · '));
    var b = document.createElement('button');
    b.type = 'button'; b.id = 'tsi-consent-open'; b.className = 'tsi-consent-link';
    b.textContent = 'Analytics choice';
    b.onclick = function () { injectStyle(); banner(); var y = document.getElementById('tsi-consent-yes'); if (y) y.focus(); };
    host.appendChild(b);
  }

  function init() {
    footerLink();
    var c = get();
    if (c === 'yes') start();
    else if (c !== 'no') banner();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
