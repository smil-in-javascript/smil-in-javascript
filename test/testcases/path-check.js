'use strict';

timing_test(function() {
  var polyfillPath = document.getElementById('polyfillPath');
  var nativePath = document.getElementById('nativePath');

  at(0, 'd', ['M 60 60 L 80 0 L 60 0 z',
              'M 60 60 L 80 0 L 60 0 Z'], polyfillPath, nativePath);
  at(1000, 'd', ['M80,80L100,20L100,20L80,20L80,20L80,80',
                 'M 80 80 L 100 20 L 80 20 Z'], polyfillPath, nativePath);
  at(2000, 'd', ['M100,100L120,40L120,40L100,40L100,40L100,100',
                 'M 100 100 L 120 40 L 100 40 Z'], polyfillPath, nativePath);
  at(3000, 'd', ['M120,120L140,60L140,60L120,60L120,60L120,120',
                 'M 120 120 L 140 60 L 120 60 Z'], polyfillPath, nativePath);
  at(4000, 'd', ['M140,140L160,80L160,80L140,80L140,80L140,140',
                 'M 140 140 L 160 80 L 140 80 Z'], polyfillPath, nativePath);
}, 'path attribute');
