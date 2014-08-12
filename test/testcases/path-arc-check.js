'use strict';

timing_test(function() {
  var polyfillPath = document.getElementById('polyfillPath');
  var nativePath = document.getElementById('nativePath');

  at(0, 'd', 'M 50 0 L 50 50 L 80 90 A 50 50 0 0 0 50 0',
      polyfillPath, nativePath);
  at(1000, 'd', 'M 50 0 L 50 50 L 80 90 A 50 50 0 0 0 50 0',
      polyfillPath, nativePath);
  // FIXME: The interpolated arc paths are inaccurate
  at(2000, 'd', [
      'M50,0L50,49.21122360229492L51.51542091369629,52.02056312561035' +
      'L81.23795700073242,86.55346870422363' +
      'L86.3272476196289,84.20823287963867L49.999996185302734,0',
      'M 50 0 L 50 50 L 82.5 87.5 A 50 50 0 0 0 50 0'],
      polyfillPath, nativePath);
  at(3000, 'd', [
      'M50,0L50,48.422447204589844L51.01028060913086,51.347042083740234' +
      'L82.47591400146484,83.10693740844727' +
      'L87.55149841308594,82.80548858642578L49.999996185302734,0',
      'M 50 0 L 50 50 L 85 85 A 50 50 0 0 0 50 0'],
      polyfillPath, nativePath);
  at(4000, 'd', [
      'M50,0L50,47.633670806884766L50.50514030456543,50.67352104187012' +
      'L83.71387100219727,79.6604061126709' +
      'L88.77574920654297,81.40274429321289L49.999996185302734,0',
      'M 50 0 L 50 50 L 87.5 82.5 A 50 50 0 0 0 50 0'],
      polyfillPath, nativePath);
  at(5000, 'd', 'M 50 0 L 50 50 L 80 90 A 50 50 0 0 0 50 0',
      polyfillPath, nativePath);
}, 'arc path attribute');
