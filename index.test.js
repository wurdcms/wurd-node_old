var test = require('assert'),
    _ = require('underscore'),
    sinon = require('sinon');

//Shortcut
var same = test.strictEqual;

var Wurd = require('./index');


describe('wurd-node', function() {

  beforeEach(function() {
    this.sinon = sinon.sandbox.create();
  });

  afterEach(function() {
    this.sinon.restore();
  });


  describe('connect()', function() {
    it('returns a new instance with default options', function() {
      var wurd = Wurd.connect('test');

      test.ok(wurd instanceof Wurd);

      same(wurd.app, 'test');

      test.deepEqual(wurd.options, {
        draft: false, 
        lang: 'default', 
        preload: null
      });
    });

    it('returns a new instance with custom options', function() {
      var wurd = Wurd.connect('test', { draft: true });

      test.ok(wurd instanceof Wurd);

      same(wurd.app, 'test');

      test.deepEqual(wurd.options, {
        draft: true, 
        lang: 'default', 
        preload: null
      });
    });
  });


  describe('constructor', function() {
    beforeEach(function() {
      this.sinon.stub(Wurd.prototype, 'load');
    });


    it('creates an instance with app and default options', function() {
      var wurd = new Wurd('foo');

      test.ok(wurd instanceof Wurd);

      same(wurd.app, 'foo');

      test.deepEqual(wurd.options, {
        draft: false, 
        lang: 'default', 
        preload: null
      });

      //Doesn't preload
      same(wurd.load.callCount, 0);
    });

    it('creates an instance with custom options', function() {
      var wurd = new Wurd('xyz', {
        draft: true,
        lang: 'en'
      });

      test.ok(wurd instanceof Wurd);

      same(wurd.app, 'xyz');

      same(wurd.options.draft, true);
      same(wurd.options.lang, 'en');
    });


    describe('with "preload" option', function() {
      it('preloads pages', function() {
        var wurd = new Wurd('xyz', {
          preload: ['foo', 'bar']
        });

        test.ok(wurd instanceof Wurd);

        same(wurd.app, 'xyz');

        same(wurd.load.callCount, 1);
        test.deepEqual(wurd.load.args[0][0], ['foo', 'bar']);
      });
    });
  });


  describe('#load()', function() {
    var wurd;

    beforeEach(function() {
      wurd = new Wurd('foo');

      this.sinon.stub(wurd, '_loadFromCache');
      this.sinon.stub(wurd, '_fetchContent').yields();
    });

    it('works with a single page', function(done) {
      wurd._fetchContent.yields(null, {
        page1: { foo: 'bar' }
      });

      wurd.load('page1', function(err, content) {
        if (err) return done(err);

        test.deepEqual(content, {
          page1: { foo: 'bar' }
        });

        done();
      });
    });

    it('loads from cache if available', function(done) {
      wurd._loadFromCache.withArgs('page1').returns({ foo: 'a' });
      wurd._loadFromCache.withArgs('page2').returns({ foo: 'b' });

      wurd.load(['page1', 'page2'], function(err, content) {
        if (err) return done(err);

        test.deepEqual(content, {
          page1: { foo: 'a' },
          page2: { foo: 'b' }
        });

        done();
      });
    });

    it('loads content from server if not in cache', function(done) {
      wurd._fetchContent.withArgs(['page1', 'page2']).yields(null, {
        page1: { a: 'A' },
        page2: { b: 'B' }
      });

      wurd.load(['page1', 'page2'], function(err, content) {
        if (err) return done(err);

        test.deepEqual(content, {
          page1: { a: 'A' },
          page2: { b: 'B' }
        });

        done();
      });
    });

    it('loads from both cache and server', function(done) {
      wurd._loadFromCache.withArgs('page2').returns({ b: 'B' });

      wurd._fetchContent.withArgs(['page1', 'page3']).yields(null, {
        page1: { a: 'A' },
        page3: { c: 'C' }
      });

      wurd.load(['page1', 'page2', 'page3'], function(err, content) {
        if (err) return done(err);

        test.deepEqual(content, {
          page1: { a: 'A' },
          page2: { b: 'B' },
          page3: { c: 'C' },
        });

        same(wurd._fetchContent.callCount, 1);
        test.deepEqual(wurd._fetchContent.args[0][0], ['page1', 'page3']);

        done();
      });
    });


    describe('with draft option on client', function() {
      it('always loads from the server', function(done) {
        wurd.options.draft = true;

        wurd._fetchContent.withArgs(['page1']).yields(null, {
          page1: { a: 'A' }
        });

        wurd.load('page1', function(err, content) {
          if (err) return done(err);

          test.deepEqual(content, {
            page1: { a: 'A' }
          });

          same(wurd._loadFromCache.callCount, 0);

          done();
        });
      });
    });


    describe('with draft option override', function() {
      it('always loads from server', function(done) {
        wurd.options.draft = false;

        wurd._fetchContent.withArgs(['page1']).yields(null, {
          page1: { a: 'A' }
        });

        wurd.load('page1', { draft: true }, function(err, content) {
          if (err) return done(err);

          test.deepEqual(content, {
            page1: { a: 'A' }
          });

          same(wurd._loadFromCache.callCount, 0);

          done();
        });
      });
    });


    describe('with lang option on client', function() {
      it('gets cached pages with correct lang', function(done) {
        wurd.options.lang = 'en';

        wurd._loadFromCache.returns({ foo: 'bar' });

        wurd.load('foo', function(err, content) {
          if (err) return done(err);

          test.deepEqual(content, {
            foo: { foo: 'bar' }
          });

          same(wurd._loadFromCache.args[0][0], 'foo');
          same(wurd._loadFromCache.args[0][1], 'en');

          done();
        });
      });

      it('fetches from server with correct lang', function(done) {
        wurd.options.lang = 'en';

        wurd._fetchContent.yields(null, {
          page1: { foo: 'bar' }
        });

        wurd.load('page1', function(err, content) {
          if (err) return done(err);

          test.deepEqual(content, {
            page1: { foo: 'bar' }
          });

          test.deepEqual(wurd._fetchContent.args[0][0], ['page1']);
          same(wurd._fetchContent.args[0][1].lang, 'en');

          done();
        });
      });
    });


    describe('with lang option override', function() {
      it('gets cached pages with correct lang', function(done) {
        wurd.options.lang = 'default';

        wurd._loadFromCache.returns({ foo: 'bar' });

        wurd.load('foo', { lang: 'fr' }, function(err, content) {
          if (err) return done(err);

          test.deepEqual(content, {
            foo: { foo: 'bar' }
          });

          same(wurd._loadFromCache.args[0][0], 'foo');
          same(wurd._loadFromCache.args[0][1], 'fr');

          done();
        });
      });

      it('fetches from server with correct lang', function(done) {
        wurd.options.lang = 'en';

        wurd._fetchContent.yields(null, {
          page1: { foo: 'bar' }
        });

        wurd.load('page1', { lang: 'fr' }, function(err, content) {
          if (err) return done(err);

          test.deepEqual(content, {
            page1: { foo: 'bar' }
          });

          test.deepEqual(wurd._fetchContent.args[0][0], ['page1']);
          same(wurd._fetchContent.args[0][1].lang, 'fr');

          done();
        });
      });
    });
  });


  describe('#middleware()', function() {
    var wurd;
    var req, res;

    beforeEach(function() {
      wurd = new Wurd('foo');

      req = {};
      res = {};

      this.sinon.stub(wurd, 'load').yields(null, {});
    });

    it('returns a Connect/Express middleware function', function(done) {
      var fn = wurd.middleware('page1');

      fn(req, res, function(err) {
        if (err) return done(err);

        test.deepEqual(res.locals, {
          wurd: {}
        });

        done();
      });
    });

    describe('the middleware', function() {
      it('loads content onto the response', function(done) {
        wurd.load.withArgs('page1').yields(null, {
          page1: { a: 'A' }
        });

        var fn = wurd.middleware('page1');

        fn(req, res, function(err) {
          if (err) return done(err);
          
          test.deepEqual(res.locals, {
            wurd: {
              page1: { a: 'A' }
            }
          });

          done();
        });
      });

      describe('with languages', function() {
        it('first checks for "language" on the request', function(done) {
          req.language = 'fr';

          var fn = wurd.middleware('foo');

          fn(req, res, function(err) {
            if (err) return done(err);
            
            same(wurd.load.args[0][1].lang, 'fr');

            done();
          });
        });

        it('then checks options.lang', function(done) {
          wurd.options.lang = 'en';

          var fn = wurd.middleware('foo', { lang: 'de' });

          fn(req, res, function(err) {
            if (err) return done(err);
            
            same(wurd.load.args[0][1].lang, 'de');

            done();
          });
        });

        it('then falls back to client lang setting', function(done) {
          wurd.options.lang = 'pt';

          var fn = wurd.middleware('foo');

          fn(req, res, function(err) {
            if (err) return done(err);
            
            same(wurd.load.args[0][1].lang, 'pt');

            done();
          });
        });
      });
    });
  });


  describe('#loadByParam', function() {
    var wurd;
    var req, res;

    beforeEach(function() {
      wurd = new Wurd('foo');

      req = {
        params: {}
      };

      res = {};

      this.sinon.stub(wurd, 'load').yields(null, {});
    });

    it('returns a Connect/Express middleware function', function(done) {
      var fn = wurd.loadByParam('page');

      fn(req, res, function(err) {
        if (err) return done(err);

        test.ok(res.locals.wurd);

        done();
      });
    });

    
    describe('the middleware', function() {
      it('loads the content onto the response, using the parameter value as page name', function(done) {
        req.params.page = 'foo';

        wurd.load.withArgs('foo').yields(null, {
          foo: { a: 'A' }
        });

        var fn = wurd.loadByParam('page');

        fn(req, res, function(err) {
          if (err) return done(err);
          
          test.deepEqual(res.locals, {
            wurd: {
              page: { a: 'A' }
            }
          });

          done();
        });
      });

      describe('with languages', function() {
        it('first checks for "language" on the request', function(done) {
          req.params.page = 'foo';
          req.language = 'fr';

          var fn = wurd.loadByParam('page');

          fn(req, res, function(err) {
            if (err) return done(err);
            
            same(wurd.load.args[0][1].lang, 'fr');

            done();
          });
        });

        it('then checks options.lang', function(done) {
          req.params.page = 'foo';
          wurd.options.lang = 'en';

          var fn = wurd.loadByParam('page', { lang: 'de' });

          fn(req, res, function(err) {
            if (err) return done(err);
            
            same(wurd.load.args[0][1].lang, 'de');

            done();
          });
        });

        it('then falls back to client lang setting', function(done) {
          req.params.page = 'foo';
          wurd.options.lang = 'pt';

          var fn = wurd.loadByParam('page');

          fn(req, res, function(err) {
            if (err) return done(err);
            
            same(wurd.load.args[0][1].lang, 'pt');

            done();
          });
        });
      });


      describe('with "contentName" option', function() {
        it('uses the contentName value as the key in the response locals', function(done) {
          req.params.page = 'foo';

          wurd.load.withArgs('foo').yields(null, {
            foo: { a: 'A' }
          });

          var fn = wurd.loadByParam('page', { contentName: 'xyz' });

          fn(req, res, function(err) {
            if (err) return done(err);

            test.deepEqual(res.locals, {
              wurd: {
                xyz: { a: 'A' }
              }
            });

            done();
          });
        });
      });
    });
  });
  
});
