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
  keySplines: true,
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

// map from accessKey to TimeValueSpecification list
// null if there are not yet any elements waiting for an accessKey
var accessKeyTimeValueSpecs = null;

/** @constructor */
var PriorityQueue = function() {
  // Each entry in the priority queue has a 'scheduleTime' property.

  // We implement the priority queue using a heap.
  // heap[0] is unused
  // heap[1] has the earliest scheduleTime
  // The children of heap[i] are heap[2 * i] and heap[2 * i + 1]
  // The parent of heap[i] is heap[(i - i % 2) / 2]
  this.heap = [null];

  // We store in each entry a 'heapIndex' property, so we can efficiently
  // remove any entry from the queue.
};

PriorityQueue.prototype = {
  insert: function(newEntry) {
    if (!isFinite(newEntry.scheduleTime)) {
      throw new Error('newEntry.scheduleTime is not finite');
    }
    var index = this.heap.length;
    this.heap.push(null);
    this.shiftUp(index, newEntry);
  },
  remove: function(existingEntry) {
    var index = existingEntry.heapIndex;
    existingEntry.heapIndex = null;
    var lastEntry = this.heap.pop();
    if (lastEntry === existingEntry)
      return;
    if (index === 1) {
      this.shiftDown(index, lastEntry);
      return;
    }
    var parentIndex = (index - index % 2) / 2;
    if (this.heap[parentIndex].scheduleTime <
        lastEntry.scheduleTime) {
      this.shiftDown(index, lastEntry);
    } else {
      this.shiftUp(index, lastEntry);
    }
  },
  shiftUp: function(index, entry) {
    while (index != 1) {
      var parentIndex = (index - index % 2) / 2;
      if (this.heap[parentIndex].scheduleTime <=
          entry.scheduleTime) {
        break;
      }
      this.heap[index] = this.heap[parentIndex];
      this.heap[index].heapIndex = index;
      index = parentIndex;
    }
    this.heap[index] = entry;
    this.heap[index].heapIndex = index;
  },
  shiftDown: function(index, entry) {
    while (2 * index < this.heap.length) {
      var childIndex = 2 * index;

      if (childIndex + 1 < this.heap.length &&
          (this.heap[childIndex + 1].scheduleTime <
           this.heap[childIndex].scheduleTime)) {
        ++childIndex;
      }

      if (entry.scheduleTime <=
          this.heap[childIndex].scheduleTime) {
        break;
      }
      this.heap[index] = this.heap[childIndex];
      this.heap[index].heapIndex = index;
      index = childIndex;
    }
    this.heap[index] = entry;
    this.heap[index].heapIndex = index;
  },
  earliestScheduleTime: function() {
    if (this.heap.length === 1) {
      return Infinity;
    }
    return this.heap[1].scheduleTime;
  },
  // returns null if no entry has scheduleTime <= currentTime
  extractFirst: function(currentTime) {
    if (this.heap.length === 1 ||
        currentTime < this.heap[1].scheduleTime) {
      return null;
    }
    var first = this.heap[1];
    this.remove(first);
    return first;
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
  processingPendingRecords: function() {
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
  masterScheduler.processingPendingRecords();
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
    // FIXME: \- should be ignored when delimiting,
    // and treated as - in id or symbol
    // http://www.w3.org/TR/SMIL3/smil-timing.html#q21
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
      token = value.substring(0, offsetIndex).trim();
      offset = parseOffsetValue(value.substring(offsetIndex));
    }
    // FIXME: \. should be ignored when delimiting,
    // and treated as . in id or symbol
    // http://www.w3.org/TR/SMIL3/smil-timing.html#q21
    var separatorIndex = token.indexOf('.');
    if (separatorIndex === -1) {
      if (token.indexOf('accessKey(') === 0 &&
          token[token.length - 1] === ')') {
        return {
          accessKey: token['accessKey('.length].charCodeAt(),
          offset: offset
        };
      } else {
        // FIXME: support other event values
        return undefined;
      }
    }
    var suffix = token.substring(separatorIndex + 1);
    if (suffix !== 'begin' && suffix !== 'end' &&
        suffix !== 'click' && suffix !== 'mouseover') {
      // FIXME: support other event values
      return undefined;
    }
    var id = value.substring(0, separatorIndex);
    result = {};
    result.id = id;
    if (suffix === 'begin' || suffix === 'end') {
      //FIXME: Support Syncbase dependency
      result.timeSymbol = suffix;
    } else {
      result.eventKind = suffix;
    }
    result.offset = offset;
    return result;
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

  this.createTimingInput();
  this.createEffectOptions();

  if (this.nodeName === 'mpath') {
    var parentRecord = animationRecords[element.parentNode.animationRecordId];
    if (parentRecord) {
      parentRecord.mpathRecord = this;
    }
  } else {
    this.processBeginEndSpec(true, this['begin']);
    this.processBeginEndSpec(false, this['end']);

    if (this.nodeName !== 'animateMotion') {
      this.createKeyframeAnimation();
    }
    // else we have animateMotion, and wait in case we have an mpath child
  }
};

AnimationRecord.prototype = {
  createTimingInput: function() {
    var timingInput = {};

    if (this.dur) {
      timingInput.duration = parseClockValue(this.dur);
    } else {
      // Absent duration means infinite duration.
      timingInput.duration = Infinity;
    }

    if (this.repeatCount) {
      if (this.repeatCount === 'indefinite') {
        timingInput.iterations = Infinity;
      } else {
        timingInput.iterations = parseFloat(this.repeatCount);
      }

      this.repeatDuration = timingInput.duration * timingInput.iterations;
    } else {
      this.repeatDuration = timingInput.duration;
    }

    if (this.repeatDur) {
      if (this.repeatCount) {
        this.repeatDuration = Math.min(
            this.repeatDuration,
            parseClockValue(this.repeatDur));
      } else {
        this.repeatDuration = parseClockValue(this.repeatDur);
      }

      if (timingInput.duration !== 0) {
        timingInput.iterations = this.repeatDuration / timingInput.duration;
      }
    }

    // http://www.w3.org/TR/smil/smil-timing.html#adef-fill
    // http://www.w3.org/TR/smil/smil-timing.html#adef-fillDefault
    if (this.fill === 'freeze' ||
        this.fill === 'hold' ||
        this.fill === 'transition' ||
        (this.fill !== 'remove' &&
         !this.dur &&
         !this.end &&
         !this.repeatCount &&
         !this.repeatDir)) {
      timingInput.fill = 'forwards';

      // FIXME: support this.fill === 'fillDefault',
      // where we must inspect the inherited fillDefault attribute.
    }

    if (this.calcMode === 'paced') {
      timingInput.easing = 'paced';
    }

    this.timingInput = timingInput;

    if (this.min) {
      this.minActiveDuration = parseClockValue(this.min);
    } else {
      this.minActiveDuration = 0;
    }

    if (this.max) {
      this.maxActiveDuration = parseClockValue(this.max);
    } else {
      this.maxActiveDuration = Infinity;
    }

    if (this.maxActiveDuration < this.minActiveDuration) {
      // http://www.w3.org/TR/SMIL3/smil-timing.html#Timing-MinMax
      // If !(max >= min) then both attributes are ignored.
      this.minActiveDuration = 0;
      this.maxActiveDuration = Infinity;
    } else {
      if (this.repeatDuration < this.minActiveDuration) {
        this.repeatDuration = this.minActiveDuration;
      } else if (this.repeatDuration > this.maxActiveDuration) {
        this.repeatDuration = this.maxActiveDuration;
      }
    }
  },

  createEffectOptions: function() {
    var options = {};

    // 'sum' adds to the underlying value of the attribute and other lower
    // priority animations.
    // http://www.w3.org/TR/smil/smil-animation.html#adef-additive
    if (this.additive && this.additive === 'sum') {
      // FIXME: use 'accumulate' when support is implemented in the
      // Web Animations Polyfill.
      options.composite = 'add';
    } else {
      // default behavior is options.composite = 'replace';
    }

    // http://www.w3.org/TR/smil/smil-animation.html#adef-accumulate
    if (this.accumulate &&
        this.accumulate === 'sum') {
      options.iterationComposite = 'accumulate';
    } else {
      // default behavior is options.iterationComposite = 'replace';
    }

    // http://www.w3.org/TR/SVG/animate.html#AnimateMotionElement
    if (this.rotate) {
      if (this.rotate === 'auto') {
        options.autoRotate = 'auto-rotate';
      } else if (this.rotate === 'auto-reverse') {
        options.autoRotate = 'auto-rotate';
        options.angle = 180;
      } else {
        options.angle = parseFloat(this.rotate);
      }
    } else {
      // default behavior is options.autoRotate = 'none';
    }

    this.options = options;
  },

  createAnimation: function() {
    if (this.target) {
      var animation = new Animation(this.target,
                                    this.effect,
                                    this.timingInput);
      this.animation = animation;

      if (isFinite(this.startTime)) {
        // The animation started before the target existed
        this.player =
            document.timeline.play(this.animation);
        this.player.startTime = this.startTime;
      }
    }
  },

  createKeyframeAnimation: function() {
    var attributeName = this.attributeName;

    if (!attributeName) {
      return;
    }

    var keyframes = null;
    if ((this.nodeName === 'animate' ||
         this.nodeName === 'animateTransform')) {
      // FIXME: Support more ways of specifying keyframes, e.g. by, or only to.
      // FIXME: Support ways of specifying timing function.

      var processValue;
      if (this.nodeName === 'animate') {
        processValue = function(value) { return value; };
      } else {
        // this.nodeName === 'animateTransform'
        var transformType;
        if (this.type === 'scale' ||
            this.type === 'rotate' ||
            this.type === 'skewX' ||
            this.type === 'skewY') {
          transformType = this.type;
        } else {
          transformType = 'translate'; // default if type is not specified
        }

        processValue = function(value) {
            return transformType + '(' + value + ')';
        };
      }

      var keyTimeList = undefined;
      // http://www.w3.org/TR/SVG/animate.html#KeyTimesAttribute
      // If the interpolation mode is 'paced', the ‘keyTimes’ attribute is
      // ignored. If the simple duration is indefinite, any ‘keyTimes’
      // specification will be ignored.
      if (this.keyTimes && this.calcMode !== 'paced' &&
          this.timingInput.duration !== Infinity) {
        keyTimeList = this.keyTimes.split(';');

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

      if (this.values) {
        var valueList = this.values.split(';');
        if (valueList[valueList.length - 1].trim() === '') {
          // The value list used by the LA Times spinner has a trailing ;

          // FIXME: ignore any trailing ';' in other lists too

          // Ignore the trailing ';'
          valueList.pop();
        }

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
      } else if (this.from && this.to) {

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

        keyframes[0][attributeName] = processValue(this.from);
        keyframes[1][attributeName] = processValue(this.to);
      }
    } else if (this.nodeName === 'set' && this.to) {
      keyframes = [
        {offset: 0},
        {offset: 1}
      ];
      keyframes[0][attributeName] = this.to;
      keyframes[1][attributeName] = this.to;
    }

    // http://www.w3.org/TR/SVG/animate.html#KeySplinesAttribute
    // This attribute is ignored unless the ‘calcMode’ is set to 'spline'.
    if (this.keySplines && this.calcMode === 'spline' && keyframes) {
      var keySplineList = this.keySplines.split(';');
      if (keySplineList.length + 1 === keyframes.length) {
        for (var splineIndex = 0;
             splineIndex < keySplineList.length;
             ++splineIndex) {
          // SVG delimits values by whitespace and optionally a comma.
          // Web Animations requires the comma.

          // FIXME: check that the values are all in the range 0 to 1.
          // The Web Animations spec requires x values must be in the range
          // [0, 1], but (unlike SMIL) it does not mention an allowed range
          // for y values.
          var spline = keySplineList[splineIndex];
          keyframes[splineIndex].easing = 'cubic-bezier(' +
              spline.replace(/,/g, ' ').trim().replace(/\s+/g, ',') +
              ')';
        }
      }
    }

    if (verbose) {
      console.log('keyframes  = ' + JSON.stringify(keyframes));
      console.log('options  = ' + JSON.stringify(this.options));
      console.log('timingInput  = ' + JSON.stringify(
          this.timingInput));
    }

    if (keyframes) {
      this.keyframes = keyframes;
      this.effect =
          new KeyframeEffect(keyframes, this.options);
      this.createAnimation();
    }
  },

  createMotionPathAnimation: function() {
    var resolvedPath;
    if (this.mpathRecord) {
      var pathRef = this.mpathRecord['xlink:href'];
      if (pathRef && pathRef.indexOf('#') === 0) {
        this.pathNode =
            document.getElementById(pathRef.substring(1));
        if (this.pathNode) {
          resolvedPath = this.pathNode.getAttribute('d');
        }
      }
    } else {
      resolvedPath = this.path;
    }

    // http://www.w3.org/TR/SVG/animate.html#AnimateMotionElement
    // Regarding the definition of the motion path, the ‘mpath’ element
    // overrides the ‘path’ attribute, which overrides ‘values’, which
    // overrides ‘from’, ‘by’ and ‘to’.
    if (!resolvedPath) {
      // FIXME: When an mpath child is added, we should update the resolvedPath

      if (this.values) {
        var valueList = this.values.split(';');
        resolvedPath = 'M ' + valueList.join(' L ');
      } else {
        // FIXME: support 'by' and optional 'from', 'to'
        if (this.from && this.to) {
          resolvedPath = 'M ' + this.from + ' L ' + this.to;
        }
      }
    }

    if (verbose) {
      console.log('resolvedPath = ' + resolvedPath);
      console.log('options  = ' + JSON.stringify(this.options));
      console.log('timingInput  = ' + JSON.stringify(
          this.timingInput));
    }

    if (resolvedPath) {
      this.resolvedPath = resolvedPath;
      this.effect =
          new MotionPathEffect(resolvedPath, this.options);
      this.createAnimation();
    }
  },

  processBeginEndSpec: function(isBegin, value) {
    var specs = parseBeginEnd(isBegin, value);
    for (var index = 0; index < specs.length; ++index) {
      var spec = specs[index];
      if (typeof spec === 'number') {
        this.addInstanceTime(spec, isBegin);
      } else {
        spec.owner = this;
        spec.isBegin = isBegin;

        if (spec.accessKey) {
          if (!accessKeyTimeValueSpecs) {
            // We were not yet listening for keypress
            accessKeyTimeValueSpecs = {};
            document.documentElement.addEventListener('keypress',
                processKeystroke);
          }
          if (!accessKeyTimeValueSpecs[spec.accessKey]) {
            // We were not yet listening for spec.accessKey
            accessKeyTimeValueSpecs[spec.accessKey] = [];
          }
          accessKeyTimeValueSpecs[spec.accessKey].push(spec);
        } else if (spec.eventKind === 'click' || spec.eventKind === 'mouseover') {
          var mouseTarget = document.getElementById(spec.id);
          if (!mouseTarget) {
            // FIXME: register listener when target is created
            return;
          }
          mouseTarget.addEventListener(spec.eventKind, function() {
            var currentTime = document.timeline.currentTime;
            spec.owner.addInstanceTime(currentTime + spec.offset, spec.isBegin);
          });
        }
        // FIXME: support more spec types than only accessKey, click, mouseover
      }
    }
  },

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
      return undefined;
    }
    var queue = isBegin ? this.beginInstanceTimes : this.endInstanceTimes;
    var result = { scheduleTime: instanceTime };
    queue.insert(result);
    this.updateMainSchedule();
    return result;
  },
  processNow: function() {
    if (this.scheduleTime > document.timeline.currentTime) {
      throw new Error('Scheduled too early');
    }

    if (this.beginInstanceTimes.earliestScheduleTime() <=
        this.endInstanceTimes.earliestScheduleTime()) {

      var scheduleTime = this.beginInstanceTimes.extractFirst().scheduleTime;
      if (this.scheduleTime !== scheduleTime) {
        throw new Error('Inconsistent schedule');
      }
      // this element is no longer in the main schedule
      this.scheduleTime = Infinity;

      if (this.currentIntervalEnd) {
        this.endInstanceTimes.remove(this.currentIntervalEnd);
        this.currentIntervalEnd = null;
      }

      // Start time is finite if we are currently playing
      if (this.startTime !== Infinity) {
        if (this.player) {
          this.player.cancel();
        }

        this.dispatchEvent('end', 0);
      }

      this.startTime = scheduleTime; // used if target is created later
      if (this.animation) {
        this.player = document.timeline.play(this.animation);
        this.player.startTime = this.startTime;
      }
      // else target does not exist or is not SVG

      this.dispatchEvent('begin', 0);

      // Sets this.currentIntervalEnd
      this.computeCurrentInterval();
    } else {

      var extractedEndTime = this.endInstanceTimes.extractFirst();
      var scheduleTime = extractedEndTime.scheduleTime;
      if (this.scheduleTime !== scheduleTime) {
        throw new Error('Inconsistent schedule');
      }
      // this element is no longer in the main schedule
      this.scheduleTime = Infinity;

      if (this.currentIntervalEnd) {
        if (this.currentIntervalEnd !== extractedEndTime) {
          this.endInstanceTimes.remove(this.currentIntervalEnd);
        }
        this.currentIntervalEnd = null;
      }

      if (this.startTime !== Infinity && this.player) {
        if (this.fill === 'freeze') {
          this.player.pause();
          this.player.currentTime = scheduleTime - this.player.startTime;
        } else {
          this.player.cancel();
          this.player = null;
        }

        this.dispatchEvent('end', 0);
      }
      this.startTime = Infinity; // not playing
    }

    this.updateMainSchedule();
  },

  computeCurrentInterval: function() {

    // Allows for duration and repeat count and min and max
    var repeatDuration = this.repeatDuration;
    if (!isFinite(repeatDuration)) {
      return;
    }
    var endTime = this.startTime + repeatDuration;

    var earliestScheduleTime = Math.min(
        this.beginInstanceTimes.earliestScheduleTime(),
        this.endInstanceTimes.earliestScheduleTime());

    if (endTime < earliestScheduleTime) {
      this.currentIntervalEnd = this.addInstanceTime(endTime, false);
      // Note that events or DOM calls may lead to the interval ending early.
    }
  },

  dispatchEvent: function(eventType, detailArg) {
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
    animationRecords[node.animationRecordId].createMotionPathAnimation();
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
      waitingList[waitingIndex].createAnimation();
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
    masterScheduler.processingPendingRecords();
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
  masterScheduler.processingPendingRecords();

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

function processKeystroke(event) {
  var specs = accessKeyTimeValueSpecs[event.charCode];
  if (specs) {
    var currentTime = document.timeline.currentTime;
    for (var index = 0; index < specs.length; ++index) {
      var spec = specs[index];
      spec.owner.addInstanceTime(currentTime + spec.offset, spec.isBegin);
    }
  }
}

function millisecondsToSeconds(milliseconds) {
  return milliseconds / 1000;
}

function secondsToMilliseconds(seconds) {
  return seconds * 1000;
}

function instanceTimeRequest(node, methodName, offsetSeconds, isBegin) {
    updateRecords();
    var animationRecord = animationRecords[node.animationRecordId];
    if (animationRecord) {
      var instanceTime = document.timeline.currentTime +
          secondsToMilliseconds(offsetSeconds);
      animationRecord.addInstanceTime(instanceTime, isBegin);
      masterScheduler.processingPendingRecords();
    } else {
      throw new Error(methodName + '() on unknown ' +
          node.nodeName + ' ' + node.id);
    }
}

if (window['SVGPolyfillAnimationElement']) {
  Object.defineProperty(SVGPolyfillAnimationElement.prototype,
                        'targetElement', {
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
      masterScheduler.processingPendingRecords();
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
}

window._SmilInJavascriptTestingUtilities = {
  _parseClockValue: parseClockValue,
  _parseOffsetValue: parseOffsetValue,
  _parseBeginEndValue: parseBeginEndValue,
  _parseBeginEnd: parseBeginEnd,
  _priorityQueue: PriorityQueue
};

})();
