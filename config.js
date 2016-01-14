'use strict';

module.exports = {
  api: {
    url: process.env.WURD_API_URL || 'https://api-v2.wurd.io/v1'
  },

  maxAgeMs: 60*1000 //1 minute
};
