'use strict';

timing_test(function() {
  var polyfillText = document.getElementById('polyfillText');
  var nativeText = document.getElementById('nativeText');

  at(1000, 'dy', ['15, 20, 25', '15 20 25'], polyfillText, nativeText);

}, 'text properties');
