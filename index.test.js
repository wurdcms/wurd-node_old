var test = require('assert'),
    _ = require('underscore'),
    sinon = require('sinon');

//Shortcut
test.same = test.strictEqual;

var wurd = require('./index');


describe('wurd-node', function() {

  beforeEach(function() {
    this.sinon = sinon.sandbox.create();
  });

  afterEach(function() {
    this.sinon.restore();
  });


  describe('connect', function() {

  });
  
});
