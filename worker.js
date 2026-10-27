const TOKEN_URL =
  "https://corpusxapi.bol.co.th/api/v1/token/token";

const SEARCH_URL =
  "https://corpusxfrontapi.bol.co.th/ApiFrontend/bol_service/get/data";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type,x-api-key,Authorization",
  "Access-Control-Max-Age": "86400",
  "Cache-Control": "no-store"
};

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      /*
       * รองรับ CORS Preflight
       */
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: CORS_HEADERS
        });
      }

      /*
       * ตรวจว่า Worker ทำงานหรือไม่
       */
      if (
        url.pathname === "/health" &&
        request.method === "GET"
      ) {
        return sendJson(
          {
            success: true,
            message: "Worker is ready",
            time: new Date().toISOString()
          },
          200
        );
      }

      /*
       * หน้าแรกของ Worker
       */
      if (
        url.pathname === "/" &&
        request.method === "GET"
      ) {
        return sendJson(
          {
            success: true,
            message: "CorpusX Worker is running",
            endpoint: "/search"
          },
          200
        );
      }

      /*
       * อนุญาตเฉพาะ /search
       */
      if (url.pathname !== "/search") {
        return sendJson(
          {
            success: false,
            message: "Endpoint not found"
          },
          404
        );
      }

      if (request.method !== "POST") {
        return sendJson(
          {
            success: false,
            message: "Method not allowed"
          },
          405
        );
      }

      /*
       * ตรวจ Environment Variables
       */
      if (!env.API_KEY) {
        return sendJson(
          {
            success: false,
            message:
              "ยังไม่ได้ตั้งค่า API_KEY ใน Cloudflare Worker"
          },
          500
        );
      }

      if (!env.CORPUS_USER) {
        return sendJson(
          {
            success: false,
            message:
              "ยังไม่ได้ตั้งค่า CORPUS_USER ใน Cloudflare Worker"
          },
          500
        );
      }

      if (!env.CORPUS_PASS) {
        return sendJson(
          {
            success: false,
            message:
              "ยังไม่ได้ตั้งค่า CORPUS_PASS ใน Cloudflare Worker"
          },
          500
        );
      }

      /*
       * ตรวจ API Key
       */
      const requestApiKey =
        request.headers.get("x-api-key") || "";

      if (requestApiKey !== env.API_KEY) {
        return sendJson(
          {
            success: false,
            message: "API Key ไม่ถูกต้อง"
          },
          401
        );
      }

      /*
       * อ่าน JSON จากหน้าเว็บ
       */
      let requestData;

      try {
        requestData = await request.json();
      } catch {
        return sendJson(
          {
            success: false,
            message: "Request body ไม่ใช่ JSON"
          },
          400
        );
      }

      const registrationId = String(
        requestData.registrationId || ""
      )
        .replace(/\D/g, "")
        .trim();

      if (!/^\d{13}$/.test(registrationId)) {
        return sendJson(
          {
            success: false,
            message:
              "เลขทะเบียนนิติบุคคลต้องเป็นตัวเลข 13 หลัก"
          },
          400
        );
      }

      /*
       * ขอ Token จาก CorpusX
       */
      const tokenResponse = await fetchWithTimeout(
        TOKEN_URL,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify({
            grant_type: "password",
            username: env.CORPUS_USER,
            password: env.CORPUS_PASS,
            language: "TH"
          })
        },
        20000
      );

      const tokenText =
        await tokenResponse.text();

      let tokenData;

      try {
        tokenData = tokenText
          ? JSON.parse(tokenText)
          : {};
      } catch {
        return sendJson(
          {
            success: false,
            stage: "login",
            message:
              "CorpusX Login ส่งข้อมูลกลับมาไม่ใช่ JSON",
            status: tokenResponse.status,
            response: tokenText.substring(0, 500)
          },
          502
        );
      }

      if (!tokenResponse.ok) {
        return sendJson(
          {
            success: false,
            stage: "login",
            message: "CorpusX Login ไม่สำเร็จ",
            status: tokenResponse.status,
            response: tokenData
          },
          502
        );
      }

      const accessToken =
        tokenData.access_token ||
        tokenData.accessToken ||
        tokenData.token ||
        "";

      if (!accessToken) {
        return sendJson(
          {
            success: false,
            stage: "login",
            message:
              "CorpusX ไม่ได้ส่ง Access Token กลับมา",
            response: tokenData
          },
          502
        );
      }

      /*
       * ค้นหาข้อมูลบริษัท
       */
      const searchResponse = await fetchWithTimeout(
        SEARCH_URL,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization:
              `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            systemId: "1",
            registrationId: registrationId,
            companyName: "",
            status: "2",
            dataSet: "7",
            periodFrom: "0",
            periodTo: "0",
            fsType: "2",
            language: "TH"
          })
        },
        30000
      );

      const searchText =
        await searchResponse.text();

      let searchData;

      try {
        searchData = searchText
          ? JSON.parse(searchText)
          : {};
      } catch {
        return sendJson(
          {
            success: false,
            stage: "search",
            message:
              "CorpusX Search ส่งข้อมูลกลับมาไม่ใช่ JSON",
            status: searchResponse.status,
            response: searchText.substring(0, 1000)
          },
          502
        );
      }

      if (!searchResponse.ok) {
        return sendJson(
          {
            success: false,
            stage: "search",
            message: "CorpusX Search ไม่สำเร็จ",
            status: searchResponse.status,
            response: searchData
          },
          502
        );
      }

      /*
       * ส่ง JSON กลับหน้าเว็บ
       */
      return sendJson(
        {
          success: true,
          registrationId: registrationId,
          retrievedAt: new Date().toISOString(),
          data: searchData
        },
        200
      );
    } catch (error) {
      console.error("Worker exception:", error);

      return sendJson(
        {
          success: false,
          message: "Worker เกิดข้อผิดพลาด",
          errorName: error?.name || "Error",
          detail: error?.message || String(error)
        },
        error?.name === "AbortError" ? 504 : 500
      );
    }
  }
};

function sendJson(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers: {
        ...CORS_HEADERS,
        "Content-Type":
          "application/json; charset=UTF-8"
      }
    }
  );
}

async function fetchWithTimeout(
  url,
  options,
  timeoutMilliseconds
) {
  const controller = new AbortController();

  const timeoutId = setTimeout(
    () => controller.abort(),
    timeoutMilliseconds
  );

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
