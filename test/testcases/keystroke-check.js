'use strict';

function issueKeystroke(charCode) {
  var event = new Event('keypress');
  event.charCode = charCode;
  document.body.dispatchEvent(event);
}

function issueKeystrokes() {
  issueKeystroke('2'.charCodeAt());
  issueKeystroke('1'.charCodeAt());
}

timing_test(function() {
  var polyfillAnimLeft = document.getElementById('polyfillAnimLeft');
  var polyfillAnimRight = document.getElementById('polyfillAnimRight');

  executeAt(1000, function() {
    issueKeystrokes();
  });
  eventAt(1000, polyfillAnimLeft, 'begin');
  eventAt(3000, polyfillAnimLeft, 'end');
  eventAt(6000, polyfillAnimRight, 'begin'); // 5 second offset to keystroke
  eventAt(8000, polyfillAnimRight, 'end');

}, 'respond to keystrokes');
