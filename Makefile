all: dist/ennuiboard.min.js

dist/ennuiboard.min.js: src/* node_modules/.bin/tsc
	npm run build

node_modules/.bin/tsc:
	npm install

clean:
	rm -rf dist/ src/*.js
