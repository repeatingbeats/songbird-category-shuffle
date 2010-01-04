
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

  initialize : function() {
    // set up our mediacore listener
    this._gMM = Cc["@songbirdnest.com/Songbird/Mediacore/Manager;1"]
                 .getService(Ci.sbIMediacoreManager);
    var self = this;
    var mediacoreListener = {
      onMediacoreEvent : function(e) {
        switch (e.type) {
          case Ci.sbIMediacoreEvent.BEFORE_TRACK_CHANGE:
            // when returning from normal shuffle, the sequencer
            // starts at position one instead of zero.  
            if (self._sequenceLoaded) {
              var sequencer = self._gMM.sequencer;
              while (sequencer.sequencePosition != 0) {
                sequencer.previous();
              }
              self._sequenceLoaded = false;
            }
            break;
          case Ci.sbIMediacoreEvent.STREAM_STOP:
            self._handleStreamStop();
            break;
          case Ci.sbIMediacoreEvent.STREAM_END:
            self._handleStreamEnd();
            break;
          case Ci.sbIMediacoreEvent.VIEW_CHANGE:
            self._addViewListener(e.data);
            break;
        }
      }
    }
    this._gMM.addListener(mediacoreListener);
    this.initialized = true;
  },

  setCategory : function(aCategory) {
    var index = this._CATEGORIES.indexOf(aCategory);
    if (index != -1 || aCategory == "") {
      this.category = aCategory;
    }
  },

  getAllCategories : function(aCount) {
    aCount.value = this._CATEGORIES.length;
    return this._CATEGORIES;
  },

  turnOff : function() {
    var sequencer = this._gMM.sequencer;
     if (sequencer.mode == sequencer.MODE_CUSTOM) {
        sequencer.mode = sequencer.MODE_FORWARD;
     }
     this._categorySequence[this.category] = [];
     this.category = "";
     this._shuffling = false;
  },

  restore : function() {
    var sequencer = this._gMM.sequencer;
    sequencer.mode = sequencer.MODE_FORWARD;
  },
  
  generateSequence : function() {
    // grab the current mediaListView. if we can't get one, create one from the
    // main library. this can introduce a bug where we create a sequence of 
    // songs that aren't in the current view. need to fix
    var category = this.category;
    var windowMediator = Cc["@mozilla.org/appshell/window-mediator;1"]
                           .getService(Ci.nsIWindowMediator);
    var recentWindow = windowMediator.getMostRecentWindow("Songbird:Main");
    var browser = recentWindow.gBrowser;
    var view;
    if (browser) {
      view = recentWindow.gBrowser.currentMediaListView;
    }
    if (!view) {
      view = LibraryUtils.createStandardMediaListView(LibraryUtils.mainLibrary);
    }
    this._addViewListener(view);
    // get the possible values for this category's property and generate
    // a random sequence
    var categoryEnumerator = view.getDistinctValuesForProperty(category);
    var values = [];
    while (categoryEnumerator.hasMore()) {
      values.push(categoryEnumerator.getNext());
    }
    this._categorySequence[category] = this._generateRandomSequence(values);
    this._loadSequence();
  },

  playSequence : function() {
    this._loadSequence();
    this._gMM.sequencer.play();
  },

  _loadSequence : function() {
    var category = this.category;
    if (!this._categorySequence[category] ||
         this._categorySequence[category].length == 0) {
      this.generateSequence();
      return;
    }
    var value = this._categorySequence[category].splice(0,1)[0];
    var sequenceGenerator = this._getSequenceGenerator(category,value);
    var sequencer = this._gMM.sequencer;
    // trigger a regenerate even if we are already in MODE_CUSTOM
    sequencer.mode = sequencer.MODE_FORWARD;
    sequencer.customGenerator = sequenceGenerator;
    sequencer.mode = sequencer.MODE_CUSTOM;
    this._shuffling = true;
    this._sequenceLoaded = true;
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

  _addViewListener : function(view) {
    var self = this;
    var listener = {
      onFilterChanged : function(changedView) {
        self._onViewChanged(changedView);
      },
      onSearchChanged : function(changedView) {
        self._onViewChanged(changedView);
      },
      onSortChanged : function(changedView) {
        // don't care about sort
      }
    }
    // remove the previous listener
    var oldListener = this._currentViewListener;
    if (oldListener) {
      oldListener.view.removeListener(oldListener.listener);
    }
    view.addListener(listener,false);
    this._currentViewListener = { listener : listener,
                                  view : view
                                };
  },

  _onViewChanged : function(view) {

    if (!this._shuffling) {
      return;
    }
    // blow up the category sequence
    this._categorySequence[this.category] = [];
    var nextItem = this._gMM.sequencer.nextItem;
    var index = -1;
    if (nextItem) {
      try {
        index = view.getIndexForItem(nextItem);
      } catch(err) {
        // do nothing
      }
    }
    
    if (index == -1) {
      // the next item in our custom sequence is not in the current view
      // reload our sequence
      this._loadSequence();
    }
  },

  _getSequenceGenerator : function(category,value) {
    var self = this;
    var generator = {
      onGenerateSequence : function(view, aSequenceLength) {

        // generate a sequence of items in the view the property/value combo
        // where the category is the property. Eventually there should be
        // a feature where users can choose a 'secondary sort' that controls
        // how tracks are ordered (including a random option). For the time
        // being, enforce trackNumber order for Album Shuffle and let other
        // categories sort according to their medialist order
        var doSort = (category == SBProperties.albumName);
              
        var sequence = []; 
        var listener = {
          onEnumerationBegin : function(list) {},
          onEnumeratedItem : function(list,item) {
            try {
              var index = view.getIndexForItem(item);
              sequence.push(index);
            } catch (err) {
              // no problem ... will catch NS_ERROR_NOT_AVAILABLE when the item
              // is not in the index
            }
          },
          onEnumerationEnd : function(list,code) {}
        }
        view.mediaList.enumerateItemsByProperty(category, value, listener);
        if (doSort) {
          // need to make this generic for secondar sort property
          sequence.sort( function(a,b) {
            var trackA = view.getItemByIndex(a);
            var trackB = view.getItemByIndex(b);
            return parseInt(trackA.getProperty(SBProperties.trackNumber)) -
                   parseInt(trackB.getProperty(SBProperties.trackNumber));
          });
        }
        
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
