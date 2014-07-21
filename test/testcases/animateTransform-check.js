'use strict';

timing_test(function() {
  var polyfillRect = document.getElementById('polyfillRect');
  var nativeRect = document.getElementById('nativeRect');

  at(0, 'transform',
     ['scale(1)', 'scale(1 1)'], polyfillRect, nativeRect);
  at(500, 'transform',
     ['scale(1.5)', 'scale(1.5 1.5)'], polyfillRect, nativeRect);
  at(1000, 'transform',
     ['scale(2)', 'scale(2 2)'], polyfillRect, nativeRect);
  at(1500, 'transform',
     ['scale(2.5)', 'scale(2.5 2.5)'], polyfillRect, nativeRect);
  at(2500, 'transform', '', polyfillRect, nativeRect);

}, 'animateTransform scale');
