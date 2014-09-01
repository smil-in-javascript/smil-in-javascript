'use strict';

timing_test(function() {
  var polyfillRect = document.getElementById('polyfillRect');
  var nativeRect = document.getElementById('nativeRect');

  // nativeAnimateMotion does not expose the updating transform
  at(0, 'transform',
      'translate(0, 0) rotate(0)',
      polyfillRect, polyfillRect);

  at(3000, 'transform',
      'translate(15, 0) rotate(0)',
      polyfillRect, polyfillRect);

  at(6000, 'transform',
      'translate(30, 0) rotate(0)',
      polyfillRect, polyfillRect);

  at(7500, 'transform',
      'translate(30, 20) rotate(0)',
      polyfillRect, polyfillRect);

  at(9000, 'transform',
      'translate(30, 40) rotate(0)',
      polyfillRect, polyfillRect);

  at(10500, 'transform',
      'translate(63, 40) rotate(0)',
      polyfillRect, polyfillRect);

  at(12000, 'transform',
      'translate(96, 40) rotate(0)',
      polyfillRect, polyfillRect);

}, 'animateMotion keyTimes');
