<!-- domain-check.js -->
<script>
(function() {
  'use strict';

  // ===== SECURITY CONFIG =====
  const ALLOWED_DOMAINS = [
    'winning-tour-web.vercel.app',
    'localhost',
    '127.0.0.1'
  ];

  const BLOCK_KEY = '__WB_BLOCKED__';

  function hostnameAllowed() {
    try {
      const h = window.location.hostname.toLowerCase();
      return ALLOWED_DOMAINS.some(d =>
        h === d || h.endsWith('.' + d)
      );
    } catch (e) { return false; }
  }

  // Repeat-check + nuke everything periodically
  function runCheck() {
    if (hostnameAllowed()) return;

    sessionStorage.setItem(BLOCK_KEY, '1');

    // Nuke document completely
    try {
      document.documentElement.innerHTML = '';
      document.head.innerHTML = '';
      document.body.innerHTML = '';
      // Kill running scripts
      window.stop && window.stop();
    } catch (e) {}

    // Re-inject block page (escapes closed over by the check)
    const PAGE = [
      '<!DOCTYPE html><html lang="bn"><head>',
      '<meta charset="UTF-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<title>Access Denied — WINNING BD</title>',
      '<style>',
      '*{margin:0;padding:0;box-sizing:border-box}',
      'html,body{height:100%;overflow:hidden}',
      'body{',
      '  font-family:"Segoe UI",Roboto,-apple-system,sans-serif;',
      '  background:linear-gradient(-45deg,#0f0c29,#302b63,#24243e,#764ba2,#667eea);',
      '  background-size:400% 400%;',
      '  animation:gradShift 12s ease infinite;',
      '  display:flex;align-items:center;justify-content:center;color:#fff;',
      '}',
      '@keyframes gradShift{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}',
      /* floating glow orbs */
      '.orb{position:fixed;border-radius:50%;filter:blur(80px);opacity:.55;pointer-events:none;z-index:0}',
      '.orb.o1{width:340px;height:340px;background:#667eea;top:-90px;left:-90px;animation:float1 9s ease-in-out infinite}',
      '.orb.o2{width:300px;height:300px;background:#f107a3;bottom:-80px;right:-60px;animation:float2 11s ease-in-out infinite}',
      '.orb.o3{width:260px;height:260px;background:#00d2ff;top:55%;left:12%;animation:float1 13s ease-in-out infinite reverse}',
      '@keyframes float1{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(50px,40px) scale(1.15)}}',
      '@keyframes float2{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-60px,-50px) scale(1.2)}}',
      /* particles */
      '.p{position:fixed;top:100%;border-radius:50%;background:rgba(255,255,255,.7);pointer-events:none;z-index:0;animation:rise linear infinite}',
      '@keyframes rise{to{transform:translateY(-110vh) rotate(360deg);opacity:0}}',
      /* card */
      '.card{',
      '  position:relative;z-index:2;max-width:460px;width:calc(100% - 40px);padding:44px 36px;text-align:center;',
      '  background:rgba(255,255,255,.08);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);',
      '  border:1px solid rgba(255,255,255,.18);border-radius:26px;',
      '  box-shadow:0 25px 70px rgba(0,0,0,.45);',
      '  animation:cardIn .8s cubic-bezier(.2,.9,.3,1.2) both, glow 4s ease-in-out infinite;',
      '}',
      '@keyframes cardIn{from{opacity:0;transform:translateY(50px) scale(.9)}to{opacity:1;transform:translateY(0) scale(1)}}',
      '@keyframes glow{0%,100%{box-shadow:0 25px 70px rgba(0,0,0,.45),0 0 30px rgba(102,126,234,.25)}50%{box-shadow:0 25px 70px rgba(0,0,0,.45),0 0 55px rgba(241,7,163,.35)}}',
      /* animated shield logo */
      '.logo{font-size:70px;margin-bottom:18px;display:inline-block;animation:shield 3s ease-in-out infinite;filter:drop-shadow(0 0 18px rgba(0,210,255,.6))}',
      '@keyframes shield{0%,100%{transform:translateY(0) rotate(0)}30%{transform:translateY(-14px) rotate(-8deg)}60%{transform:translateY(-4px) rotate(8deg)}}',
      '.ring{position:absolute;top:26px;left:50%;transform:translateX(-50%);width:110px;height:110px;border-radius:50%;border:2px solid rgba(0,210,255,.4);animation:ringPulse 2.5s ease-out infinite;pointer-events:none}',
      '.ring.r2{animation-delay:1.25s}',
      '@keyframes ringPulse{from{width:80px;height:80px;opacity:.9}to{width:170px;height:170px;opacity:0}}',
      '.card{overflow:visible}.logoWrap{position:relative;display:inline-block}',
      /* animated gradient title */
      '.title{',
      '  font-size:34px;font-weight:900;letter-spacing:2px;margin-bottom:6px;',
      '  background:linear-gradient(90deg,#00d2ff,#667eea,#f107a3,#00d2ff);',
      '  background-size:300% 100%;',
      '  -webkit-background-clip:text;background-clip:text;',
      '  -webkit-text-fill-color:transparent;',
      '  animation:titleGrad 5s linear infinite;',
      '}',
      '@keyframes titleGrad{to{background-position:300% 0}}',
      '.subtitle{font-size:14px;color:rgba(255,255,255,.65);margin-bottom:26px;animation:fadeIn 1.2s .3s both}',
      '.alertBox{',
      '  background:rgba(255,255,255,.1);border:1px solid rgba(255,80,80,.45);',
      '  border-left:4px solid #ff5b5b;border-radius:14px;padding:18px;margin-bottom:24px;',
      '  animation:shakeIn .7s .5s both;',
      '}',
      '@keyframes shakeIn{from{opacity:0}60%{transform:translateX(-8px)}80%{transform:translateX(6px)}to{opacity:1;transform:translateX(0)}}',
      '.alertTitle{font-size:17px;font-weight:800;color:#ff8b8b;margin-bottom:6px}',
      '.alertText{font-size:14px;line-height:1.6;color:rgba(255,255,255,.85)}',
      '.domain{display:inline-block;margin-top:10px;padding:7px 16px;border-radius:20px;background:rgba(255,255,255,.12);font-family:monospace;font-size:13px;color:#00d2ff;border:1px solid rgba(0,210,255,.35);word-break:break-all;animation:fadeIn 1s .8s both}',
      '@keyframes fadeIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}',
      '.foot{margin-top:22px;font-size:11px;color:rgba(255,255,255,.4);animation:fadeIn 1s 1s both}',
      '.lock{display:inline-block;animation:lockPulse 2s ease-in-out infinite}',
      '@keyframes lockPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.2)}}',
      /* blinking live dot */
      '.dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:#00ff88;margin-right:6px;animation:blink 1.2s infinite}',
      '@keyframes blink{50%{opacity:.2;transform:scale(.8)}}',
      '</style></head><body>',
      '<div class="orb o1"></div><div class="orb o2"></div><div class="orb o3"></div>',
      '<div class="card">',
      ' <div class="logoWrap"><span class="ring"></span><span class="ring r2"></span><span class="logo">🛡️</span></div>',
      ' <div class="title">WINNING BD</div>',
      ' <div class="subtitle">Tournament Platform • Security Guard</div>',
      ' <div class="alertBox">',
      '   <div class="alertTitle"><span class="dot"></span>Access Restricted</div>',
      '   <div class="alertText">এই অ্যাপটি শুধুমাত্র অনুমোদিত ডোমেইনে চালানো যাবে।<br>Unauthorized host detected — অননুমোদিত হোস্ট শনাক্ত হয়েছে।</div>',
      '   <div class="domain">' + window.location.hostname + '</div>',
      ' </div>',
      ' <div class="foot"><span class="lock">🔒</span> Domain Security Guard • WINNING BD Security Layer</div>',
      '</div>',
      '</body></html>'
    ].join('');

    document.open();
    document.write(PAGE);
    document.close();

    // particles after write
    try {
      for (let i = 0; i < 26; i++) {
        const p = document.createElement('div');
        const s = 2 + Math.random() * 5;
        p.className = 'p';
        p.style.cssText = 'left:' + (Math.random() * 100) + 'vw;width:' + s + 'px;height:' + s +
          'px;animation-duration:' + (6 + Math.random() * 10) + 's;animation-delay:' +
          (Math.random() * 8) + 's;bottom:-12px';
        document.body.appendChild(p);
      }
    } catch (e) {}
  }

  // First check as early as possible
  runCheck();

  // ===== SECURITY HARDENING =====
  window.addEventListener('load', runCheck);
  window.addEventListener('DOMContentLoaded', runCheck);
  setInterval(runCheck, 2500);           // periodic re-check
  window.addEventListener('focus', runCheck);

  // Block bypass flags & debugger-less tamper resistance
  setInterval(function() {
    if (sessionStorage.getItem(BLOCK_KEY) === '1' && !hostnameAllowed()) runCheck();
    // Kill any dynamically added bypass flag
    try { delete window.__BYPASS_DOMAIN_CHECK__; } catch (e) {
      window.__BYPASS_DOMAIN_CHECK__ = undefined;
    }
    Object.defineProperty(window, '__BYPASS_DOMAIN_CHECK__', {
      get: function() { return false; },
      set: function() {},
      configurable: false
    });
  }, 1200);
})();
</script>
