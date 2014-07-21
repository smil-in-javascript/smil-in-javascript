'use strict';

function createRect(id, x, y) {
  var picture = document.getElementById('picture');

  var rect = document.createElementNS(
      'http://www.w3.org/2000/svg', 'rect');
  rect.id = id;

  var attributes = {
    x: x,
    y: y,
    width: '100',
    height: '100',
    fill: 'green'
  };

  for (var name in attributes) {
    rect.setAttribute(name, attributes[name]);
  }

  picture.appendChild(rect);
}

function createTargets() {
  createRect('polyfillRect', 0, 0);
  createRect('nativeRect', 0, 110);
}

timing_test(function() {
  executeAt(1000, createTargets);

  // Without this extra expectation (and RAF), the width
  // is reported as 100. We need the DOM mutations to be
  // observed before the RAF where we inspect width.
  at(2000, 'height', '100', 'polyfillRect', 'nativeRect');

  at(3000, 'width', '200', 'polyfillRect', 'nativeRect');
}, 'append animation target');
