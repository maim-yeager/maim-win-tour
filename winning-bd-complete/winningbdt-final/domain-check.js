// Domain security check - prevents running on unauthorized hosts
(function() {
  const ALLOWED_DOMAINS = [
    'winning-tour-web.vercel.app',
    'localhost',
    '127.0.0.1'
  ];
  
  const hostname = window.location.hostname;
  const isAllowed = ALLOWED_DOMAINS.some(domain => 
    hostname === domain || hostname.endsWith('.' + domain)
  );
  
  if (!isAllowed && !window.__BYPASS_DOMAIN_CHECK__) {
    // Show security message
    document.documentElement.innerHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>WINNING BD</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #fff;
          }
          .container {
            text-align: center;
            padding: 40px;
            background: rgba(255,255,255,0.95);
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            max-width: 450px;
            color: #333;
          }
          .logo {
            font-size: 64px;
            margin-bottom: 20px;
            animation: bounce 2s infinite;
          }
          .title {
            font-size: 28px;
            font-weight: 900;
            margin-bottom: 10px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }
          .subtitle {
            font-size: 16px;
            margin-bottom: 20px;
            color: #666;
          }
          .message {
            font-size: 20px;
            font-weight: 700;
            line-height: 1.6;
            margin: 30px 0;
            padding: 20px;
            background: #fff3cd;
            border-radius: 10px;
            color: #856404;
            border-left: 4px solid #ffc107;
          }
          .detail {
            font-size: 12px;
            color: #999;
            margin-top: 20px;
          }
          @keyframes bounce {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-10px); }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">🎮</div>
          <div class="title">WINNING TOUR</div>
          <div class="subtitle">Tournament Platform</div>
          <div class="message">এই এপসটা কি তোর নানার নাকি খানকির ছেলে?</div>
          <div class="detail">
            ⚠️ Unauthorized domain detected<br>
            Domain: ${hostname}
          </div>
        </div>
      </body>
      </html>
    `;
  }
})();
