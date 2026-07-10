export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const noStoreAsset = url.pathname === "/" || /\.(html|js)$/i.test(url.pathname);

    if (url.pathname === "/geo") {
      const countryCode = request.cf?.country || "";
      const region = request.cf?.region || "";
      const city = request.cf?.city || "";
      const timezone = request.cf?.timezone || "";

      return new Response(JSON.stringify({
        country_code: countryCode,
        country: countryCode,
        region,
        city,
        timezone,
        source: "cloudflare_request_cf"
      }), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store"
        }
      });
    }

    const response = await env.ASSETS.fetch(request);
    if (!noStoreAsset) return response;

    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    headers.set("Pragma", "no-cache");
    headers.set("Expires", "0");
    headers.set("X-VidiPay-Frontend-Build", "frontend-admin-readiness-20260709-v2");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
};
