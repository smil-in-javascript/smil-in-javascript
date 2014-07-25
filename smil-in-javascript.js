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

// indexed by animationRecordId
var animationRecords = {};

// Animations waiting for their target element to be created
var waitingAnimationRecords = {};


/** @constructor */
var PriorityQueue = function() {
  // FIXME: use a heap or tree for efficiency
  this.entries = [];
};

PriorityQueue.prototype = {
  insert: function(newEntry) {
    if (!isFinite(newEntry.scheduleTime)) {
      throw new Error('newEntry.scheduleTime is not finite');
    }
    var entries = this.entries;
    var index = entries.length;
    entries.push(null);
    // loop invariant: entries[index] is available
    while (index &&
           entries[index - 1].scheduleTime > newEntry.scheduleTime) {
      entries[index] = entries[index - 1];
      --index;
    }
    entries[index] = newEntry;
  },
  // existingEntry must currently be in the queue
  remove: function(existingEntry) {
    var entries = this.entries;
    var index = 0;

    // could binary search
    while (index < entries.length &&
           entries[index] != existingEntry) {
      ++index;
    }

    if (index == entries.length) {
      throw new Error('existingEntry is not in entries');
    }
    entries.splice(index, 1);
  },
  earliestScheduleTime: function() {
    var entries = this.entries;
    if (!entries.length) {
      return Infinity;
    }
    return entries[0].scheduleTime;
  },
  // returns null if no entry has scheduleTime <= currentTime
  extractFirst: function(currentTime) {
    var entries = this.entries;
    if (!entries.length || currentTime < entries[0].scheduleTime) {
      return null;
    }
    return entries.shift();
  }
};

var masterScheduler = {
  scheduledAnimationRecords: new PriorityQueue(),

  insertAnimationRecord: function(animationRecord) {
    this.scheduledAnimationRecords.insert(animationRecord);
  },
  removeAnimationRecord: function(animationRecord) {
    this.scheduledAnimationRecords.remove(animationRecord);
  },
  checkSchedule: function() {
    var currentTime = document.timeline.currentTime;
    var animationRecord;
    while ((animationRecord =
            this.scheduledAnimationRecords.extractFirst(currentTime))) {
      animationRecord.processNow();
    }
  }
};

// FIXME: use a custom effect callback instead of polling
window.requestAnimationFrame(function pollSchedule() {
  masterScheduler.checkSchedule();
  window.requestAnimationFrame(pollSchedule);
});


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

// Implements http://www.w3.org/TR/SMIL3/smil-timing.html#q23
// Converts value to milliseconds.
function parseOffsetValue(value) {
  value = value.trim();
  if (value[0] === '+') {
    return parseClockValue(value.substring(1).trim());
  } else if (value[0] === '-') {
    return -parseClockValue(value.substring(1).trim());
  } else {
    return parseClockValue(value);
  }
  var result;
}

// Used by parseBeginEnd to implement
// http://www.w3.org/TR/SMIL3/smil-timing.html#Timing-BeginValueListSyntax
// Returns a TimeValueSpecification, or undefined
function parseBeginEndValue(value) {
  var result;
  value = value.trim();
  if (value === '') {
    return undefined;
  }
  var initial = value[0];
  if ((initial >= '0' && initial <= '9') || initial == '+' || initial == '-') {
    return parseOffsetValue(value);
  } else if (value.substring(0, 9) === 'wallclock') {
    // FIXME: support wallclock sync values.
    return undefined;
  } else if (value === 'indefinite') {
    return Infinity;
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
    result = {};
    result.id = id;
    result.timeSymbol = timeSymbol;
    result.offset = offset;
    //FIXME: Support Syncbase dependency
    return undefined;
  }
}

// Implements
// http://www.w3.org/TR/SMIL3/smil-timing.html#Timing-BeginValueListSyntax
function parseBeginEnd(isBegin, value) {
  var result = [];
  var entry;
  if (value) {
    var components = value.split(';');
    for (var index = 0; index < components.length; ++index) {
      entry = parseBeginEndValue(components[index]);
      if (entry !== undefined) {
        result.push(entry);
      }
    }
  }
  if (!result.length) {
    var fallbackOffset = isBegin ? 0 : Infinity;
    result.push(fallbackOffset);
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

    if (isFinite(animationRecord.startTime)) {
      // The animation started before the target existed
      animationRecord.player =
          document.timeline.play(animationRecord.animation);
      animationRecord.player.startTime = animationRecord.startTime;
    }
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


var animationRecordCounter = 0;

/** @constructor */
var AnimationRecord = function(element) {
  this.element = element;
  this.nodeName = element.nodeName;
  this.parentNode = element.parentNode;
  this.startTime = Infinity; // not playing

  this.animationRecordId = animationRecordCounter.toString();
  ++animationRecordCounter;

  this.scheduleTime = Infinity;
  this.beginInstanceTimes = new PriorityQueue();
  this.endInstanceTimes = new PriorityQueue();

  var attributes = element.attributes;
  for (var index = 0; index < attributes.length; ++index) {
    var attributeName = attributes[index].name;
    if (attributeName in observedAttributes) {
      this[attributeName] = attributes[index].value;
    }
  }

  var targetRef = this['xlink:href'];
  if (targetRef && targetRef[0] === '#') {
    targetRef = targetRef.substring(1);
    this.target =
        document.getElementById(targetRef);

    if (!(this.target instanceof SVGElement)) {
      // Only animate SVG elements
      this.target = null;
    }

    if (!this.target) {
      var waiting = waitingAnimationRecords[targetRef];
      if (!waiting) {
        waiting = [];
        waitingAnimationRecords[targetRef] = waiting;
      }
      waiting.push(this);
    }
  } else {
    this.target = element.parentNode;
  }

  this.timingInput = createTimingInput(this);
  this.options = createEffectOptions(this);

  if (this.nodeName === 'mpath') {
    var parentRecord = animationRecords[element.parentNode.animationRecordId];
    if (parentRecord) {
      parentRecord.mpathRecord = this;
    }
  } else {
    var beginTimes = parseBeginEnd(true, this['begin']);
    for (var index = 0; index < beginTimes.length; ++index) {
      this.addInstanceTime(beginTimes[index], true);
    }

    var endTimes = parseBeginEnd(false, this['end']);
    for (var index = 0; index < endTimes.length; ++index) {
      this.addInstanceTime(endTimes[index], false);
    }

    if (this.nodeName !== 'animateMotion') {
      createKeyframeAnimation(this);
    }
    // else we have animateMotion, and wait in case we have an mpath child
  }
};

AnimationRecord.prototype = {
  updateMainSchedule: function() {
    var earliest = Math.min(
        this.beginInstanceTimes.earliestScheduleTime(),
        this.endInstanceTimes.earliestScheduleTime());
    if (earliest === this.scheduleTime) {
      // no need to update main schedule
      return;
    }

    if (isFinite(this.scheduleTime)) {
      masterScheduler.removeAnimationRecord(this);
    }
    // else this animation record is not currently in the schedule

    this.scheduleTime = earliest;
    masterScheduler.insertAnimationRecord(this);
  },
  addInstanceTime: function(instanceTime, isBegin) {
    if (!isFinite(instanceTime)) {
      return;
    }
    var queue = isBegin ? this.beginInstanceTimes : this.endInstanceTimes;
    queue.insert({ scheduleTime: instanceTime });
    this.updateMainSchedule();
  },
  processNow: function() {
    // this element is no longer in the main schedule
    this.scheduleTime = Infinity;

    if (this.beginInstanceTimes.earliestScheduleTime() <=
        this.endInstanceTimes.earliestScheduleTime()) {

      // Start time is finite if we are currently playing
      if (this.startTime !== Infinity) {
        if (this.player) {
          this.player.cancel();
        }

        this.dispatchEvent('end', 0);
      }

      var scheduleTime = this.beginInstanceTimes.extractFirst().scheduleTime;
      this.startTime = scheduleTime; // used if target is created later
      if (this.animation) {
        this.player = document.timeline.play(this.animation);
        this.player.startTime = this.startTime;
      }
      // else target does not exist or is not SVG

      this.dispatchEvent('begin', 0);
    } else {

      var scheduleTime = this.endInstanceTimes.extractFirst().scheduleTime;
      if (this.startTime !== Infinity && this.player) {
        this.player.pause();
        this.player.currentTime = scheduleTime - this.player.startTime;
      }
      this.startTime = Infinity; // not playing

      this.dispatchEvent('end', 0);
    }

    this.updateMainSchedule();
  },
  dispatchEvent : function(eventType, detailArg) {
    // detailArg is the repeat count for repeat events

    var timeEvent = new Event(eventType);
    timeEvent.view = document.defaultView;
    timeEvent.detail = detailArg;
    this.element.dispatchEvent(timeEvent);
  }
};

function compareAnimationRecordsByStartTime(left, right) {
  return left.startTime - right.startTime;
}

function walkSVG(node) {
  if (node.nodeName in observedTags) {
    var animationRecord = new AnimationRecord(node);

    // Storing an id on the element lets us look up the AnimationRecord during
    // DOM calls like endElementAt. When we use Blink in JavaScript, we will
    // run in our own Execution Context, so the animationRecordId attribute
    // on the element won't be visible to user JavaScript.
    node.animationRecordId = animationRecord.animationRecordId;
    animationRecords[animationRecord.animationRecordId] = animationRecord;
  }
  var child = node.firstChild;
  while (child) {
    walkSVG(child);
    child = child.nextSibling;
  }

  if (node.nodeName === 'animateMotion') {
    // If the node has an mpath child, it will have been processed in the
    // while loop above.
    createMotionPathAnimation(animationRecords[node.animationRecordId]);
  }

  if (!(node instanceof SVGElement)) {
    // Only animate SVG elements
    return;
  }
  var waitingList = waitingAnimationRecords[node.id];
  if (waitingList) {
    waitingList.sort(compareAnimationRecordsByStartTime);
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
  var scheduleCheckRequired = false;

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
      scheduleCheckRequired = true;
    }

    if (record.removedNodes.length > 0) {
      // FIXME: process removedNodes
    }
  }
  if (scheduleCheckRequired) {
    masterScheduler.checkSchedule();
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
  masterScheduler.checkSchedule();

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
    var animationRecord = animationRecords[this.animationRecordId];
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
    masterScheduler.checkSchedule();
    var animationRecord = animationRecords[this.animationRecordId];
    if (animationRecord) {
      // FIXME: if the 'current interval' is in the future, should return the
      // begin time for that interval. If there is no current interval, should
      // throw INVALID_STATE_ERR DOMException
      // For now, we assume an animation is in progress.
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
    var animationRecord = animationRecords[this.animationRecordId];
    if (animationRecord) {
      return millisecondsToSeconds(animationRecord.timingInput.duration);
    } else {
      throw new Error('getSimpleDuration() on unknown ' +
          this.nodeName + ' ' + this.id);
    }
};

function instanceTimeRequest(node, methodName, offsetSeconds, isBegin) {
    updateRecords();
    var animationRecord = animationRecords[node.animationRecordId];
    if (animationRecord) {
      var instanceTime = document.timeline.currentTime +
          secondsToMilliseconds(offsetSeconds);
      animationRecord.addInstanceTime(instanceTime, isBegin);
      masterScheduler.checkSchedule();
    } else {
      throw new Error(methodName + '() on unknown ' +
          node.nodeName + ' ' + node.id);
    }
}

SVGPolyfillAnimationElement.prototype.beginElement = function() {
  instanceTimeRequest(
      this, 'beginElement', 0, true);
};

SVGPolyfillAnimationElement.prototype.beginElementAt = function(offset) {
  instanceTimeRequest(
      this, 'beginElementAt', offset, true);
};

SVGPolyfillAnimationElement.prototype.endElement = function() {
  instanceTimeRequest(
      this, 'endElement', 0, false);
};

SVGPolyfillAnimationElement.prototype.endElementAt = function(offset) {
  instanceTimeRequest(
      this, 'endElementAt', offset, false);
};

})();
