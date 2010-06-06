
/*
 * sbICategoryShuffleManager XPCOM Service Implementation
 *
 * Copyright (c) 2009 Steven M. Lloyd
 * steve@repeatingbeats.com
 *
 *
 * This file is part of the Category Shuffle Songbird add-on.
 *
 * This file may be licensed under the terms of of the
 * GNU General Public License Version 2 (the ``GPL'').
 *
 * Software distributed under the License is distributed
 * on an ``AS IS'' basis, WITHOUT WARRANTY OF ANY KIND, either
 * express or implied. See the GPL for the specific language
 * governing rights and limitations.
 *
 * You should have received a copy of the GPL along with this
 * program. If not, go to http://www.gnu.org/licenses/gpl.html
 * or write to the Free Software Foundation, Inc.,
 * 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301, USA.
 *
 */

if(typeof(Cc)=="undefined")
  var Cc = Components.classes;
if(typeof(Ci)=="undefined")
  var Ci = Components.interfaces;
if(typeof(Cu)=="undefined")
  var Cu = Components.utils;
if(typeof(Cr)=="undefined")
  var Cr = Components.results;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");  
Cu.import("resource://app/jsmodules/sbProperties.jsm");
Cu.import("resource://app/jsmodules/sbLibraryUtils.jsm");

// XPCOM component details
const DESCRIPTION = "Category Shuffle Manager";
const CID         = Components.ID("088c1abf-47d9-433b-851f-e00d0c6a7f88");
const CONTRACTID  = "@repeatingbeats.com/songbird/category-shuffle-manager;1";

// XPCOM component constructor
function sbICategoryShuffleManager() {
  
};

sbICategoryShuffleManager.prototype.constructor = sbICategoryShuffleManager;

sbICategoryShuffleManager.prototype = {

  // XPCOM details
  classDescription: DESCRIPTION,
  classID:  Components.ID(CID),
  contractID:  CONTRACTID,

  QueryInterface : function(aIID) {
    if (aIID.equals(Ci.sbICategoryShuffleManager)) {
      return this;
    }
    if (!aIID.equals(Ci.nsISupports)) {
      throw Cr.NS_ERROR_NO_INTERFACE;
    }
    return this;
  },

  // ---- end boilerplate

  initialized : false,

  category : "",
  
  _CATEGORIES : [ SBProperties.albumName,
                  SBProperties.artistName,
                  SBProperties.albumArtistName,
                  SBProperties.composerName,
                  SBProperties.year,
                  SBProperties.genre, 
                  SBProperties.rating ],

  _categorySequence : {},
  _isPlaying : false,
  _nowPlayingTrack : null,

  initialize : function() {
    // set up our mediacore listener
    this._gMM = Cc["@songbirdnest.com/Songbird/Mediacore/Manager;1"]
                 .getService(Ci.sbIMediacoreManager);
    var self = this;
    var mediacoreListener = {
      onMediacoreEvent : function(e) {
        switch (e.type) {
          case Ci.sbIMediacoreEvent.TRACK_CHANGE:
            self._nowPlayingTrack = e.data;
            self._handleTrackChange();
            break;
          case Ci.sbIMediacoreEvent.STREAM_START:
            self._isPlaying = true;
            break;
          case Ci.sbIMediacoreEvent.STREAM_STOP:
            self._isPlaying = false;
            self._handleStreamStop();
            break;
          case Ci.sbIMediacoreEvent.STREAM_END:
            self._isPlaying = false;
            self._handleStreamEnd();
            break;
        }
      }
    }
    this._gMM.addListener(mediacoreListener);

    this.initialized = true;
  },

  handlePlayEvent : function() {
    // set our internal now playing track to the selection so that the custom
    // generator regenerates appropriately
    var view = this._getCurrentMediaListView();
    var selection = view.selection;
    if (selection.currentIndex != -1) {
      this._nowPlayingTrack = selection.currentMediaItem;
    }
  },

  // set the metadata category we are shuffling by
  setCategory : function(aCategory) {
    var index = this._CATEGORIES.indexOf(aCategory);
    if (index != -1 || aCategory == "") {
      this.category = aCategory;
    }
  },

  // return the list of categories that are available
  getAllCategories : function(aCount) {
    aCount.value = this._CATEGORIES.length;
    return this._CATEGORIES;
  },

  // turn off category shuffle
  disable : function() {
    var sequencer = this._gMM.sequencer;
     if (sequencer.mode == sequencer.MODE_CUSTOM) {
        sequencer.mode = sequencer.MODE_FORWARD;
     }
     this._categorySequence[this.category] = [];
     this.category = "";
     this._shuffling = false;
  },

  // restore category shuffle
  enable : function() {
    this._loadSequence();
  },
  
  // generate a random sequence of values in the current category and load the
  // tracks with the first value
  generateSequence : function() {
    var category = this.category;
    var view = this._getCurrentMediaListView();
    this._generateSequenceForCategory(category, view);
    this._loadSequence();
  },

  // play category shuffle
  playSequence : function() {
    this._getNextValue = true;
    this._loadSequence();
    var current = this._gMM.sequencer.currentItem;
    var next = this._gMM.sequencer.nextItem;
    // catch indefinite repetition of the last track in a sequence when ALL
    // tracks in a view have the same value for the shuffle category
    var stopSequence = (current && !next);
    // if current and next are null, we need to dispatch a play event instead
    // of just telling the sequencer to play
    var dispatchPlay = (!current && !next);
    if (stopSequence) {
      this._repeatedSequenceItem = current;
    }
    if (dispatchPlay) {
      var mediaTab = this._getMediaTab();
      if (mediaTab) {
         mediaTab.getPlaylist().sendPlayEvent();
      }
    } else {
      this._gMM.sequencer.play();
    }
  },

  _getCurrentMediaListView : function() {
    var view;
    var gBrowser = this._getWindow().gBrowser;
    if (gBrowser) {
      view = gBrowser.mediaTab.mediaListView;
    }
    if (!view) {
      view = LibraryUtils.createStandardMediaListView(LibraryUtils.mainLibrary);
    }
    return view;
  },

  _getMediaTab : function() {
    var gBrowser = this._getWindow().gBrowser; 
    var tab = null;
    if (gBrowser) {
      tab = gBrowser.mediaTab;
    }
    return tab;
  },

  _getWindow : function() {
    var windowMediator = Cc["@mozilla.org/appshell/window-mediator;1"]
                           .getService(Ci.nsIWindowMediator);
    return windowMediator.getMostRecentWindow("Songbird:Main");
  },

  _generateSequenceForCategory : function(aCategory, aView) {
    var categoryEnumerator = aView.getDistinctValuesForProperty(aCategory);
    var values = [];
    while (categoryEnumerator.hasMore()) {
      values.push(categoryEnumerator.getNext());
    }
    this._categorySequence[aCategory] = this._generateRandomSequence(values);
  },

  _getNextValueForCategory : function(aCategory, aView) {
    if (!this._categorySequence[aCategory] ||
         this._categorySequence[aCategory].length == 0) {
      this._generateSequenceForCategory(aCategory, aView);
    }
    return this._categorySequence[aCategory].splice(0,1)[0];
  },
 
  // from the sequence of category values (Album 1, Album 2, Album 3, etc), grab
  // all tracks that match the first value and load them into the sequencer
  _loadSequence : function() {
    var sequenceGenerator = this._getSequenceGenerator(this.category);
    var sequencer = this._gMM.sequencer;
    sequencer.customGenerator = sequenceGenerator;
    sequencer.mode = sequencer.MODE_CUSTOM;
    this._shuffling = true;
  },

  _handleStreamStop : function() {
    // we need to queue up another sequence at the end of our
    // custom sequence. need to fix the bug introduced by this
    // where any other source of STREAM_STOP on the last track
    // in a custom sequence will fire off a new sequence 
    var sequencer = this._gMM.sequencer;
    var sequenceLength = sequencer.currentSequence.length;
    var position = sequencer.sequencePosition;
    if (this._shuffling && (position == (sequenceLength-1))) {
      this.playSequence();
    }
  },

  _handleStreamEnd : function() {
    if (this._shuffling) {
      this.playSequence();
    }
  },

  _handleTrackChange : function() {
    // stop the sequencer if we are repeating the last item of a sequence
    if (this._repeatedSequenceItem) {
      if (this._repeatedSequenceItem.equals(this._nowPlayingTrack)) {
        this._gMM.sequencer.stop();
        this._repeatedSequenceItem = null;
      }
    }
  },

  // Return the custom sbIMediacoreSequenceGenerator
  // TODO: This is getting pretty big -> do a full XPCOM implementation
  //       instead of the JSObject
  _getSequenceGenerator : function(category) {

    var manager = this;

    // implementation of sbIMediacoreSequenceGenerator
    var generator = {
    
      _generateSequence : function(aCategory, aValue, aView) {
        var sequence = [];
        var listener = {
          onEnumerationBegin: function(aList) {},
          onEnumeratedItem : function(aList, aItem) {
            try {
              var index = aView.getIndexForItem(aItem);
              sequence.push(index);
            } catch (err) {
              // no problem, catches NS_ERROR_NOT_AVAILABLE when item is not
              // in the view
            }
          },
          onEnumerationEnd : function(aList, aCode) {},
        }
        aView.mediaList.enumerateItemsByProperty(aCategory, aValue, listener);
        if (aCategory == SBProperties.albumName) {
          this._sortSequence(sequence, SBProperties.trackNumber, aView);
        }
        return sequence;
      },  

      _sortSequence : function(aSequence, aProperty, aView) {

        // need to make this generic
        if (aProperty == SBProperties.trackNumber) {
          aSequence.sort (function (a,b) {
            var trackA = aView.getItemByIndex(a);
            var trackB = aView.getItemByIndex(b);
            // Right now we just sort by track number for album shuffle and
            // ignore sorting for all other categories. Sort by disc then by
            // track number for multidisc albums
            var discA = trackA.getProperty(SBProperties.discNumber);
            var discB = trackB.getProperty(SBProperties.discNumber);
            if (discA != discB) {
              return discA - discB;
            } else {
              return parseInt(trackA.getProperty(SBProperties.trackNumber)) -
                     parseInt(trackB.getProperty(SBProperties.trackNumber));
            }
          });
        }
            
      },

      _getNowPlayingValue : function(aCategory) {
        if (manager._isPlaying) {
          return manager._nowPlayingTrack.getProperty(aCategory);
        } else {
          return null;
        }
      },
    
      _getSelectedValue : function(aView, aCategory) {
        var selection = aView.selection;
        if (selection.count == 0 || selection.currentIndex < 0) {
          return null;
        }
        return selection.currentMediaItem.getProperty(aCategory);
      },

      onGenerateSequence : function(aView, aSequenceLength) {

        // Generate a sequence of items in a aView with the given property/value
        // combination.

        // TODO: Enable a secondary sort that controls track ordering within
        //       the sequence. For the time being, enforce trackNumber ordering
        //       for Album Shuffle and let other categories sort according
        //       to their order on the medialist.

        var shuffleValue = null;
        if (!manager._getNextValue) {
          // first try the playing track
          shuffleValue = this._getNowPlayingValue(category);
          if (!shuffleValue) {
            // then try the selected value
            shuffleValue = this._getSelectedValue(aView,category);
          }
        }
        if (!shuffleValue) {
          // get the next value in the sequence
          shuffleValue = manager._getNextValueForCategory(category, aView);
        }
        manager._getNextValue = false;
      
        var sequence = this._generateSequence(category, shuffleValue, aView);
        if (sequence.length == 0) {
          // no values in this view, so generate a new random category sequence
          manager._generateSequenceForCategory(category, aView);
          shuffleValue = manager._getNextValueForCategory(category, aView); 
          sequence = this._generateSequence(category, shuffleValue, aView);
        }
        // need to prevent last track from repeating over and over when there
        // is only a single 
        aSequenceLength.value = sequence.length;
        return sequence;
      }
    }
    return generator;
  },

  // random permutation of input JS array
  // Fisher-Yates shuffle
  // (http://en.wikipedia.org/wiki/Fisher%E2%80%93Yates_shuffle)
  _generateRandomSequence : function(data) {
    var n = data.length;
    if (n == 0) {
      return null;
    }
    var indices = new Array(n);
    var sequence = new Array(n);
    for (var i=0; i<n; i++) {
       indices[i] = i;
    }
    while (n-- > 1) {
      var rand = Math.floor( (n + 1) * Math.random() );
      sequence[n] = data[indices[rand]];
      indices[rand] = indices[n];
      // don't need to swap rand back to n because we're filling the data
      // into sequence as we go
    }
    sequence[0] = data[indices[0]];
    return sequence;
  },

};

// doing this the long way instead of using XPCOMUtils so we can 
// ensure the service is a singleton
var sbICategoryShuffleManagerFactory = {

  singleton : null,

  createInstance : function(aOuter, aIID) {
    if (aOuter != null) {
      throw Cr.NS_ERROR_NO_AGGREGATION;
    }
    if (this.singleton == null) {
      this.singleton = new sbICategoryShuffleManager();
    }
    return this.singleton.QueryInterface(aIID);
  }
};

var sbICategoryShuffleManagerModule = {

  registerSelf : function(aCompMgr, aFileSpec, aLocation, aType) {
    aCompMgr = aCompMgr.QueryInterface(Ci.nsIComponentRegistrar);
    aCompMgr.registerFactoryLocation(CID, DESCRIPTION, CONTRACTID,
                                     aFileSpec, aLocation, aType);
  },

  unregisterSelf : function(aCompMgr, aLocation, aType) {
    aCompMgr = aCompMgr.QueryInterface(Ci.nsIComponentRegistrar);
    aCompMgr.unregisterFactoryLocation(CID, aLocation);
  },

  getClassObject : function(aCompMgr, aCID, aIID) {
    if (!aIID.equals(Ci.nsIFactory)) {
      throw Cr.NS_ERROR_NOT_IMPLEMENTED;
    }
    if (aCID.equals(CID)) {
      return sbICategoryShuffleManagerFactory;
    }
    throw Cr.NS_ERROR_NO_INTERFACE;
  },
  
  canUnload : function(aCompMgr) {
    return true;
  }
};

function NSGetModule(aCompMgr, aFileSpec) { return sbICategoryShuffleManagerModule; }
