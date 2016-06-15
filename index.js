'use strict';

var superagent = require('superagent');
var _ = require('underscore');
var cache = require('memory-cache');

var config = require('./config');
var viewHelpers = require('./view-helpers');


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
    options = Object.assign({}, this.options, options);

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

          Object.assign(allContent, content);

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
   * @param {Object} [options]          See constructor options
   */
  middleware(pages, options) {
    var self = this;

    //Merge options
    options = Object.assign({}, this.options, options);

    return function(req, res, next) {
      //Get the user preferred language, fall back to the default language
      options.lang = req.language || options.lang;

      self.load(pages, options, function(err, content) {
        if (err) return next(err);

        res.locals = res.locals || {};
        res.locals.wurd = res.locals.wurd || {};

        Object.assign(res.locals.wurd, content);

        next();
      });
    };
  }


  /**
   * Loads a page using a name from a URL parameter
   * This is useful for when loading shared templates and populating them with content from Wurd. E.g. example.com/:pageName
   *
   * @param {String} paramName              The name of the query parameter
   * @param {Object} [options]              See constructor options
   * @param {String} [options.contentName]  The key to use when accessing content within the page. Defaults to the paramName.
   */
  loadByParam(paramName, options) {
    var self = this;

    //Merge options
    options = Object.assign({}, this.options, options);

    //Determine the name that will be used within templates for accessing page content
    var contentName = options.contentName || paramName;

    return function(req, res, next) {
      //Get the page name from the request URL parameters
      var page = req.params[paramName];

      //Get the user preferred language, fall back to the default language
      options.lang = req.language || options.lang;

      self.load(page, options, function(err, content) {
        if (err) return next(err);

        res.locals = res.locals || {};
        res.locals.wurd = res.locals.wurd || {};

        res.locals.wurd[contentName] = content[page];

        next();
      });
    };
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


module.exports = Wurd;
