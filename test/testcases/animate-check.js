'use strict';

timing_test(function() {
  var polyfillRect = document.getElementById('polyfillRect');
  var nativeRect = document.getElementById('nativeRect');

  at(0, 'width', 200, polyfillRect, nativeRect);
  at(1500, 'width', 50, polyfillRect, nativeRect);
  at(2500, 'width', 150, polyfillRect, nativeRect);
}, 'animate width');
