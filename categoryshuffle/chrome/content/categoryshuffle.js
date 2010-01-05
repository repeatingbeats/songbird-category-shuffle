/*
 * Controller script for Category Shuffle
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

if (typeof(Cc) == 'undefined')
  var Cc = Components.classes;
if (typeof(Ci) == 'undefined')
  var Ci = Components.interfaces;
if (typeof(Cu) == 'undefined')
  var Cu = Components.utils;
if (typeof(Cr) == 'undefined')
  var Cr = Components.results;

Cu.import("resource://app/jsmodules/sbProperties.jsm");
Cu.import("resource://app/jsmodules/sbLibraryUtils.jsm");
Cu.import("resource://app/jsmodules/kPlaylistCommands.jsm");

if (typeof CategoryShuffle == 'undefined') {
  var CategoryShuffle = {};
}

CategoryShuffle.Controller = {

  XMLNS : "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
  ID_PREFIX : "categoryshuffle_",

  onLoad: function() {

    var self = this; 
    this._strings = document.getElementById("categoryshuffle-strings");

    // set up the manager
    this.mgr = Cc["@repeatingbeats.com/songbird/category-shuffle-manager;1"]
                 .getService(Ci.sbICategoryShuffleManager);
    var onPlayerSwitch = false;
    if (!this.mgr.initialized) {
      this.mgr.initialize();
      this.mgr.setCategory(
        Application.prefs.get("extensions.categoryshuffle.category").value);
    } else {
      // if the manager is initialized, we must be loading a window on a switch
      // between main and mini players
      onPlayerSwitch = true;
    }

    // build the menu 
    var propMgr = Cc["@songbirdnest.com/Songbird/Properties/PropertyManager;1"]
                    .getService(Ci.sbIPropertyManager);
    var menupopup = document.getElementById("menu_category_shuf_popup");
    var categorySeparator =
      document.getElementById("menu_category_shuf_separator");
    this.byLabel = this._strings.getString("byLabel");
    this.randomPlayMenuitem =
      document.getElementById("menu_category_shuf_play_random");
    this.randomPlaySeparator =
      document.getElementById("menu_category_shuf_separator");
    this.menuitems = [];
    
    var aCount = {};
    this.categories = this.mgr.getAllCategories(aCount);
    for (var i in this.categories) {

      var category = this.categories[i];
      var displayName = propMgr.getPropertyInfo(category).displayName;
      var menuitem = document.createElementNS(this.XMLNS,"menuitem");
      menuitem.setAttribute("id", (this.ID_PREFIX + category));
      menuitem.setAttribute("label", (this.byLabel + " " + displayName));
      menuitem.setAttribute("type", "radio");
      menuitem.setAttribute("name", "categoryshuffle");
      menupopup.insertBefore(menuitem, categorySeparator);
     
      menuitem.addEventListener("command", function() {
        var category = this.id.substring(self.ID_PREFIX.length);
        if (self.mgr.category == category) {
          if (self.shuffleDataRemote.intValue == 1) {
            //dump("restore\n");
            self.mgr.restore();
            
          }
          return;
        }
        self.mgr.setCategory(category);
        Application.prefs.setValue("extensions.categoryshuffle.category",
                                   category);
        self.restoreCategoryShuffle(false);
      }, false);

      this.menuitems.push(menuitem);
    }

    // listen for turning category shuffle off via the menu
    var offCommand =
      document.getElementById("categoryshuffle-off-command");
    offCommand.addEventListener("command", function() {
      Application.prefs.setValue("extensions.categoryshuffle.category", "");
      self.turnCategoryShuffleOff();
      self.mgr.turnOff();
    }, false);

    this.offMenuitem =
      document.getElementById("categoryshuffle-menu-off");
 
    // listen to changes in the shuffle dataremote 
    var shuffleObserver = {
      observe : function(subject, topic, data) {
        if (data == 0) {
          dump("heard it from the observer too\n");
          self.restoreCategoryShuffle(false);
        } else {
          self.turnCategoryShuffleOff();
        }
      }
    }
    this.shuffleDataRemote = Cc["@songbirdnest.com/Songbird/DataRemote;1"]
                       .createInstance(Ci.sbIDataRemote);
    this.shuffleDataRemote.init("playlist.shuffle");
    this.shuffleDataRemote.bindObserver(shuffleObserver, true);
  
    // set category shuffle menu on startup according to normal shuffle state
    // and previously set values
    var shuffleState = this.shuffleDataRemote.intValue;
    if (shuffleState == 0) {
      this.restoreCategoryShuffle(onPlayerSwitch);
    } else {
      this.turnCategoryShuffleOff();
    }

    // hook up "play random" button
    var randomPlayCommand =
      document.getElementById("categoryshuffle-play-command");
    randomPlayCommand.addEventListener("command", function() {
      self.mgr.playSequence();
    }, false);
  },

  onUnLoad: function() {
    this.shuffleDataRemote.unbind();
  },

  // turn off category shuffle
  turnCategoryShuffleOff : function() {
    this.randomPlayMenuitem.hidden = this.randomPlaySeparator.hidden = true;
    this.offMenuitem.setAttribute("checked", "true");
    var index = this.categories.indexOf(this.mgr.category);
    if (index != -1) {
      this.menuitems[index].setAttribute("checked", "false");
    }
  },

  // check to see if there is 'memory' of a category shuffle state and restore
  // it. otherwise leave category shuffle off. Request a new sequence unless
  // we are switching back and forth between main player and mini player 
  restoreCategoryShuffle : function(onPlayerSwitch) {
    var category = this.mgr.category;
    var index = this.categories.indexOf(category);
    if (index != -1) {
      this.menuitems[index].setAttribute("checked", "true");
      this.offMenuitem.setAttribute("checked", "false");
      this.randomPlayMenuitem.hidden = this.randomPlaySeparator.hidden = false;
      var label = this.menuitems[index].getAttribute("label")
                  .substring(this.byLabel.length + 1);
      this.randomPlayMenuitem.label =
        this._strings.getString("playLabel") + " " + label;
      if (!onPlayerSwitch) {
        this.mgr.generateSequence();
      }
    } else {
      this.turnCategoryShuffleOff();
    }
  },
}

window.addEventListener('load', function(e) {
    CategoryShuffle.Controller.onLoad(e); }, false);
window.addEventListener('unload',function(e) {
    CategoryShuffle.Controller.onUnLoad(e); }, false);
