'use strict';

timing_test(function() {
  var polyfillLine = document.getElementById('polyfillLine');
  var nativeLine = document.getElementById('nativeLine');

  at(0, 'stroke', ['rgba(0, 0, 255, 1)', undefined], polyfillLine, nativeLine);
  at(0, 'stroke-width', [10, undefined], polyfillLine, nativeLine);
  at(0, 'stroke-opacity', [1, undefined], polyfillLine, nativeLine);
  at(0, 'stroke-dashoffset', [0, undefined], polyfillLine, nativeLine);

  at(1000, 'stroke', ['rgba(0, 64, 128, 1)', undefined],
     polyfillLine, nativeLine);
  at(1000, 'stroke-width', [15, undefined], polyfillLine, nativeLine);
  at(1000, 'stroke-opacity', [0.6, undefined], polyfillLine, nativeLine);
  at(1000, 'stroke-dashoffset', [50, undefined], polyfillLine, nativeLine);

  at(2000, 'stroke', ['rgba(0, 128, 0, 1)', undefined],
     polyfillLine, nativeLine);
  at(2000, 'stroke-width', [20, undefined], polyfillLine, nativeLine);
  at(2000, 'stroke-opacity', [0.2, undefined], polyfillLine, nativeLine);
  at(2000, 'stroke-dashoffset', [100, undefined], polyfillLine, nativeLine);
}, 'animate stroke properties');
