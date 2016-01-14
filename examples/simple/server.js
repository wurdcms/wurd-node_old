var express = require('express'),
    markdown = require('marked'),
    wurd = require('../../');


var app = module.exports = express();

//Setup app
app.set('views', __dirname + '/views');

//Setup Wurd
wurd.initialize({
  app: 'wurd-example-simple',
  draft: (process.env.NODE_ENV === 'development')
});

//Make the helper function available to the view
app.locals = {
  t: wurd.t,
  markdown: markdown
}

//Load common content so it is available to all routes automatically
app.use(wurd.middleware('common'));

//Routes
app.get('/', wurd.middleware('home'), function(req, res, next) {
  res.render('home.ejs');
});

app.get('/:page', wurd.loadByParam('page'), function(req, res, next) {
  res.render('text.ejs');
});


//Start server
if (!module.parent) {
  app.listen(3000);
  console.log("Express server listening on port 3000");
}
