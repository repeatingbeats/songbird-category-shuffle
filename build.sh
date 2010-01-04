#! /bin/bash

# Copyright (c) 2009 Steven M. Lloyd
# steve@repeatingbeats.com

EXTENSION=categoryshuffle
echo $EXTENSION packaging process initiated...

# Songbird source directory location -
# environment var or declare it here
# SONGBIRD=/path/to/songbird/trunk

rm *.xpi
rm $SONGBIRD/compiled/extensions/$EXTENSION/*.xpi

case $1 in
'mini')
	echo mini build: updating $EXTENSION install package
	MAKE_COMMAND="make -C $SONGBIRD/compiled/extensions/$EXTENSION"
;;
'full')
	echo full build: compiling Songbird
	MAKE_COMMAND="make -C $SONGBIRD -f songbird.mk"
;;
*)
	echo usage \'./build.sh BUILD_TYPE\' where BUILD_TYPE is mini or full
	exit
;;
esac	
rsync -rv --exclude "*.svn" --exclude "*.swp" \
          --exclude "*.git" --exclude ".DS_Store" \
          $EXTENSION $SONGBIRD/extensions/
$MAKE_COMMAND
cp $SONGBIRD/compiled/extensions/$EXTENSION/*.xpi .
