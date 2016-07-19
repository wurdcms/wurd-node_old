var express = require('express'),
    markdown = require('marked'),
    Wurd = require('../../');


var app = module.exports = express();

//Setup app
app.set('views', __dirname + '/views');

//Setup Wurd instance
var wurd = Wurd.connect('wurd-example-simple', {
  //In draft mode changes are reflected instantly, without publishing
  draft: true
});


//Make the helper function available to the view
app.locals = {
  t: wurd.t,
  markdown: markdown
}

//Load common content so it is available to all routes automatically
app.use(wurd.middleware('common'));

//Routes
//Load a specific page's content
app.get('/', wurd.middleware('home'), function(req, res, next) {
  res.render('home.ejs');
});

//With a shared template we can load page content dynamically based on the page name
app.get('/:page', wurd.loadByParam('page'), function(req, res, next) {
  var page = req.params.page;

  res.render('text.ejs', {
    page: page
  });
});


//Start server
if (!module.parent) {
  var port = process.env.PORT || 3000;
  app.listen(port);
  console.log("Express server listening on port %d", port);
}
