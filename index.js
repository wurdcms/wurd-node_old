'use strict';

var async = require('async');
var superagent = require('superagent');
var _ = require('underscore');
var cache = require('memory-cache');

var config = require('./config');
var viewHelpers = require('./view-helpers');

//var _options;

//var cache = {};

class Wurd {
  /**
   * Convenience method for creating and returning a new Wurd instance
   * @param {String} app
   * @param {Object} [options]            See constructor options
   */
  static connect(app, options) {
    return new Wurd(app, options);
  }


  /**
   * @param {String} app
   * @param {Object} [options]
   * @param {String} [options.lang]               Language name e.g. 'default', 'en', 'fr' etc.
   * @param {Boolean} [options.draft]             Whether to load draft content. Defaults to false, so published content is returned.
   * @param {String|String[]} [options.preload]   Pages to load automatically
   */
  constructor(app, options) {
    this.app = app;

    this.options = Object.assign({}, {
      draft: false,
      lang: 'default',
      preload: null
    }, options);

    //Preload content
    if (this.options.preload) {
      this.load(this.options.preload, (err, result) => {
        if (err) return console.error('Error preloading Wurd content: ', err);
      });
    }

    //Make t() available for getting content in the view
    this.t = viewHelpers.t;
  }


  /**
   * Loads page(s) content
   *
   * @param {String|String[]} pages         Page name (or array of multiple page names)
   * @param {Object} [options]
   * @param {String} [options.lang]         Language name e.g. 'default', 'en', 'fr' etc.
   * @param {Boolean} [options.draft]       Whether to load draft content. Defaults to false, so published content is returned.
   * 
   * @param {Function} cb                   Callback({Error} err, {Object} content)
   */
  load(pages, options, cb) {
    //Normalise arguments
    if (arguments.length === 2) { //pages, cb
      cb = options;
      options = {};
    }

    //Normalise string to array of strings
    if (!Array.isArray(pages)) {
      pages = [pages];
    }

    //Merge options
    options = _.extend({}, this.options, options);

    //Draft content - always fetch latest version from server
    if (options.draft) {
      return this._fetchContent(pages, options, cb);
    }

    //Published content - load from cache if possible
    else {
      var allContent = {};
      var uncachedPages = [];

      //Find all pages available in cache
      pages.forEach(page => {
        var content = this._loadFromCache(page, options.lang);
        if (content) {
          //console.log('FROM CACHE: '+page);
          allContent[page] = content;
        } else {
          //console.log('FROM SERVER: '+page);
          uncachedPages.push(page);
        }
      });

      //Fetch remaining pages from server
      if (uncachedPages.length) {
        this._fetchContent(uncachedPages, options, (err, content) => {
          if (err) return cb(err);

          _.extend(allContent, content);

          return cb(null, allContent);
        });
      } else {
        return cb(null, allContent);
      }
    }
  }


  /**
   * Express middleware for loading content on to the request
   *
   * @param {String|String[]} pages
   * @param {Object} [options]
   * @param {String} [options.lang]         Language name e.g. 'default', 'en', 'fr' etc.
   * @param {Boolean} [options.draft]       Whether to load draft content. Defaults to false, so published content is returned.
   */
  middleware(pages, options) {
    //Merge options
    options = _.extend({}, this.options, options);

    return (req, res, next) => {
      options.lang = req.language || req.lang || options.lang;

      this.load(pages, options, (err, content) => {
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
  loadByParam(paramName, contentName) {
    contentName = contentName || paramName;

    return (req, res, next) => {
      var page = req.params[paramName];
        
      this.middleware(page)(req, res, function(err) {
        if (err) {
          if (err.status === 404) return next('route');

          return next(err);
        }

        res.locals.wurd = res.locals.wurd || {};

        res.locals.wurd[contentName] = res.locals.wurd[page];

        next();
      });
    }
  }


  /**
   * Loads page(s) content from the server
   *
   * @param {String|String[]} pages
   * @param {Object} [options]
   * @param {String} [options.lang]         Language name e.g. 'default', 'en', 'fr' etc.
   * @param {Boolean} [options.draft]       Whether to load draft content. Defaults to false, so published content is returned.
   * @param {Function} cb                   Callback({Error}, {Object})
   */
  _fetchContent(pages, options, cb) {
    //console.log(`Fetching content from server: ${page} (${lang})`);

    //Normalise string to array of strings
    if (!Array.isArray(pages)) {
      pages = [pages];
    }

    var url = `${config.api.url}/v2/content/${this.app}/${pages.join(',')}`;

    var request = superagent.get(url);

    if (options.draft) {
      request.query({ draft: 1 });
    }

    if (options.lang) {
      request.query({ lang: options.lang });
    }

    //console.log('fetching', request.url, request.qs);

    request.end((err, res) => {
      if (err) return cb(err);

      if (res.ok) {
        var content = res.body;

        //Save pages to cache
        _.each(content, (pageContent, pageName) => {
          this._saveToCache(pageName, options.lang, pageContent);
        });

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
   * Saves a section to the local cache
   *
   * @param {String} page
   * @param {String} lang
   * @param {Object} content
   */
  _saveToCache(page, lang, content) {
    var key = page+lang;

    cache.put(key, content, config.maxAgeMs);
  }


  /**
   * Loads a section from the cache.
   * If the content has expired it will be fetched so it is fresh on the next request.
   *
   * @param {String} page
   * @param {String} lang
   *
   * @return {Object}
   */
  _loadFromCache(page, lang) {
    var key = page+lang;

    return cache.get(key);
  }
}

//Wurd.t = viewHelpers.t;


/*var wurd = {};

wurd.t = viewHelpers.t;*/

/**
 * Sets up the Wurd instance; to be called first with app name and default options
 *
 * @param {Object} options
 * @param {String} options.app          App name
 * @param {String} [options.lang]       Language name e.g. 'default', 'en', 'fr' etc.
 * @param {Boolean} [options.draft]     Whether to load draft content. Defaults to false, so published content is returned.
 * @param {String[]} [options.preload]  Paths of sections to preload
 */
/*wurd.initialize = function(options) {
  if (!options.app) throw new Error('Missing required option "app"');

  _options = _.extend({
    draft: false,
    lang: 'default',
    preload: null
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
};*/


/**
 * Loads page contents
 *
 * @param {String|String[]} pages         Page name (or array of multiple page names)
 * @param {Object} [options]
 * @param {String} [options.lang]         Language name e.g. 'default', 'en', 'fr' etc.
 * @param {Boolean} [options.draft]       Whether to load draft content. Defaults to false, so published content is returned.
 * 
 * @param {Function} cb                   Callback({Error} err, {Object} res)
 */
/*wurd.load = function(pages, options, cb) {
  //Normalise arguments
  if (arguments.length === 2) { //pages, cb
    cb = options;
    options = {};
  }

  //Normalise string to array of strings
  if (!Array.isArray(pages)) {
    pages = [pages];
  }

  //Merge options
  options = _.extend({}, _options, options);

  //Draft content - always fetch latest version from server
  if (options.draft) {
    return wurd._fetchContent(pages, options, cb);
  }

  //Published content - load from cache if possible
  else {
    var allContent = {};
    var uncachedPages = [];

    //Find all pages available in cache
    pages.forEach(function(page) {
      var content = wurd._loadFromCache(page, options.lang);
      if (content) {
        //console.log('FROM CACHE: '+page);
        allContent[page] = content;
      } else {
        //console.log('FROM SERVER: '+page);
        uncachedPages.push(page);
      }
    });

    //Fetch remaining pages from server
    if (uncachedPages.length) {
      wurd._fetchContent(uncachedPages, options, function(err, content) {
        if (err) return cb(err);

        _.extend(allContent, content);

        return cb(null, allContent);
      });
    } else {
      return cb(null, allContent);
    }
  }
};*/


/**
 * Express middleware for loading content on to the request
 *
 * @param {String|String[]} pages
 * @param {Object} [options]
 * @param {String} [options.lang]         Language name e.g. 'default', 'en', 'fr' etc.
 * @param {Boolean} [options.draft]       Whether to load draft content. Defaults to false, so published content is returned.
 */
/*wurd.middleware = function(pages, options) {
  //Merge options
  options = _.extend({}, _options, options);

  return function(req, res, next) {
    options.lang = req.language || req.lang || options.lang;

    wurd.load(pages, options, function(err, content) {
      if (err) return next(err);

      res.locals.wurd = res.locals.wurd || {};

      _.extend(res.locals.wurd, content);

      next();
    });
  };
}*/


/**
 * Loads a page using a name from a URL parameter
 * This is useful for when loading shared templates and populating them with content from Wurd. E.g. site.com/:pageName
 *
 * @param {String} paramName        The name of the query parameter
 * @param {String} [contentName]    The key to use when accessing content within the page. Defaults to the paramName.
 */
/*wurd.loadByParam = function(paramName, contentName) {
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
};*/


/**
 * Saves a section to the local cache
 *
 * @param {String} page
 * @param {String} lang
 * @param {Object} content
 */
/*wurd._saveToCache = function(page, lang, content) {
  var key = page+lang;

  cache.put(key, content, config.maxAgeMs);
};*/


/**
 * Loads a section from the cache.
 * If the content has expired it will be fetched so it is fresh on the next request.
 *
 * @param {String} page
 * @param {String} lang
 *
 * @return {Object}
 */
/*wurd._loadFromCache = function(page, lang) {
  var key = page+lang;

  return cache.get(key);
};*/


/**
 * Loads a section from the server
 *
 * @param {String|String[]} pages
 * @param {Object} [options]
 * @param {String} [options.lang]         Language name e.g. 'default', 'en', 'fr' etc.
 * @param {Boolean} [options.draft]       Whether to load draft content. Defaults to false, so published content is returned.
 * @param {Function} cb                   Callback({Error}, {Object})
 */
/*wurd._fetchContent = function(pages, options, cb) {
  //console.log(`Fetching content from server: ${page} (${lang})`);

  //Normalise string to array of strings
  if (!Array.isArray(pages)) {
    pages = [pages];
  }

  var url = `${config.api.url}/v2/content/${options.app}/${pages.join(',')}`;

  var request = superagent.get(url);

  if (options.draft) {
    request.query({ draft: 1 });
  }

  if (options.lang) {
    request.query({ lang: options.lang });
  }

  //console.log('fetching', request.url, request.qs);

  request.end(function(err, res) {
    if (err) return cb(err);

    if (res.ok) {
      var content = res.body;

      //Save pages to cache
      _.each(content, function(pageContent, pageName) {
        wurd._saveToCache(pageName, options.lang, pageContent);
      });

      if (cb) cb(null, content);
    } else {
      if (res.unauthorized) return cb(new Error('wurd Authorization failed'));

      if (cb) {
        cb(res.error);
      }
    }
  });
}*/


//module.exports = wurd;
module.exports = Wurd;
