[![Build Status](https://travis-ci.org/wurdcms/wurd-node.svg?branch=master)](https://travis-ci.org/wurdcms/wurd-node)

# wurd-node
Wurd CMS client for Node.
Includes Express middleware and view helpers.


## Install
```javascript
npm i --save wurd
```


## Simple example
```javascript
var wurd = require('wurd').connect('myapp');

wurd.load('homepage', function(err, content) {
  if (err) {/*...*/};
  
  console.log(content);
  /*
  {
    homepage: {
      title: 'My blog',
      author: 'John Smith',
      content: 'Lorem ipsum...'
    }
  }
  */
});
```


## Full example in an Express app
```javascript
var express = require('express');

var wurd = require('wurd').connect('myapp', {
  draft: (process.env.NODE_ENV === 'development') //In draft mode changes are reflected instantly
});


var app = module.exports = express();

//Make the helper function available to the view
app.locals = {
  t: wurd.t
}

//Load common content so it is available to all routes automatically
app.use(wurd.middleware('common'));

//Routes
//Load a specific page's content
app.get('/', wurd.middleware('home'), function(req, res, next) {
  res.render('home.ejs');
});


app.listen(3000);
```
