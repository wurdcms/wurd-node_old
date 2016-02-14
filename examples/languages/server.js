var express = require('express'),
    markdown = require('marked'),
    cookieParser = require('cookie-parser'),
    requestLanguage = require('express-request-language'),
    wurd = require('../../');


var app = module.exports = express();

//Setup app
app.set('views', __dirname + '/views');

//Detect the chosen language
app.use(cookieParser());

app.use(requestLanguage({
  languages: ['en', 'fr', 'es'],
  queryName: 'language',
  cookie: { name: 'language' }
}));

//Setup Wurd
wurd.initialize({
  app: 'wurd-example-languages',
  draft: (process.env.NODE_ENV === 'development')
});

//Make the helper function available to the view
app.locals = {
  t: wurd.t,
  markdown: markdown
}

//Routes
app.get('/', wurd.middleware(['langs', 'main']), function(req, res, next) {
  res.render('main.ejs');
});


//Start server
if (!module.parent) {
  var port = process.env.PORT || 3000;
  app.listen(port);
  console.log("Express server listening on port %d", port);
}
