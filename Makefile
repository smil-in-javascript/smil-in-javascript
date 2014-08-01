
svg-animations.js: web-animations.js smil-in-javascript.js
	cat web-animations.js smil-in-javascript.js >svg-animations.js

clean:
	rm -f svg-animations.js smil-in-javascript-4lint.js

lint: smil-in-javascript.js test/harness.js test/testcases/*.js test/unit-tests/*.js
	./run-lint.sh

unit-test:
	karma start --single-run
