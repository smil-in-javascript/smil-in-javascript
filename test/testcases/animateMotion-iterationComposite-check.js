'use strict';

timing_test(function() {
  var polyfillRect = document.getElementById('polyfillRect');
  var nativeRect = document.getElementById('nativeRect');

  at(1000, 'transform', ['translate(45, -60) rotate(0) translate(-75, 180) rotate(0)', undefined], polyfillRect, nativeRect);
  at(2000, 'transform', ['translate(90, -120) rotate(0) translate(-50, 120) rotate(0)', undefined], polyfillRect, nativeRect);
  at(3000, 'transform', ['translate(105, -140) rotate(0) translate(-75, 180) rotate(0)', undefined], polyfillRect, nativeRect);
  at(4000, 'transform', ['translate(150, -200) rotate(0) translate(-50, 120) rotate(0)', undefined], polyfillRect, nativeRect);
  at(5000, 'transform', ['translate(165, -220) rotate(0) translate(-75, 180) rotate(0)', undefined], polyfillRect, nativeRect);

  // Without this extra expectation (and RAF), the final
  // transform is mis-reported. We need the animation
  // completion to be observed before the RAF where we
  // inspect transform.
  at(7000, 'width', 200, polyfillRect, nativeRect);

  at(8000, 'transform', ['', undefined], polyfillRect, nativeRect);

}, 'animateTransform scale');
