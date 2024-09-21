const path = require('path');

module.exports = {
  i18n: {
    defaultLocale: 'es-AR',
    locales: ['es-AR', 'en-US'],
    localeDetection: false,
    localePath: path.resolve('./public/locales'),
  },
};
