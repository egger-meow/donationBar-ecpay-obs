// CSP is intentionally compatible with the existing dependency-free pages, which use
// inline script/style. It still restricts origins, embeds, base URLs, objects, and form
// submissions. Replace unsafe-inline with nonces when the static pages are modularized.
export function getHelmetOptions({ production = false } = {}) {
  return {
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        mediaSrc: ["'self'", 'data:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameSrc: ["'self'"],
        frameAncestors: ["'self'"],
        objectSrc: ["'none'"],
        formAction: ["'self'", 'https://payment.ecpay.com.tw', 'https://payment-stage.ecpay.com.tw'],
        // Helmet enables this by default; retain it only in production so local HTTP
        // development and sandbox evidence remain usable.
        upgradeInsecureRequests: production ? [] : null
      }
    }
  };
}
