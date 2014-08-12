'use strict';

timing_test(function() {
  var polyfillPath = document.getElementById('polyfillPath');
  var nativePath = document.getElementById('nativePath');

  at(0, 'd', 'M 100 200 C 100 100 250 100 250 200 S 400 300 400 200',
      polyfillPath, nativePath);
  at(3000, 'd', 'M 100 200 C 100 100 250 100 250 200 S 400 300 400 200',
      polyfillPath, nativePath);
  // FIXME: The interpolated Bezier paths are inaccurate
  at(4000, 'd', [
      'M125,250L275,249.99996948242188L275,250.00009155273438L425,250',
      'M 125 250 C 125 150 275 150 275 250 S 425 350 425 250'],
      polyfillPath, nativePath);
  at(5000, 'd', [
      'M150,300L300,299.99993896484375L300,300.00006103515625L450,300',
      'M 150 300 C 150 200 300 200 300 300 S 450 400 450 300'],
      polyfillPath, nativePath);
  at(6000, 'd', [
      'M175,350L325,349.9999084472656L325,350.0000305175781L475,350',
      'M 175 350 C 175 250 325 250 325 350 S 475 450 475 350'],
      polyfillPath, nativePath);
  at(7000, 'd', 'M 100 200 C 100 100 250 100 250 200 S 400 300 400 200',
      polyfillPath, nativePath);
}, 'bezier path attribute');
