export default {
  async fetch(request) {
    return Response.json({
      ok: true,
      name: "pg-templeidle",
      path: new URL(request.url).pathname,
    });
  },
};
