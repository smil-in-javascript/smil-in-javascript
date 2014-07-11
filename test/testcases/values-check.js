'use strict';

timing_test(function() {
  var polyfillRect = document.getElementById('polyfillRect');
  var nativeRect = document.getElementById('nativeRect');

  at(0, 'width', 100, polyfillRect, nativeRect);
  at(250, 'width', 50, polyfillRect, nativeRect);
  at(500, 'width', 0, polyfillRect, nativeRect);
  at(750, 'width', 25, polyfillRect, nativeRect);
  at(1000, 'width', 50, polyfillRect, nativeRect);
  at(1250, 'width', 25, polyfillRect, nativeRect);
  at(1500, 'width', 0, polyfillRect, nativeRect);
  at(1750, 'width', 50, polyfillRect, nativeRect);
  at(2000, 'width', 100, polyfillRect, nativeRect);
  at(2250, 'width', 50, polyfillRect, nativeRect);
  at(2500, 'width', 0, polyfillRect, nativeRect);
  at(2750, 'width', 25, polyfillRect, nativeRect);
  at(3000, 'width', 50, polyfillRect, nativeRect);
  at(3250, 'width', 25, polyfillRect, nativeRect);
  at(3500, 'width', 0, polyfillRect, nativeRect);
  at(3750, 'width', 50, polyfillRect, nativeRect);
  at(4000, 'width', 100, polyfillRect, nativeRect);
  at(4250, 'width', 100, polyfillRect, nativeRect);
}, 'value list interpolation');
