'use strict';

var values = {};

module.exports = {
  values: values,
  get: function (key) {
    return values[key];
  },
  set: function (key, value) {
    if (typeof key === 'object') {
      Object.keys(key).forEach(function (property) {
        values[property] = key[property];
      });
    } else {
      values[key] = value;
    }
  }
}
