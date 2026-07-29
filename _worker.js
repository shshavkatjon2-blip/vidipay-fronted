const PUBLIC_CSP = "default-src 'self'; script-src 'self' https://telegram.org https://www.youtube.com; script-src-attr 'none'; style-src 'self' https://cdnjs.cloudflare.com; style-src-attr 'unsafe-inline'; font-src 'self' data: https://cdnjs.cloudflare.com; img-src 'self' data: blob: https://upload.wikimedia.org https://i.ytimg.com https://img.youtube.com; connect-src 'self' https://vidipay-origin-proxy.shshavkatjon2.workers.dev; frame-src https://www.youtube.com https://www.youtube-nocookie.com; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; manifest-src 'self'; upgrade-insecure-requests; frame-ancestors 'self' https://web.telegram.org https://*.telegram.org";
const ADMIN_CSP = "default-src 'self'; script-src 'self'; script-src-attr 'none'; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://vidipay-origin-proxy.shshavkatjon2.workers.dev; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; manifest-src 'self'; upgrade-insecure-requests; frame-ancestors 'none'";

function applySecurityHeaders(response, pathname) {
  const headers = new Headers(response.headers);
  const isAdmin = pathname === "/admin.html";
  const noStore = pathname === "/" || /\.(html|js|css)$/i.test(pathname);

  if (noStore) {
    headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    headers.set("Pragma", "no-cache");
    headers.set("Expires", "0");
  }

  headers.set("Content-Security-Policy", isAdmin ? ADMIN_CSP : PUBLIC_CSP);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", isAdmin ? "no-referrer" : "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  headers.set("X-VidiPay-Frontend-Build", "frontend-origin-proxy-20260729-csp");
  if (isAdmin) headers.set("X-Frame-Options", "DENY");
  else headers.delete("X-Frame-Options");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const response = await env.ASSETS.fetch(request);
    return applySecurityHeaders(response, url.pathname);
  }
};
