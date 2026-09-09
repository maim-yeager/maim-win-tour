<script>
(function () {
  "use strict";

  /* =========================================================
     WINNING BD — DOMAIN SECURITY
     ========================================================= */

  const ALLOWED_DOMAINS = [
    "winning-tour-web.vercel.app",
    "",
    ""
  ];

  const hostname = window.location.hostname
    .toLowerCase()
    .replace(/\.$/, "");

  const isAllowed = ALLOWED_DOMAINS.some(domain =>
    hostname === domain ||
    hostname.endsWith("." + domain)
  );

  /* =========================================================
     AUTHORIZED DOMAIN
     ========================================================= */

  if (isAllowed) {
    return;
  }

  /* =========================================================
     UNAUTHORIZED DOMAIN
     ========================================================= */

  try {
    window.stop();
  } catch (_) {}

  function escapeHTML(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  const currentDomain = escapeHTML(hostname);

  document.documentElement.innerHTML = `
<!DOCTYPE html>

<html lang="en">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width,
  initial-scale=1.0,
  maximum-scale=1.0,
  user-scalable=no"
>

<meta
  name="robots"
  content="noindex,nofollow,noarchive"
>

<title>Access Restricted • WINNING TOUR</title>

<style>

/* =========================================================
   RESET
   ========================================================= */

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body {
  width: 100%;
  min-height: 100%;
}

body {

  min-height: 100vh;

  display: flex;
  align-items: center;
  justify-content: center;

  padding: 20px;

  overflow: hidden;

  font-family:
    Inter,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;

  color: #fff;

  background:
    radial-gradient(
      circle at 15% 15%,
      rgba(255, 180, 80, .35),
      transparent 30%
    ),

    radial-gradient(
      circle at 85% 20%,
      rgba(255, 92, 92, .30),
      transparent 30%
    ),

    radial-gradient(
      circle at 50% 100%,
      rgba(255, 120, 40, .25),
      transparent 40%
    ),

    linear-gradient(
      135deg,
      #140807 0%,
      #28100b 35%,
      #1a0710 70%,
      #08070d 100%
    );

}

/* =========================================================
   ANIMATED BACKGROUND
   ========================================================= */

.background {
  position: fixed;
  inset: 0;

  overflow: hidden;

  pointer-events: none;
}

/* Floating blobs */

.blob {

  position: absolute;

  width: 280px;
  height: 280px;

  border-radius: 50%;

  filter: blur(80px);

  opacity: .35;

  animation:
    floating 10s ease-in-out infinite;

}

.blob.one {

  top: -100px;
  left: -100px;

  background:
    #ffb347;

}

.blob.two {

  right: -120px;
  top: 20%;

  background:
    #ff5f6d;

  animation-delay: -3s;

}

.blob.three {

  left: 30%;
  bottom: -180px;

  background:
    #ff7b39;

  animation-delay: -6s;

}

@keyframes floating {

  0%,
  100% {
    transform:
      translate3d(0, 0, 0)
      scale(1);
  }

  50% {
    transform:
      translate3d(35px, -30px, 0)
      scale(1.12);
  }

}

/* =========================================================
   MOVING LIGHT
   ========================================================= */

.light {

  position: absolute;

  width: 500px;
  height: 500px;

  border-radius: 50%;

  background:
    radial-gradient(
      circle,
      rgba(255, 190, 100, .13),
      transparent 65%
    );

  animation:
    rotateLight 18s linear infinite;

}

@keyframes rotateLight {

  0% {
    transform:
      translate(-30%, -30%)
      rotate(0deg);
  }

  50% {
    transform:
      translate(80%, 50%)
      rotate(180deg);
  }

  100% {
    transform:
      translate(-30%, -30%)
      rotate(360deg);
  }

}

/* =========================================================
   PARTICLES
   ========================================================= */

.particles {

  position: absolute;
  inset: 0;

  background-image:
    radial-gradient(
      rgba(255,255,255,.20) 1px,
      transparent 1px
    );

  background-size: 34px 34px;

  opacity: .12;

  animation:
    particlesMove 20s linear infinite;

}

@keyframes particlesMove {

  from {
    transform:
      translateY(0);
  }

  to {
    transform:
      translateY(-34px);
  }

}

/* =========================================================
   MAIN CARD
   ========================================================= */

.card {

  position: relative;

  width: min(100%, 470px);

  padding:
    42px
    30px
    30px;

  text-align: center;

  border-radius: 32px;

  background:
    linear-gradient(
      145deg,
      rgba(255,255,255,.13),
      rgba(255,255,255,.045)
    );

  border:
    1px solid
    rgba(255,255,255,.16);

  backdrop-filter:
    blur(25px);

  -webkit-backdrop-filter:
    blur(25px);

  box-shadow:

    0 35px 100px
    rgba(0,0,0,.55),

    inset 0 1px 0
    rgba(255,255,255,.15),

    0 0 60px
    rgba(255,115,50,.08);

  animation:
    cardEnter .8s
    cubic-bezier(.2,.8,.2,1)
    forwards;

}

/* Animated border */

.card::before {

  content: "";

  position: absolute;

  inset: -1px;

  border-radius: 33px;

  padding: 1px;

  background:
    linear-gradient(
      120deg,
      transparent,
      rgba(255,190,100,.7),
      transparent,
      rgba(255,90,90,.6),
      transparent
    );

  background-size: 300% 300%;

  animation:
    borderMove 6s linear infinite;

  -webkit-mask:
    linear-gradient(#fff 0 0)
    content-box,
    linear-gradient(#fff 0 0);

  -webkit-mask-composite: xor;

  mask-composite: exclude;

  pointer-events: none;

}

@keyframes borderMove {

  0% {
    background-position:
      0% 50%;
  }

  50% {
    background-position:
      100% 50%;
  }

  100% {
    background-position:
      0% 50%;
  }

}

@keyframes cardEnter {

  from {

    opacity: 0;

    transform:
      translateY(35px)
      scale(.92);

    filter:
      blur(8px);

  }

  to {

    opacity: 1;

    transform:
      translateY(0)
      scale(1);

    filter:
      blur(0);

  }

}

/* =========================================================
   SECURITY ICON
   ========================================================= */

.security-icon {

  position: relative;

  width: 100px;
  height: 100px;

  margin:
    0 auto
    25px;

  display: flex;

  align-items: center;
  justify-content: center;

  border-radius: 30px;

  font-size: 44px;

  background:
    linear-gradient(
      135deg,
      #ffb347,
      #ff6b4a,
      #ff4d6d
    );

  box-shadow:

    0 15px 45px
    rgba(255,105,60,.30),

    inset 0 1px 1px
    rgba(255,255,255,.4);

  animation:
    iconFloat 3s
    ease-in-out infinite;

}

.security-icon::before {

  content: "";

  position: absolute;

  inset: -10px;

  border-radius: 35px;

  border:
    1px solid
    rgba(255,180,100,.25);

  animation:
    iconRing 2.5s
    ease-out infinite;

}

@keyframes iconFloat {

  0%,
  100% {
    transform:
      translateY(0)
      rotate(0deg);
  }

  50% {
    transform:
      translateY(-8px)
      rotate(2deg);
  }

}

@keyframes iconRing {

  0% {

    transform:
      scale(.85);

    opacity: .8;

  }

  100% {

    transform:
      scale(1.2);

    opacity: 0;

  }

}

/* =========================================================
   BRAND
   ========================================================= */

.brand {

  font-size: 12px;

  font-weight: 900;

  letter-spacing: 4px;

  margin-bottom: 9px;

  background:
    linear-gradient(
      90deg,
      #ffd27a,
      #ff8b5c,
      #ffb347
    );

  -webkit-background-clip: text;
  background-clip: text;

  color: transparent;

}

/* =========================================================
   TITLE
   ========================================================= */

.title {

  font-size:
    clamp(28px, 7vw, 38px);

  font-weight: 950;

  letter-spacing: -.8px;

  margin-bottom: 12px;

  background:
    linear-gradient(
      120deg,
      #fff,
      #ffd8b0,
      #ff9b72
    );

  -webkit-background-clip: text;
  background-clip: text;

  color: transparent;

}

/* =========================================================
   DESCRIPTION
   ========================================================= */

.subtitle {

  max-width: 360px;

  margin:
    0 auto;

  color:
    rgba(255,255,255,.62);

  font-size: 14px;

  line-height: 1.7;

}

/* =========================================================
   WARNING BOX
   ========================================================= */

.warning {

  margin:
    28px 0
    20px;

  padding: 20px;

  border-radius: 20px;

  background:
    linear-gradient(
      135deg,
      rgba(255,173,72,.10),
      rgba(255,80,80,.06)
    );

  border:
    1px solid
    rgba(255,171,75,.20);

  box-shadow:
    inset 0 1px
    rgba(255,255,255,.04);

}

.warning-icon {

  font-size: 23px;

  margin-bottom: 8px;

}

.warning-title {

  font-size: 16px;

  font-weight: 850;

  color:
    #ffc46b;

  margin-bottom: 7px;

}

.warning-text {

  color:
    rgba(255,255,255,.65);

  font-size: 13px;

  line-height: 1.6;

}

/* =========================================================
   DOMAIN BOX
   ========================================================= */

.domain-box {

  margin-top: 16px;

  padding:
    13px 15px;

  border-radius: 13px;

  background:
    rgba(0,0,0,.25);

  border:
    1px solid
    rgba(255,255,255,.07);

  text-align: left;

}

.domain-label {

  display: block;

  color:
    rgba(255,255,255,.38);

  font-size: 10px;

  text-transform: uppercase;

  letter-spacing: 1.5px;

  margin-bottom: 5px;

}

.domain {

  color:
    rgba(255,255,255,.65);

  font-size: 11px;

  word-break: break-all;

}

/* =========================================================
   STATUS
   ========================================================= */

.status {

  display:
    inline-flex;

  align-items:
    center;

  gap: 8px;

  margin-top: 6px;

  padding:
    8px 13px;

  border-radius: 50px;

  background:
    rgba(255,255,255,.05);

  border:
    1px solid
    rgba(255,255,255,.07);

  color:
    rgba(255,255,255,.50);

  font-size: 11px;

}

.status-dot {

  width: 7px;
  height: 7px;

  border-radius: 50%;

  background:
    #ff8a65;

  box-shadow:
    0 0 12px
    #ff8a65;

  animation:
    statusPulse 1.5s
    infinite;

}

@keyframes statusPulse {

  0%,
  100% {
    opacity: .4;
    transform: scale(.8);
  }

  50% {
    opacity: 1;
    transform: scale(1);
  }

}

/* =========================================================
   FOOTER
   ========================================================= */

.footer {

  margin-top: 22px;

  color:
    rgba(255,255,255,.25);

  font-size: 10px;

  letter-spacing: .5px;

}

/* =========================================================
   MOBILE
   ========================================================= */

@media (max-width: 480px) {

  body {
    padding: 15px;
  }

  .card {

    padding:
      34px 20px
      25px;

    border-radius: 27px;

  }

  .security-icon {

    width: 86px;
    height: 86px;

    font-size: 38px;

    border-radius: 26px;

  }

  .warning {

    padding: 17px;

  }

}

/* =========================================================
   REDUCED MOTION
   ========================================================= */

@media (prefers-reduced-motion: reduce) {

  *,
  *::before,
  *::after {

    animation-duration:
      .01ms !important;

    animation-iteration-count:
      1 !important;

  }

}

</style>

</head>

<body>

<!-- Animated background -->

<div class="background">

  <div class="blob one"></div>

  <div class="blob two"></div>

  <div class="blob three"></div>

  <div class="light"></div>

  <div class="particles"></div>

</div>


<!-- Main security card -->

<main class="card">

  <div class="security-icon">
    🔐
  </div>

  <div class="brand">
    WINNING BD
  </div>

  <h1 class="title">
    Access Restricted
  </h1>

  <p class="subtitle">
    This application is protected and can only
    be accessed from an authorized domain.
  </p>


  <section class="warning">

    <div class="warning-icon">
      ⚠️
    </div>

    <div class="warning-title">
      Unauthorized Domain
    </div>

    <div class="warning-text">
      খানকির ছেলে, চোরা চোদা এপস টা কি তোর বাপের..?
      তোর বাপ আমি মাইম 🫦🤡
    </div>


    <div class="domain-box">

      <span class="domain-label">
        Current Domain
      </span>

      <div class="domain">
        ${currentDomain}
      </div>

    </div>

  </section>


  <div class="status">

    <span class="status-dot"></span>

    Domain protection active

  </div>


  <div class="footer">

    WINNING TOUR • Secure Application

  </div>

</main>


<script>

/*
 * Prevent basic history navigation tricks
 */

try {

  history.replaceState(
    null,
    "",
    location.href
  );

  history.pushState(
    null,
    "",
    location.href
  );

  window.addEventListener(
    "popstate",
    function () {

      history.pushState(
        null,
        "",
        location.href
      );

    }
  );

} catch (_) {}


/*
 * Disable common interaction
 * on unauthorized page
 */

try {

  document.addEventListener(
    "contextmenu",
    function (e) {
      e.preventDefault();
    }
  );

  document.addEventListener(
    "dragstart",
    function (e) {
      e.preventDefault();
    }
  );

  document.addEventListener(
    "selectstart",
    function (e) {
      e.preventDefault();
    }
  );

} catch (_) {}

</script>

</body>

</html>
`;

})();
</script>
