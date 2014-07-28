'use strict';

timing_test(function() {
  var polyfillAnim = document.getElementById('polyfillAnim');
  var nativeAnim = document.getElementById('nativeAnim');

  function requentEnd() {
    polyfillAnim.endElement();
  }

  executeAt(500, requentEnd); // NOOP
  eventAt(1000, polyfillAnim, 'begin');
  eventAt(2000, polyfillAnim, 'end');
  eventAt(3000, polyfillAnim, 'begin');
  eventAt(4000, polyfillAnim, 'end');
  eventAt(4000, polyfillAnim, 'begin');
  eventAt(5000, polyfillAnim, 'end');
  executeAt(5500, requentEnd); // NOOP

}, 'begin and end events');
