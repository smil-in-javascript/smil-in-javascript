'use strict';

timing_test(function() {
  var polyfillSpotLight = document.getElementById('polyfillSpotLight');
  var nativeSpotLight = document.getElementById('nativeSpotLight');

  at(1000, 'z', 400, polyfillSpotLight, nativeSpotLight);
  at(2000, 'z', 300, polyfillSpotLight, nativeSpotLight);
  at(3000, 'z', 200, polyfillSpotLight, nativeSpotLight);

  at(4000, 'pointsAtX', [60, 660], polyfillSpotLight, nativeSpotLight);
  at(5000, 'pointsAtX', [120, 720], polyfillSpotLight, nativeSpotLight);
  at(6000, 'pointsAtX', [180, 780], polyfillSpotLight, nativeSpotLight);

  at(7000, 'pointsAtY', 60, polyfillSpotLight, nativeSpotLight);
  at(8000, 'pointsAtY', 120, polyfillSpotLight, nativeSpotLight);
  at(9000, 'pointsAtY', 180, polyfillSpotLight, nativeSpotLight);

  at(10000, 'pointsAtZ', 60, polyfillSpotLight, nativeSpotLight);
  at(11000, 'pointsAtZ', 120, polyfillSpotLight, nativeSpotLight);
  at(12000, 'pointsAtZ', 0, polyfillSpotLight, nativeSpotLight);

  at(13000, 'limitingConeAngle', 14, polyfillSpotLight, nativeSpotLight);
  at(14000, 'limitingConeAngle', 16, polyfillSpotLight, nativeSpotLight);

}, 'animate feSpotLight properties');
