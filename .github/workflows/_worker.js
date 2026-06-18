export default {
  async fetch(request, env) {
    const url = new URL(request.url);

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

    return env.ASSETS.fetch(request);
  }
};
