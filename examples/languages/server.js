var express = require('express'),
    markdown = require('marked'),
    wurd = require('../../'),
    detectLanguage = require('./detect-language');


var app = module.exports = express();

//Setup app
app.set('views', __dirname + '/views');

//Detect the chosen language
app.use(detectLanguage(['en', 'fr', 'es']));

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
  app.listen(3000);
  console.log("Express server listening on port 3000");
}
