MINIFIER=closure-compiler --language_in=ECMASCRIPT5
#MINIFIER=cat

all: ennuiboard.min.js

ennuiboard.min.js: ennuiboard.js
	cat $< | $(MINIFIER) | cat license.js - > $@
