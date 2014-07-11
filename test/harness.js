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

'use strict';

function timing_test_impl(callback, desc) {
  console.log('RUNNING: ' + desc);
  var svgFragmentList = document.querySelectorAll('svg');

  var expectationList = [];
  var expectationIndex = -1;

  var numExpectationMatches = 0;

  // Control debug logging.
  var verbose = false;

  function setTime(millis) {
    for (var fragmentIndex = 0;
         fragmentIndex < svgFragmentList.length;
         ++fragmentIndex) {
      svgFragmentList[fragmentIndex].pauseAnimations();
      svgFragmentList[fragmentIndex].setCurrentTime(millis / 1000);
    }
    document.timeline._pauseAnimationsForTesting(millis);
  }

  function verifyExpectation() {
    var expectation = expectationList[expectationIndex];
    var expectedValue = expectation.expectedValue;

    // FIXME: getAttribute(expectation.propertyName) does not return
    // animated value for polyfillAnimatedElement but does for
    // nativeAnimatedElement.
    var polyfillAnimatedValue = expectation.polyfillAnimatedElement.
        attributes[expectation.propertyName].value;
    var nativeAnimatedValue = expectation.nativeAnimatedElement.
        attributes[expectation.propertyName].value;

    var matched = false;
    if (Array.isArray(expectedValue)) {
      if (expectedValue.indexOf(polyfillAnimatedValue) > -1 &&
          expectedValue.indexOf(nativeAnimatedValue) > -1) {
        matched = true;
      }
    } else {
      if (polyfillAnimatedValue === expectedValue.toString() &&
          nativeAnimatedValue === expectedValue.toString()) {
        matched = true;
      }
    }

    if (verbose || !matched) {
      console.log(expectation.millis + 'ms ' + expectation.propertyName +
          ' expected=' + expectedValue +
          ' polyfill=' + polyfillAnimatedValue +
          ' native=' + nativeAnimatedValue + '.');
    }

    if (matched) {
      ++numExpectationMatches;
    }
    scheduleNext();
  }

  function scheduleNext() {
    ++expectationIndex;
    if (expectationIndex < expectationList.length) {
      var expectation = expectationList[expectationIndex];
      setTime(expectation.millis);
      window.requestAnimationFrame(verifyExpectation);
    } else if (numExpectationMatches === expectationList.length) {
      console.log('PASSED: ' + desc);
    } else {
      console.log('FAILED: ' + desc);
    }
  }

  var original_at = window.at;
  window.at = function(millis, propertyName, expectedValue,
                       polyfillAnimatedElement, nativeAnimatedElement) {
    expectationList.push({
      millis: millis,
      propertyName: propertyName,
      expectedValue: expectedValue,
      polyfillAnimatedElement: polyfillAnimatedElement,
      nativeAnimatedElement: nativeAnimatedElement
    });
  };
  callback();
  window.at = original_at;

  scheduleNext();
}

// FIXME: support a sequence of timing tests.
// For now, timing_test may only be called once.
function timing_test(callback, desc) {
  window.addEventListener('load', function() {
    timing_test_impl(callback, desc);
  });
}
