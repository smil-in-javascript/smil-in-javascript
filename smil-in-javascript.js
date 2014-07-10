/**
 * Copyright 2014 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

(function() {
'use strict';

var observedTags = {
  animate: true,
  animateMotion: true,
  animateTransform: true,
  mpath: true,
  set: true
};

var observedAttributes = {
  accumulate: true,
  additive: true,
  attributeName: true,
  attributeType: true, // For animate and set elements: CSS | XML | auto
  begin: true,
  by: true,
  calcMode: true,
  dur: true,
  end: true,
  fill: true,
  from: true,
  keyPoints: true,
  keyTimes: true,
  max: true,
  min: true,
  onbegin: true,
  onend: true,
  onrepeat: true,
  path: true,
  repeatCount: true,
  repeatDur: true,
  restart: true,
  rotate: true,
  to: true,
  type: true, // animatetransform: translate | scale | rotate | skewX | skewY
  values: true,
  'xlink:href': true
};

// Control debug logging.
var verbose = false;

var animationRecords = {};

// Implements http://www.w3.org/TR/SVG/animate.html#ClockValueSyntax
// Converts value to milliseconds.
function parseClockValue(value) {
  var result;
  if (value === 'indefinite') {
    result = Infinity;
  } else if (value.indexOf(':') === -1) {
    // We have a Timecount value
    result = parseFloat(value);
    if (value.indexOf('h') !== -1) {
      result *= 3600000;
    } else if (value.indexOf('min') !== -1) {
      result *= 60000;
    } else if (value.indexOf('ms') === -1) { // The default unit is seconds
      result *= 1000;
    } // else milliseconds
  } else {
    var components = value.split(':');
    result = parseInt(components[0]) * 60;
    if (components.length === 2) {
      // Partial clock value with minutes : seconds [.fraction]
      result += parseFloat(components[1]);
    } else {
      // Full clock value with hours : minutes : seconds [.fraction]
      result += parseInt(components[1]);
      result *= 60;
      result += parseFloat(components[2]);
    }
    result *= 1000;
  }
  return result;
}

function createTimingInput(animationRecord) {
  var timingInput = {};

  if (animationRecord.dur) {
    timingInput.duration = parseClockValue(animationRecord.dur);
  } else {
    // Absent duration means infinite duration.
    timingInput.duration = Infinity;
  }

  if (animationRecord.repeatCount) {
    if (animationRecord.repeatCount === 'indefinite') {
      timingInput.iterations = Infinity;
    } else {
      timingInput.iterations = parseFloat(animationRecord.repeatCount);
    }
  }

  // http://www.w3.org/TR/smil/smil-timing.html#adef-fill
  // http://www.w3.org/TR/smil/smil-timing.html#adef-fillDefault
  if (animationRecord.fill === 'freeze' ||
      animationRecord.fill === 'hold' ||
      animationRecord.fill === 'transition' ||
      (animationRecord.fill !== 'remove' &&
       !animationRecord.dur &&
       !animationRecord.end &&
       !animationRecord.repeatCount &&
       !animationRecord.repeatDir)) {
    timingInput.fill = 'forwards';

    // FIXME: support animationRecord.fill === 'fillDefault',
    // where we must inspect the inherited fillDefault attribute.
  }

  return timingInput;
}

function createEffectOptions(animationRecord) {
  var options = {};

  // 'sum' adds to the underlying value of the attribute and other lower
  // priority animations.
  // http://www.w3.org/TR/smil/smil-animation.html#adef-additive
  if (animationRecord.additive && animationRecord.additive === 'sum') {
    options.composite = 'accumulate';
  } else {
    // default behavior is options.composite = 'replace';
  }

  // http://www.w3.org/TR/smil/smil-animation.html#adef-accumulate
  if (animationRecord.accumulate &&
      animationRecord.accumulate === 'sum') {
    options.iterationComposite = 'accumulate';
  } else {
    // default behavior is options.iterationComposite = 'replace';
  }

  return options;
}

function createAnimation(animationRecord) {
  if (animationRecord.target) {
    var animation = new Animation(animationRecord.target,
                                  animationRecord.effect,
                                  animationRecord.timingInput);
    animationRecord.animation = animation;

    // FIXME: Respect begin and end attributes.
    animationRecord.player = document.timeline.play(animation);
  }
}

function createKeyframeAnimation(animationRecord) {

  var attributeName = animationRecord.attributeName;
  if (animationRecord.nodeName === 'animateTransform') {
    attributeName = 'transform';
  }

  if (!attributeName) {
    return;
  }

  var keyframes = null;
  if ((animationRecord.nodeName === 'animate' ||
       animationRecord.nodeName === 'animateTransform')) {
    // FIXME: Support more ways of specifying keyframes, e.g. by, or only to.
    // FIXME: Support ways of specifying timing function.

    var processValue;
    if (animationRecord.nodeName === 'animate') {
      processValue = function(value) { return value; };
    } else {
      // animationRecord.nodeName === 'animateTransform'
      var transformType;
      if (animationRecord.type === 'scale' ||
          animationRecord.type === 'rotate' ||
          animationRecord.type === 'skewX' ||
          animationRecord.type === 'skewY') {
        transformType = animationRecord.type;
      } else {
        transformType = 'translate'; // default if type is not specified
      }

      processValue = function(value) {
          return transformType + '(' + value + ')';
      };
    }

    if (animationRecord.values) {
      var valueList = animationRecord.values.split(';');
      keyframes = [];
      for (var valueIndex = 0; valueIndex < valueList.length; ++valueIndex) {
        var keyframe = {};
        keyframe[attributeName] = processValue(valueList[valueIndex].trim());
        keyframes.push(keyframe);
      }

      // FIXME: check keyTimes - if present, must have the same number of
      // entries as values.
    } else if (animationRecord.from && animationRecord.to) {
      keyframes = [
        {offset: 0},
        {offset: 1}
      ];
      keyframes[0][attributeName] = processValue(animationRecord.from);
      keyframes[1][attributeName] = processValue(animationRecord.to);
    }
  } else if (animationRecord.nodeName === 'set' && animationRecord.to) {
    keyframes = [
      {offset: 0},
      {offset: 1}
    ];
    keyframes[0][attributeName] = animationRecord.to;
    keyframes[1][attributeName] = animationRecord.to;
  }

  if (verbose) {
    console.log('keyframes  = ' + JSON.stringify(keyframes));
    console.log('options  = ' + JSON.stringify(animationRecord.options));
    console.log('timingInput  = ' + JSON.stringify(
        animationRecord.timingInput));
  }

  if (keyframes) {
    animationRecord.keyframes = keyframes;
    animationRecord.effect =
        new KeyframeEffect(keyframes, animationRecord.options);
    createAnimation(animationRecord);
  }
}

function createMotionPathAnimation(animationRecord) {
  var resolvedPath;
  if (animationRecord.mpathRecord) {
    var pathRef = animationRecord.mpathRecord['xlink:href'];
    if (pathRef && pathRef.indexOf('#') === 0) {
      animationRecord.pathNode = document.getElementById(pathRef.substring(1));
      if (animationRecord.pathNode) {
        resolvedPath = animationRecord.pathNode.getAttribute('d');
      }
    }
  } else {
    resolvedPath = animationRecord.path;
  }

  if (verbose) {
    console.log('resolvedPath = ' + resolvedPath);
  }

  if (resolvedPath) {
    animationRecord.resolvedPath = resolvedPath;
    animationRecord.effect =
        new MotionPathEffect(resolvedPath, animationRecord.options);
    createAnimation(animationRecord);
  }
}

function createAnimationRecord(element) {
  var animationRecord = {
    element: element,
    nodeName: element.nodeName,
    parentNode: element.parentNode
  };

  var attributes = element.attributes;
  for (var index = 0; index < attributes.length; ++index) {
    var attributeName = attributes[index].name;
    if (attributeName in observedAttributes) {
      animationRecord[attributeName] = attributes[index].value;
    }
  }

  var targetRef = animationRecord['xlink:href'];
  if (targetRef && targetRef.indexOf('#') === 0) {
    animationRecord.target =
        document.getElementById(targetRef.substring(1));
  } else {
    animationRecord.target = element.parentNode;
  }

  animationRecord.timingInput = createTimingInput(animationRecord);
  animationRecord.options = createEffectOptions(animationRecord);

  animationRecords[element] = animationRecord;

  if (animationRecord.nodeName === 'mpath') {
    animationRecords[element.parentNode].mpathRecord = animationRecord;
  } else if (animationRecord.nodeName !== 'animateMotion') {
    createKeyframeAnimation(animationRecord);
  }
  // else we have animateMotion, and wait in case we have an mpath child
}

function walkSVG(node) {
  if (node.nodeName in observedTags) {
    createAnimationRecord(node);
  }
  var child = node.firstChild;
  while (child) {
    walkSVG(child);
    child = child.nextSibling;
  }

  if (node.nodeName === 'animateMotion') {
    createMotionPathAnimation(animationRecords[node]);
  }
}

window.onload = function() {

  // We would like to use document.querySelectorAll(tag) for each tag in
  // observedTags, but can't yet due to
  // querySelectorAll unable to find SVG camelCase elements in HTML
  // https://code.google.com/p/chromium/issues/detail?id=237435

  var svgFragmentList = document.querySelectorAll('svg');
  for (var index = 0; index < svgFragmentList.length; ++index) {
    walkSVG(svgFragmentList[index]);
  }
};

})();
