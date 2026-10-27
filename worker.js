export default {

  async fetch(request, env) {

    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "Content-Type,x-api-key",
      "Access-Control-Allow-Methods":
        "POST,OPTIONS"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: cors
      });
    }

    const apiKey =
      request.headers.get("x-api-key");

    if (apiKey !== env.API_KEY) {

      return Response.json(
        {
          success:false,
          message:"Unauthorized"
        },
        {
          status:401,
          headers:cors
        }
      );

    }

    try {

      const body =
        await request.json();

      const loginResp =
        await fetch(
          "https://corpusxapi.bol.co.th/api/v1/token/token",
          {
            method:"POST",
            headers:{
              "Content-Type":
                "application/json"
            },
            body:JSON.stringify({
              grant_type:"password",
              username:
                env.CORPUS_USER,
              password:
                env.CORPUS_PASS,
              language:"TH"
            })
          }
        );

      const loginData =
        await loginResp.json();

      const token =
        loginData.access_token;

      const searchResp =
        await fetch(
          "https://corpusxfrontapi.bol.co.th/ApiFrontend/bol_service/get/data",
          {
            method:"POST",
            headers:{
              "Content-Type":
                "application/json",
              Authorization:
                `Bearer ${token}`
            },
            body:JSON.stringify({
              systemId:"1",
              registrationId:
                body.registrationId,
              status:"2",
              dataSet:"7",
              periodFrom:"2021",
              periodTo:"2025",
              fsType:"2",
              language:"TH"
            })
          }
        );

      const result =
        await searchResp.json();

      try {

        await fetch(
          "https://corpusxapi.bol.co.th/api/v1/token/logout",
          {
            method:"POST",
            headers:{
              Authorization:
                `Bearer ${token}`
            }
          }
        );

      } catch(e){}

      return Response.json(
        result,
        {
          headers:cors
        }
      );

    } catch(err){

      return Response.json(
        {
          success:false,
          message:err.message
        },
        {
          status:500,
          headers:cors
        }
      );

    }

  }

}
