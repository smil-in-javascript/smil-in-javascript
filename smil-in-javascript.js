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

// indexed by element reference
var animationRecords = {};

// Animations waiting for their target element to be created
// indexed by id
var waitingAnimationRecords = {};

// indexed by id
var timedElements = {};


/** @constructor */
var Scheduler = function() {
  // FIXME: implement queue more efficiently
  // could use a heap or tree
  this.pendingTimedElements = [];

  // protect against recursive processUpdates calls
  this.processingUpdates = false;

  this.player = document.timeline.play(
      new Animation(null, schedulerEffectCallback,
          { fill: 'forwards' }));
  // We change the startTime whenever the earliest time in the schedule changes
  this.player.startTime = Infinity;
};

Scheduler.prototype = {
  reschedule: function(timedElement, newScheduleTime) {
    var index;
    var pendingTimedElements = this.pendingTimedElements;
    if (isFinite(timedElement.scheduleTime)) {
      // could binary search using timedElement.scheduleTime
      for (index = 0;
           index < pendingTimedElements.length &&
           pendingTimedElements[index] != timedElement;
           ++index) {
      }
      pendingTimedElements.splice(index, 1);
    }
    timedElement.scheduleTime = newScheduleTime;

    index = pendingTimedElements.length;
    pendingTimedElements.push(null);
    // loop invariant: times[index] is available
    while (index &&
           pendingTimedElements[index - 1].scheduleTime > newScheduleTime) {
      pendingTimedElements[index] = pendingTimedElements[index - 1];
      --index;
    }
    pendingTimedElements[index] = timedElement;
  },
  processUpdates: function() {
    if (this.processingUpdates) {
      // protect against recursive call
      return;
    }
    this.processingUpdates = true;
    this.player.startTime = Infinity;

    var currentTime = document.timeline.currentTime;
    var pendingTimedElements = this.pendingTimedElements;
    while (pendingTimedElements.length &&
           pendingTimedElements[0].scheduleTime <= currentTime) {
      var timedElement = pendingTimedElements.shift();
      timedElement.schedule();
    }

    if (pendingTimedElements.length) {
      // create new player with custom effect timing function to wake us
      // at scheduleTime

      this.player.startTime = pendingTimedElements[0].scheduleTime;
    }
    this.processingUpdates = false;
  }
};

var scheduler = new Scheduler();

function schedulerEffectCallback(time) {
  scheduler.processUpdates();
}

/*
 * The timing model classes are based on
 *
 * Timing and Animation Support for Batik
 * Patrick L. Schmitz
 * http://www.ludicrum.org/plsWork/papers/BatikSMILsupport.htm
 */


// TimeVal is implemented using JavaScript numbers, with Infinity
// representing Indefinite and NaN representing unresolved.


/** @constructor */
var InstanceTime = function(creator, timebase, clearOnReset,
    dynamicallyRequestedTime) {
  this.creator = creator;
  this.timebase = timebase;
  this.clearOnReset = clearOnReset;

  if (creator) {
    if (creator.timebase) {
      // FIXME: support syncbase timing using creator.timebase
      // and creator.offset
      this.time = NaN;
    } else {
      this.time = creator.offset;
    }
  } else {
    // beginElement, beginElementAt, endElement, endElementAt
    this.time = dynamicallyRequestedTime;
  }
};

InstanceTime.prototype = {
  // FIXME: implement dependentUpdate
};


/** @constructor */
var Interval = function() {
  this.begin = NaN;
  this.end = NaN;
  this.beginDependents = [];
  this.endDependents = [];
};

Interval.prototype = {
  addDependent: function(dependent, forBegin) {
    if (forBegin) {
      this.beginDependents.push(dependent);
    } else {
      this.endDependents.push(dependent);
    }
  }
  // FIXME: implement recalc, removeDependent
};


/** @constructor */
var TimeValueSpecification = function(owner, isBegin) {
  this.owner = owner;
  this.isBegin = isBegin;

  this.timebase = null;
  this.timeSymbol = null; // 'begin' or 'end' when we depend on a timebase
  this.offset = NaN;
};

TimeValueSpecification.prototype = {
  // FIXME: implement newInterval, removeInterval, handleTimebaseUpdate
};


/** @constructor */
var TimedElement = function() {
  // animationRecord and beginSpecs and endSpecs are replaced in
  // createTimedElement.
  this.animationRecord = undefined;
  this.beginSpecs = [];
  this.endSpecs = [];

  // times are in sorted order
  this.beginInstanceTimes = [];
  this.endInstanceTimes = [];

  this.beginDependents = [];
  this.endDependents = [];

  this.scheduleTime = Infinity;
  this.player = null;
};

TimedElement.prototype = {
  addInstanceTime: function(instanceTime, isBegin) {
    if (isNaN(instanceTime.time)) {
      return;
    }
    var times = isBegin ? this.beginInstanceTimes : this.endInstanceTimes;
    var index = times.length;
    times.push(null);
    // loop invariant: times[index] is available
    while (index && times[index - 1].time > instanceTime.time) {
      times[index] = times[index - 1];
      --index;
    }
    times[index] = instanceTime;

    if (instanceTime.time < this.scheduleTime) {
      // updates this.scheduleTime to instanceTime.time
      scheduler.reschedule(this, instanceTime.time);
    }
  },
  addDependent: function(dependent, forBegin) {
    if (forBegin) {
      this.beginDependents.push(dependent);
    } else {
      this.endDependents.push(dependent);
    }
  },
  schedule: function() {
    var beginTime = this.beginInstanceTimes.length ?
        this.beginInstanceTimes[0].time : Infinity;
    var endTime = this.endInstanceTimes.length ?
        this.endInstanceTimes[0].time : Infinity;

    if (this.player) {
      this.player.cancel();
      this.player = null;
    }
    if (endTime < beginTime) {
      this.endInstanceTimes.shift();

      endTime = this.endInstanceTimes.length ?
          this.endInstanceTimes[0].time : Infinity;
    } else {
      this.player = document.timeline.play(this.animationRecord.animation);
      this.player.startTime = this.beginInstanceTimes[0].time;
      this.beginInstanceTimes.shift();

      beginTime = this.beginInstanceTimes.length ?
          this.beginInstanceTimes[0].time : Infinity;
    }

    var scheduleTime = Math.min(beginTime, endTime);
    if (isFinite(scheduleTime)) {
      // updates this.scheduleTime to scheduleTime
      scheduler.reschedule(this, scheduleTime);
    } else {
      this.scheduleTime = Infinity;
    }
  }
};



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
    // FIXME: validate the components contain only the expected characters
    // and are in range.
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

// Implements http://www.w3.org/TR/SMIL3/smil-timing.html#q23
// Converts value to milliseconds.
function parseOffsetValue(value) {
  value = value.trim();
  if (value.substring(0, 1) === '+') {
    return parseClockValue(value.substring(1).trim());
  } else if (value.substring(0, 1) === '-') {
    return -parseClockValue(value.substring(1).trim());
  } else {
    return parseClockValue(value);
  }
  var result;
}

// Used by parseBeginEnd to implement
// http://www.w3.org/TR/SMIL3/smil-timing.html#Timing-BeginValueListSyntax
// Returns a TimeValueSpecification, or undefined
function parseBeginEndValue(owner, isBegin, value) {
  var result;
  value = value.trim();
  if (value === '') {
    return undefined;
  }
  var initial = value.substring(0, 1);
  if ((initial >= '0' && initial <= '9') || initial == '+' || initial == '-') {
    result = new TimeValueSpecification(owner, isBegin);
    result.offset = parseOffsetValue(value);
    return result;
  } else if (value.substring(0, 9) === 'wallclock') {
    // FIXME: support wallclock sync values.
    return undefined;
  } else if (value === 'indefinite') {
    result = new TimeValueSpecification(owner, isBegin);
    result.offset = Infinity;
    return result;
  } else {
    var plusIndex = value.indexOf('+');
    var minusIndex = value.indexOf('-');
    var offsetIndex;
    if (plusIndex === -1) {
      offsetIndex = minusIndex;
    } else if (minusIndex === -1) {
      offsetIndex = plusIndex;
    } else {
      offsetIndex = Math.min(plusIndex, minusIndex);
    }
    var token;
    var offset;
    if (offsetIndex === -1) {
      token = value;
      offset = 0;
    } else {
      token = value.substring(0, offsetIndex);
      offset = parseOffsetValue(value.substring(offsetIndex));
    }
    var separatorIndex = token.indexOf('.');
    if (separatorIndex === -1) {
      // FIXME: support event values
      return undefined;
    }
    var timeSymbol = token.substring(separatorIndex + 1);
    if (timeSymbol !== 'begin' && timeSymbol !== 'end') {
      return undefined;
    }
    var id = value.substring(0, separatorIndex);
    result = new TimeValueSpecification(owner, isBegin);
    result.timebase = timedElementById(id);
    result.timeSymbol = timeSymbol;
    result.offset = offset;
    result.timebase.addDependent(result, isBegin);
    return result;
  }
}

// Implements
// http://www.w3.org/TR/SMIL3/smil-timing.html#Timing-BeginValueListSyntax
function parseBeginEnd(owner, isBegin, value) {
  var result = [];
  var entry;
  if (value) {
    var components = value.split(';');
    for (var index = 0; index < components.length; ++index) {
      entry = parseBeginEndValue(owner, isBegin, components[index]);
      if (entry) {
        result.push(entry);
      }
    }
  }
  if (!result.length) {
    var fallbackOffset = isBegin ? 0 : Infinity;
    entry = new TimeValueSpecification(owner, isBegin);
    entry.offset = fallbackOffset;
    result.push(entry);
  }
  return result;
}

function timedElementById(id) {
  var result = timedElements[id];
  if (!result) {
    result = new TimedElement();
    timedElements[id] = result;
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
    // FIXME: use 'accumulate' when support is implemented in the
    // Web Animations Polyfill.
    options.composite = 'add';
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

  // http://www.w3.org/TR/SVG/animate.html#AnimateMotionElement
  if (animationRecord.rotate) {
    if (animationRecord.rotate === 'auto') {
      options.autoRotate = 'auto-rotate';
    } else if (animationRecord.rotate === 'auto-reverse') {
      options.autoRotate = 'auto-rotate';
      options.angle = 180;
    } else {
      options.angle = parseFloat(animationRecord.rotate);
    }
  } else {
    // default behavior is options.autoRotate = 'none';
  }

  return options;
}

function createAnimation(animationRecord) {
  if (animationRecord.target) {
    var animation = new Animation(animationRecord.target,
                                  animationRecord.effect,
                                  animationRecord.timingInput);
    animationRecord.animation = animation;
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

    var keyTimeList = undefined;
    if (animationRecord.keyTimes) {
      keyTimeList = animationRecord.keyTimes.split(';');

      var previousKeyTime = 0;
      var validKeyTime = true;
      for (var keyTimeIndex = 0;
           validKeyTime && keyTimeIndex < keyTimeList.length;
           ++keyTimeIndex) {
        var currentKeyTime = parseFloat(keyTimeList[keyTimeIndex]);
        keyTimeList[keyTimeIndex] = currentKeyTime;
        validKeyTime =
            currentKeyTime >= previousKeyTime &&
            (keyTimeIndex !== 0 || currentKeyTime === 0) &&
            currentKeyTime <= 1;

        previousKeyTime = currentKeyTime;
      }
      if (!validKeyTime) {
        keyTimeList = undefined;
      }
    }

    if (animationRecord.values) {
      var valueList = animationRecord.values.split(';');

      // http://www.w3.org/TR/SVG/animate.html#KeyTimesAttribute
      // For animations specified with a ‘values’ list, the ‘keyTimes’
      // attribute if specified must have exactly as many values as there
      // are in the ‘values’ attribute.
      if (keyTimeList && keyTimeList.length !== valueList.length) {
        keyTimeList = undefined;
      }

      keyframes = [];
      for (var valueIndex = 0; valueIndex < valueList.length; ++valueIndex) {
        var keyframe = {};
        keyframe[attributeName] = processValue(valueList[valueIndex].trim());
        if (keyTimeList) {
          keyframe.offset = keyTimeList[valueIndex];
        }
        keyframes.push(keyframe);
      }
    } else if (animationRecord.from && animationRecord.to) {

      // http://www.w3.org/TR/SVG/animate.html#KeyTimesAttribute
      // For from/to/by animations, the ‘keyTimes’ attribute if specified
      // must have two values.
      if (keyTimeList && keyTimeList.length === 2) {
        keyframes = [
          {offset: keyTimeList[0]},
          {offset: keyTimeList[1]}
        ];
      } else {
        keyframes = [
          {offset: 0},
          {offset: 1}
        ];
      }

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
    console.log('options  = ' + JSON.stringify(animationRecord.options));
    console.log('timingInput  = ' + JSON.stringify(
        animationRecord.timingInput));
  }

  if (resolvedPath) {
    animationRecord.resolvedPath = resolvedPath;
    animationRecord.effect =
        new MotionPathEffect(resolvedPath, animationRecord.options);
    createAnimation(animationRecord);
  }
}

function createTimedElement(animationRecord) {
  var element = animationRecord.element;
  var timedElement;

  if (element.id) {
    // A dormant TimedElement may have been created earlier if other animation
    // elements have syncbase dependencies on this element.
    timedElement = timedElementById(element.id);
  } else {
    timedElement = new TimedElement();
  }

  timedElement.animationRecord = animationRecord;
  timedElement.beginSpecs = parseBeginEnd(
      timedElement, true, animationRecord['begin']);
  timedElement.endSpecs = parseBeginEnd(
      timedElement, false, animationRecord['end']);

  var index;
  for (index = 0; index < timedElement.beginSpecs.length; ++index) {
    var spec = timedElement.beginSpecs[index];
    timedElement.addInstanceTime(
        new InstanceTime(spec, null, false, NaN), true);
  }
  for (index = 0; index < timedElement.endSpecs.length; ++index) {
    var spec = timedElement.endSpecs[index];
    timedElement.addInstanceTime(
        new InstanceTime(spec, null, false, NaN), false);
  }

  return timedElement;
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
  if (targetRef && targetRef[0] === '#') {
    targetRef = targetRef.substring(1);
    animationRecord.target =
        document.getElementById(targetRef);

    if (!(animationRecord.target instanceof SVGElement)) {
      // Only animate SVG elements
      animationRecord.target = null;
    }

    if (!animationRecord.target) {
      var waiting = waitingAnimationRecords[targetRef];
      if (!waiting) {
        waiting = [];
        waitingAnimationRecords[targetRef] = waiting;
      }
      waiting.push(animationRecord);
    }
  } else {
    animationRecord.target = element.parentNode;
  }

  animationRecord.timingInput = createTimingInput(animationRecord);
  animationRecord.options = createEffectOptions(animationRecord);

  animationRecords[element] = animationRecord;

  if (animationRecord.nodeName === 'mpath') {
    var parentRecord = animationRecords[element.parentNode];
    if (parentRecord) {
      parentRecord.mpathRecord = animationRecord;
    }
  } else {
    animationRecord.timedElement = createTimedElement(animationRecord);

    if (animationRecord.nodeName !== 'animateMotion') {
      createKeyframeAnimation(animationRecord);
    }
    // else we have animateMotion, and wait in case we have an mpath child
  }
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
    // If the node has an mpath child, it will have been processed in the
    // while loop above.
    createMotionPathAnimation(animationRecords[node]);
  }

  if (!(node instanceof SVGElement)) {
    // Only animate SVG elements
    return;
  }
  var waitingList = waitingAnimationRecords[node.id];
  if (waitingList) {
    // FIXME: create animations in order by begin time
    for (var waitingIndex = 0;
         waitingIndex < waitingList.length;
         ++waitingIndex) {
      waitingList[waitingIndex].target = node;
      createAnimation(waitingList[waitingIndex]);
    }
    delete waitingAnimationRecords[node.id];
  }
}

var mutationObserver = undefined;

function processMutations(mutationRecords) {
  var schedulerUpdateRequired = false;
  for (var recordIndex = 0;
       recordIndex < mutationRecords.length;
       ++recordIndex) {
    var record = mutationRecords[recordIndex];
    if (record.type === 'attributes') {
      // FIXME: process attributes update
      continue;
    }

    for (var addedNodeIndex = 0;
         addedNodeIndex < record.addedNodes.length;
         ++addedNodeIndex) {
      walkSVG(record.addedNodes[addedNodeIndex]);
      schedulerUpdateRequired = true;
    }

    if (record.removedNodes.length > 0) {
      // FIXME: process removedNodes
    }
  }

  if (schedulerUpdateRequired) {
    scheduler.processUpdates();
  }
}

function updateRecords() {
  if (mutationObserver) {
    processMutations(mutationObserver.takeRecords());
    return;
  }

  // First time: walk the DOM and create observer.


  // We would like to use document.querySelectorAll(tag) for each tag in
  // observedTags, but can't yet due to
  // querySelectorAll unable to find SVG camelCase elements in HTML
  // https://code.google.com/p/chromium/issues/detail?id=237435

  var svgFragmentList = document.querySelectorAll('svg');
  for (var index = 0; index < svgFragmentList.length; ++index) {
    walkSVG(svgFragmentList[index]);
  }
  scheduler.processUpdates();

  mutationObserver = new MutationObserver(processMutations);
  mutationObserver.observe(document, {
    childList: true,
    attributes: true,
    subtree: true,
    attributeOldValue: true
    // FIXME: measure performance impact of using observedAttributes
    // as attributeFilter array
  });
}

window.addEventListener('load', updateRecords);

function millisecondsToSeconds(milliseconds) {
  return milliseconds / 1000;
}

function secondsToMilliseconds(seconds) {
  return seconds * 1000;
}

Object.defineProperty(SVGPolyfillAnimationElement.prototype, 'targetElement', {
  enumerable: true,
  get: function() {
    updateRecords();
    var animationRecord = animationRecords[this];
    if (animationRecord) {
      return animationRecord.target;
    } else {
      throw new Error('targetElement get on unknown ' +
          this.nodeName + ' ' + this.id);
    }
  }
});

SVGPolyfillAnimationElement.prototype.getStartTime = function() {
    updateRecords();
    var animationRecord = animationRecords[this];
    if (animationRecord) {
      return millisecondsToSeconds(animationRecord.startTime);
    } else {
      throw new Error('getStartTime() on unknown ' +
          this.nodeName + ' ' + this.id);
    }
};

SVGPolyfillAnimationElement.prototype.getCurrentTime = function() {
    updateRecords();
    return millisecondsToSeconds(document.timeline.currentTime);
};

SVGPolyfillAnimationElement.prototype.getSimpleDuration = function() {
    updateRecords();
    var animationRecord = animationRecords[this];
    if (animationRecord) {
      return millisecondsToSeconds(animationRecord.timingInput.duration);
    } else {
      throw new Error('getSimpleDuration() on unknown ' +
          this.nodeName + ' ' + this.id);
    }
};

function createDynamicallyRequestedInstanceTime(dynamicallyRequestedTime) {
  return new InstanceTime(null, null, true, dynamicallyRequestedTime);
}

SVGPolyfillAnimationElement.prototype.beginElement = function() {
    updateRecords();
    var animationRecord = animationRecords[this];
    if (animationRecord) {
      var instanceTime = createDynamicallyRequestedInstanceTime(
              document.timeline.currentTime);
      animationRecord.timedElement.addInstanceTime(
          instanceTime, true);
      scheduler.processUpdates();
    } else {
      throw new Error('beginElement() on unknown ' +
          this.nodeName + ' ' + this.id);
    }
};

SVGPolyfillAnimationElement.prototype.beginElementAt = function(offset) {
    updateRecords();
    var animationRecord = animationRecords[this];
    if (animationRecord) {
      var instanceTime = createDynamicallyRequestedInstanceTime(
              secondsToMilliseconds(offset));
      animationRecord.timedElement.addInstanceTime(
          instanceTime, true);
      scheduler.processUpdates();
    } else {
      throw new Error('beginElementAt() on unknown ' +
          this.nodeName + ' ' + this.id);
    }
};

SVGPolyfillAnimationElement.prototype.endElement = function() {
    updateRecords();
    var animationRecord = animationRecords[this];
    if (animationRecord) {
      var instanceTime = createDynamicallyRequestedInstanceTime(
              document.timeline.currentTime);
      animationRecord.timedElement.addInstanceTime(
          instanceTime, false);
      scheduler.processUpdates();
    } else {
      throw new Error('endElement() on unknown ' +
          this.nodeName + ' ' + this.id);
    }
};

SVGPolyfillAnimationElement.prototype.endElementAt = function(offset) {
    updateRecords();
    var animationRecord = animationRecords[this];
    if (animationRecord) {
      var instanceTime = createDynamicallyRequestedInstanceTime(
              secondsToMilliseconds(offset));
      animationRecord.timedElement.addInstanceTime(
          instanceTime, false);
      scheduler.processUpdates();
    } else {
      throw new Error('endElementAt() on unknown ' +
          this.nodeName + ' ' + this.id);
    }
};

})();
