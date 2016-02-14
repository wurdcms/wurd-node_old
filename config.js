'use strict';

module.exports = {
  api: {
    url: process.env.WURD_API_URL || 'https://api.wurd.io'
  },

  maxAgeMs: 60*1000 //1 minute
};
