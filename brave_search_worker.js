const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";
const MAX_BODY_BYTES = 8192;
const MAX_QUERY_LENGTH = 400;

function jsonResponse(body, status, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers
    }
  });
}

function corsHeaders(origin, allowedOrigin) {
  if (!origin || origin !== allowedOrigin) return {};
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowedOrigin = typeof env.ALLOWED_ORIGIN === "string" ? env.ALLOWED_ORIGIN.trim() : "";
    const headers = corsHeaders(origin, allowedOrigin);
    const url = new URL(request.url);

    if (!allowedOrigin) {
      return jsonResponse({ error: "Worker chưa cấu hình ALLOWED_ORIGIN." }, 500);
    }
    if (!headers["Access-Control-Allow-Origin"]) {
      return jsonResponse({ error: "Origin không được phép." }, 403);
    }
    if (url.pathname !== "/" && url.pathname !== "/search") {
      return jsonResponse({ error: "Không tìm thấy endpoint." }, 404, headers);
    }
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== "POST") {
      return jsonResponse({ error: "Chỉ hỗ trợ POST." }, 405, headers);
    }

    const contentLength = Number(request.headers.get("Content-Length") || 0);
    if (contentLength > MAX_BODY_BYTES) {
      return jsonResponse({ error: "Request quá lớn." }, 413, headers);
    }

    let body;
    try {
      const rawBody = await request.text();
      if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
        return jsonResponse({ error: "Request quá lớn." }, 413, headers);
      }
      body = JSON.parse(rawBody);
    } catch {
      return jsonResponse({ error: "Body phải là JSON hợp lệ." }, 400, headers);
    }

    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!apiKey || apiKey.length > 512) {
      return jsonResponse({ error: "Brave API key thiếu hoặc không hợp lệ." }, 400, headers);
    }
    if (!query || query.length > MAX_QUERY_LENGTH) {
      return jsonResponse({ error: `Truy vấn phải có từ 1 đến ${MAX_QUERY_LENGTH} ký tự.` }, 400, headers);
    }

    const searchUrl = new URL(BRAVE_SEARCH_URL);
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("count", "6");
    searchUrl.searchParams.set("country", "VN");
    searchUrl.searchParams.set("search_lang", "vi");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    let braveResponse;
    try {
      braveResponse = await fetch(searchUrl, {
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": apiKey
        },
        signal: controller.signal
      });
    } catch {
      return jsonResponse({ error: "Không kết nối được Brave Search API." }, 502, headers);
    } finally {
      clearTimeout(timeout);
    }

    if (!braveResponse.ok) {
      const status = braveResponse.status === 401 || braveResponse.status === 403
        ? 401
        : (braveResponse.status === 429 ? 429 : 502);
      const message = status === 401
        ? "Brave Search từ chối API key."
        : (status === 429 ? "Brave Search đã vượt hạn mức yêu cầu." : "Brave Search API thất bại.");
      return jsonResponse({ error: message }, status, headers);
    }

    let searchData;
    try {
      searchData = await braveResponse.json();
    } catch {
      return jsonResponse({ error: "Brave Search trả về JSON không hợp lệ." }, 502, headers);
    }

    const results = (Array.isArray(searchData?.web?.results) ? searchData.web.results : [])
      .slice(0, 6)
      .map(result => ({
        title: typeof result.title === "string" ? result.title.slice(0, 240) : "",
        url: typeof result.url === "string" ? result.url.slice(0, 1000) : "",
        description: typeof result.description === "string" ? result.description.slice(0, 1600) : ""
      }))
      .filter(result => result.title || result.description);

    return jsonResponse({ results }, 200, headers);
  }
};
