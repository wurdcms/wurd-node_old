/**
 * Middleware for language detection
 *
 * Checks for the user's preferred language
 * If a query param is passed (?lang=xx) then that is used
 * Otherwise if a cookie is found from a previous visit that is used
 * Lastly fall back to the browser preferences (accept-language)
 *
 * The language code is stored on req.lang
 */

var acceptLanguage = require('accept-language');

/**
 * @param {String[]} supportedLanguages       Supported language codes in order of preference e.g. ['en', 'zh']
 */
module.exports = function(supportedLanguages) {
  acceptLanguage.languages(supportedLanguages);

  return function(req, res, next) {
    var preferredLang = req.query.lang 
      || req.cookies && req.cookies.lang 
      || req.header('accept-language') 
      || supportedLanguages[0];

    //Convert 'en' style to 'en-US' style to work with acceptLanguage
    if (preferredLang.length === 2) preferredLang += '-xx';

    //If requesting a forced change of language with ?lang=xx in the URL, then set a cookie to remember next time
    if (req.query.lang) {
      res.cookie('lang', req.query.lang, {
        maxAge: 365*86400*1000 //1 year
      });
    }

    //Get the closest match from acceptable languages
    req.lang = acceptLanguage.get(preferredLang);

    next();
  };
};
