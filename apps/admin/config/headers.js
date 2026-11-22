const { buildAdminSecurityHeaders } = require("./securityHeaders");

module.exports = async () => [
  {
    source: "/:path*",
    headers: buildAdminSecurityHeaders(),
  },
];
