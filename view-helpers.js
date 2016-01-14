'use strict';

var getPath = require('get-property-value');


/**
 * View helper for getting content
 *
 * @param {String} path               Key/path to the content e.g. 'main.nav.brand'
 * @param {Mixed} [defaultValue]      Return this content if path not found
 */
exports.t = function(path, defaultValue) {
  defaultValue = defaultValue || path;

  if (!this.wurd) {
    console.error('Wurd content has not been loaded');
    return defaultValue;
  }

  var content = getPath(this.wurd, path);

  return content || defaultValue;
};
