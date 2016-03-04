var consts           = require('./consts');
var Colorer          = require('./colorer');
var emitNewlineEvent = require('./newline');


function Cursor(stream, options) {

  if (!(this instanceof Cursor)) {
    return new Cursor(stream, options);
  }

  if (typeof stream !== 'object' || typeof stream.write !== 'function') {
    throw new Error('A valid Stream instance must be passed in.');
  }

  // the stream to use
  this.stream = stream;

  // when `enabled` is false then all the
  // methods are no-ops except for `write()`.
  this.enabled = options && options.enabled;
  if (typeof this.enabled === 'undefined') {
    this.enabled = stream.isTTY;
  }
  this.enabled = !!this.enabled;

  // when `buffering` is true, then `write()` calls are buffered
  // in memory until `flush()` is invoked.
  this.buffering = !!(options && options.buffering);
  this._buffer   = [];


  // defaults
  this.bold      = false;
  this.italic    = false;
  this.inverse   = false;
  this.underline = false;

  // keep track of the number of `newline` that get encountered
  this.newlines = 0;
  emitNewlineEvent(stream);
  stream.on('newline', function () {
    this.newlines++;
  }.bind(this));
}

module.exports = Cursor;

Cursor.prototype.enable = function () {
  this.enabled = true;
  return this;
};

Cursor.prototype.disable = function () {
  this.enabled = false;
  return this;
};

Cursor.prototype.write = function (data) {

  /**
   * Helper function that calls `write()` on the underlying Stream.
   * Returns `this` instead of the write() return value to keep
   * the chaining going.
   */

  if (this.buffering) {
    this._buffer.push(arguments);
  } else {
    this.stream.write.apply(this.stream, arguments);
    this.stream.emit('data', data);
  }

  return this;
};

Cursor.prototype._write = function (data) {

  if (this.enabled) {
    this.write(data);
  }

  return this;
};

Cursor.prototype.buffer = function () {
  this.buffering = true;
  return this;
};

Cursor.prototype.flush = function () {

  // write out the in-memory buffer

  this.buffering = false;

  var output = this._buffer.map(function (args) {
    if (args.length !== 1) {
      throw new Error('Unexpected args length: ' + args.length);
    }
    return args[0];
  }).join('');

  this._buffer = [];

  return this.write(output);
};


var prefix    = consts.prefix;
var codes     = consts.codes;
var actions   = consts.actions;
var movements = consts.movements;

Object.keys(movements).forEach(function (methodName) {

  var code = String(movements[methodName]);

  Cursor.prototype[methodName] = function () {
    var c = code;
    if (arguments.length > 0) {
      c = toArray(arguments).map(toAxis).join(';') + code
    }

    return this._write(prefix + c);
  };
});

Object.keys(actions).forEach(function (methodName) {

  var code = String(actions[methodName]);

  Cursor.prototype[methodName] = function () {
    return this._write(prefix + code);
  };
});


Cursor.prototype.move = function (x, y) {
  // set relative coordinates
  if (y < 0) {
    this.moveUp(-y)
  } else if (y > 0) {
    this.moveDown(y)
  }

  if (x > 0) {
    this.forward(x)
  } else if (x < 0) {
    this.backward(-x)
  }

  return this;
};

Cursor.prototype.beep = function () {
  return this._write(consts.beep);
};

Cursor.prototype.erase = function (type) {

  if (type) {
    if (type === '$') {
      return this.eraseRight();
    } else if (type === '^') {
      return this.eraseLeft();
    } else {
      var methodName = 'erase' + ucFirst('' + type);
      if (this[methodName]) {
        return this[methodName]();
      }
    }
  }

  this.emit('error', new Error('Unknown erase type: ' + type));

  return this;
};

Cursor.prototype.delete = function (type, n) {

  if (type) {
    var methodName = 'delete' + ucFirst('' + type);
    if (this[methodName]) {
      return this[methodName](n);
    }
  }

  this.emit('error', new Error('Unknown delete type: ' + type));

  return this;
};

Cursor.prototype.insert = function (mode, n) {

  n = n || 1;

  if (mode === true) {
    return this._write(prefix + '4h');
  } else if (mode === false) {
    return this._write(prefix + 'l');
  } else if (mode === 'line') {
    return this._write(prefix + +n + 'L');
  } else if (mode === 'char') {
    return this._write(prefix + +n + '@');
  }

  this.emit('error', new Error('Unknown insert type: ' + mode));

  return this;
};

Cursor.prototype.save = function (withAttributes) {
  if (this.enabled) {
    this.write(withAttributes ? codes.saveCursor : codes.savePosition);
  }
  return this;
};

Cursor.prototype.restore = function (withAttributes) {
  if (this.enabled) {
    this.write(withAttributes ? codes.restoreCursor : codes.restorePosition);
  }
  return this;
};


// helpers
// -------

function isUndefined(val) {
  return typeof val === 'undefined';
}

function ucFirst(str) {
  return str.charAt(0).toUpperCase() + str.substring(1);
}

function toAxis(val) {
  return isUndefined(val) || isNaN(val) || !isFinite(val)
    ? 1
    : Math.floor(val);
}

function toArray(arr) {
  var ret = [];
  for (var i = 0, l = arr.length; i < l; i++) {
    ret.push(arr[i]);
  }
  return ret;
}
