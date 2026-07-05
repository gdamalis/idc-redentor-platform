const { buildSecurityHeaders } = require("./securityHeaders");

module.exports = async () => {
  const previewLike =
    process.env.VERCEL_ENV === "preview" ||
    process.env.NODE_ENV === "development";
  return [
    {
      source: "/:path*",
      headers: buildSecurityHeaders({ previewLike }),
    },
  ];
};
