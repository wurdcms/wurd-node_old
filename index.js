'use strict';

var async = require('async');
var superagent = require('superagent');
var _ = require('underscore');

var config = require('./config');
var viewHelpers = require('./view-helpers');

var _options;

var cache = {};


var wurd = {};

wurd.t = viewHelpers.t;

/**
 * @param {Object} options
 * @param {String} options.app        App name
 * @param {Boolean} options.draft     Whether to load draft content. Defaults to false, so published content is returned.
 * @param {String[]} options.preload  Paths of sections to preload
 */
wurd.initialize = function(options) {
  if (!options.app) throw new Error('Missing required option "app"');

  _options = _.extend({
    draft: false
  }, options);

  if (options.preload) {
    wurd.load(options.preload, function(err, result) {
      if (err) return console.error('Error preloading Wurd content: ', err);
    });
  }

  if (options.draft) {
    console && console.warn('WARNING: Wurd is in draft mode. Make sure to turn this off for production!');
  }

  return wurd;
};


/**
 * Loads page contents
 *
 * @param {String|String[]} pages     Page name (or array of multiple page names)
 * @param {String} [lang]             Language name e.g. 'en', 'fr'
 * @param {Function} cb               Callback({Error} err, {Object} res)
 */
wurd.load = function(pages, lang, cb) {
  //Normalise arguments
  if (arguments.length === 2) { //pages, cb
    cb = lang;
    lang = null;
  }

  //Normalise string to array of strings
  if (!Array.isArray(pages)) {
    pages = [pages];
  }

  var result = {};

  async.each(pages, function(page, cb) {
    //Draft content - always fetch latest version from server
    if (_options.draft) {
      wurd.fetchContent(page, lang, function(err, content) {
        if (err) return cb(err);

        result[page] = content;

        cb();
      });
    }

    //Published content - load from cache
    else {
      //Load from cache
      var content = wurd.loadFromCache(page, lang);
      if (content) {
        result[page] = content;
        return cb();
      }

      //Fetch from server
      wurd.fetchContent(page, lang, function(err, content) {
        if (err) return cb(err);

        result[page] = content;

        cb();
      });
    }
  }, function(err) {
    cb(err, result);
  });
};


/**
 * Saves a section to the local cache
 *
 * @param {String} page
 * @param {String} lang
 * @param {Object} content
 */
wurd.saveToCache = function(page, lang, content) {
  var key = page+lang;

  cache[key] = {
    time: Date.now(),
    content: content
  };
};


/**
 * Loads a section from the cache.
 * If the content has expired it will be fetched so it is fresh on the next request.
 *
 * @param {String} page
 * @param {String} lang
 *
 * @return {Object}
 */
wurd.loadFromCache = function(page, lang) {
  var key = page+lang;

  var val = cache[key];
  if (!val) return null;

  var age = Date.now() - val.time;

  if (age > config.maxAgeMs) {
    wurd.fetchContent(page, lang);
  }

  return val.content;
};


/**
 * Loads a section from the server
 *
 * @param {String} page
 * @param {String} lang
 * @param {Function} cb       Callback({Error}, {Object})
 */
wurd.fetchContent = function(page, lang, cb) {
  //console.log(`Fetching content from server: ${page} (${lang})`);

  var url = `${config.api.url}/content/${_options.app}/${page}`;

  var request = superagent.get(url);

  if (_options.draft) {
    request.query({ draft: 1 });
  }

  if (lang) {
    request.query({ lang: lang });
  }

  request.end(function(err, res) {
    if (err) return cb(err);

    if (res.ok) {
      var content = res.body;

      wurd.saveToCache(page, lang, content);

      if (cb) cb(null, content);
    } else {
      if (res.unauthorized) return cb(new Error('wurd Authorization failed'));

      if (cb) {
        cb(res.error);
      }
    }
  });
}


/**
 * Express middleware for loading content on to the request
 *
 * @param {String|String[]} pages
 * @param {String} [lang]
 */
wurd.middleware = function(pages, lang) {
  return function(req, res, next) {
    var reqLang = req.language || req.lang || lang;

    wurd.load(pages, reqLang, function(err, content) {
      if (err) return next(err);

      res.locals.wurd = res.locals.wurd || {};

      _.extend(res.locals.wurd, content);

      next();
    });
  };
}


/**
 * Loads a page using a name from a URL parameter
 * This is useful for when loading shared templates and populating them with content from Wurd. E.g. site.com/:pageName
 *
 * @param {String} paramName        The name of the query parameter
 * @param {String} [contentName]    The key to use when accessing content within the page. Defaults to the paramName.
 */
wurd.loadByParam = function(paramName, contentName) {
  contentName = contentName || paramName;

  return function(req, res, next) {
    var page = req.params[paramName];
      
    wurd.middleware(page)(req, res, function(err) {
      if (err) {
        if (err.status === 404) return next('route');

        return next(err);
      }

      res.locals.wurd = res.locals.wurd || {};

      res.locals.wurd[contentName] = res.locals.wurd[page];

      next();
    });
  }
};


module.exports = wurd;
