'use strict';

timing_test(function() {
  var polyfillLine = document.getElementById('polyfillLine');
  var nativeLine = document.getElementById('nativeLine');

  at(0, 'x1', 10, polyfillLine, nativeLine);
  at(1000, 'y1', 78, polyfillLine, nativeLine);
  at(2000, 'x2', 78, polyfillLine, nativeLine);
  at(3000, 'y2', 26, polyfillLine, nativeLine);
  at(4000, 'x1', 34, polyfillLine, nativeLine);
}, 'animate line properties');
