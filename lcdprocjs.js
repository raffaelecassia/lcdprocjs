"use strict";
var Socket = require("net").Socket;
var events = require("events");
var util = require("util");
var _ = require("lodash");

var debug = false; // pfft log...

//##############################################################################
//##############################################################################

/**
 * LCDproc Client object.
 *
 * Default config:
 * ```
 * {
 *   host: "localhost",
 *   port: 13666,
 *   name: "lcdprocjs"
 * }
 * ```
 * @param {Object} config client configuration
 * @event ready  signal a ready client
 */
function Client(config) {
  this.config = {
    host: "localhost",
    port: 13666,
    name: "lcdprocjs"
  };
  _.assign(this.config, config);
  this.lcdprocConfig = {
    version: 0,
    protocol: 0,
    size: {
      width: 0,
      height: 0
    },
    cellsize: {
      width: 0,
      height: 0
    }
  };
  this.screens = {};
  this.screenCnt = 0;
  this.socket = new Socket();
  events.EventEmitter.call(this);
}
util.inherits(Client, events.EventEmitter);
module.exports.Client = Client;

/**
 * Connect, handshaking, messages processing
 * @fires ready  client ready
 * @fires shown  Screen shown by server
 * @fires hidden Screen hidden by server
 */
Client.prototype.connect = function() {
  var self = this;
  // Socket listeners
  this.socket.on("connect", function() {
    self._write("hello");
  });
  this.socket.on("data", function(buf) {
    var data = buf.toString().trim();
    // On CONNECT only
    if(data.indexOf("connect") == 0) {
      var params = data.split(" ");
      params.forEach(function(value, i) {
        switch(value) {
          case "LCDproc": self.lcdprocConfig.version = params[i+1]; break;
          case "protocol": self.lcdprocConfig.protocol = params[i+1]; break;
          case "wid": self.lcdprocConfig.size.width = +params[i+1]; break;
          case "hgt": self.lcdprocConfig.size.height = +params[i+1]; break;
          case "cellwid": self.lcdprocConfig.cellsize.width = +params[i+1]; break;
          case "cellhgt": self.lcdprocConfig.cellsize.height = +params[i+1]; break;
        }
      });
      self._write("client_set", "-name", quoteString(self.config.name));
      self.emit("ready");
    } else {
      // All other messages
      // (data can be a string with multiple message from LCDproc)
      data.split("\n").forEach(function(msg) {
        if(msg == "success") return;
        // debug
        log("RECV", msg);
        var m = msg.substring(0, 6);
        if(m == "listen") {
          // screen visible
          if(!_.isUndefined(self.screens[msg.substring(7)])) {
            self.screens[msg.substring(7)].emit("shown");
          }
        } else if(m == "ignore") {
          // screen hidden
          if(!_.isUndefined(self.screens[msg.substring(7)])) {
            self.screens[msg.substring(7)].emit("hidden");
          }
        }
      });
    }
  });
  this.socket.on("error", function(error) {
    log("ERROR", error);
    self.socket.destroy();
  });
  // this.socket.on("end", function() {
  //   log("END");
  // });
  // this.socket.on("close", function(had_error) {
  //   log("CLOSE", had_error);
  // });

  // Socket connect
  this.socket.setEncoding("utf8");
  this.socket.connect(this.config.port, this.config.host);
}

/**
 * Disconnect
 */
Client.prototype.close = function() {
  this.socket.end();
}

/**
 * A factory method which adds a Screen to this Client.
 *
 * See [LCDproc Developer's Guide](http://lcdproc.sourceforge.net/docs/lcdproc-0-5-7-dev.html#language-screens)
 *
 * @param  {Object} config screen configuration
 * @return {Screen}
 */
Client.prototype.addScreen = function(config) {
  var id = this._newScreenId();
  this.screens[id] = new Screen(this, id, config);
  return this.screens[id];
}

/*
 * [Private method]
 * Write arguments to socket (arg can be an array or a string).
 */
Client.prototype._write = function() {
  var out = [];
  for (var i = 0; i < arguments.length; i++) {
    if(_.isArray(arguments[i])) {
      out = out.concat(arguments[i]);
    } else {
      out.push(arguments[i]);
    }
  }
  var o = out.join(" ");
  log("SEND", o);
  this.socket.write(o + "\n");
}

/*
 * [Private method]
 * Delete a screen from the internal map
 */
Client.prototype._unrefScreen = function(id) {
  delete this.screens[id];
}

/*
 * [Private method]
 * Return an id for a new screen
 */
Client.prototype._newScreenId = function() {
  return this.config.name + "_s" + this.screenCnt++;
}

//##############################################################################

/**
 * A Screen.
 *
 * Example config:
 * ```
 * {
 *   priority: "info", // hidden|background|info|foreground|alert|input|$int
 *   heartbeat: "open", // { on | off | open }
 *   backlight: "open", // { on | off | toggle | open | blink | flash }
 *   [...]
 * }
 * ```
 *
 * @param {Client} client Client instance
 * @param {Screen} screenId id
 * @param {Object} config initial configuration
 * @event
 */
function Screen(client, screenId, config) {
  this.client = client;
  this.screenId = screenId;
  this.config = {};
  this.widgets = {};
  this.widgetCnt = 0;
  this.client._write("screen_add", this.screenId);
  this.setConfig(config);
  events.EventEmitter.call(this);
}
util.inherits(Screen, events.EventEmitter);

/**
 * Set a new config for the screen
 * @param {Object} config new configuration (adds or overwrite)
 */
Screen.prototype.setConfig = function(config) {
  if(_.isEmpty(config)) return;
  _.assign(this.config, config);
  this.client._write("screen_set", this.screenId, flattenObj(config));
}

/**
 * Delete this Screen
 */
Screen.prototype.delete = function() {
  this.client._write("screen_del", this.screenId);
  this.client._unrefScreen(this.screenId);
}


/**
 * Adds a generic Widget to this screen.
 *
 * @param  {String} type widget type
 * @return {Widget}
 */
Screen.prototype.addWidget = function(type) {
  var id = this._newWidgetId();
  this.widgets[id] = new Widget(this, id, type);
  return this.widgets[id];
}


/**
 * Adds a TitleWidget
 * @return {TitleWidget}
 */
Screen.prototype.addTitle = function() {
  var id = this.screenId + "_wTITLE";
  if(_.isUndefined(this.widgets[id])) {
    this.widgets[id] = new TitleWidget(this, id);
    return this.widgets[id];
  }
  return this.widgets[id];
}
/**
 * Adds a StringWidget
 * @return {StringWidget}
 */
Screen.prototype.addString = function() {
  var id = this._newWidgetId();
  this.widgets[id] = new StringWidget(this, id);
  return this.widgets[id];
}
/**
 * Adds a HorizontalBarWidget
 * @return {HorizontalBarWidget}
 */
Screen.prototype.addHorizontalBar = function() {
  var id = this._newWidgetId();
  this.widgets[id] = new HorizontalBarWidget(this, id);
  return this.widgets[id];
}
/**
 * Adds a VerticalBarWidget
 * @return {VerticalBarWidget}
 */
Screen.prototype.addVerticalBar = function() {
  var id = this._newWidgetId();
  this.widgets[id] = new VerticalBarWidget(this, id);
  return this.widgets[id];
}
/**
 * Adds a BigNumberWidget
 * @return {BigNumberWidget}
 */
Screen.prototype.addBigNumber = function() {
  var id = this._newWidgetId();
  this.widgets[id] = new BigNumberWidget(this, id);
  return this.widgets[id];
}


/*
 * [Private method]
 * Returns an id for a new widget
 */
Screen.prototype._newWidgetId = function() {
  return this.screenId + "_w" + this.widgetCnt++;
}

/*
 * [Private method]
 * Delete a widget from the internal map
 */
Screen.prototype._unrefWidget = function(id) {
  delete this.widgets[id];
}

//##############################################################################

/**
 * A generic Widget
 * @param {Screen} screen Screen instance
 * @param {string} widgetId id
 * @param {string} widgetType widget type
 */
function Widget(screen, widgetId, widgetType) {
  this.screen = screen;
  this.widgetId = widgetId;
  this.widgetType = widgetType;
  this.screen.client._write("widget_add", this.screen.screenId, widgetId, widgetType);
}

/**
 * Set widget params
 */
Widget.prototype.setParams = function() {
  this.params = Array.apply(null, arguments);
  this.screen.client._write("widget_set", this.screen.screenId, this.widgetId, this.params);
}

/**
 * Delete this widget from screen
 */
Widget.prototype.delete = function() {
  this.screen.client._write("widget_del", this.screen.screenId, this.widgetId);
  this.screen._unrefWidget(this.widgetId);
}

//##############################################################################

/*
 * Specialized Widgets
 */

/**
 * Title widget
 */
function TitleWidget(screen, widgetId) {
 Widget.call(this, screen, widgetId, "title");
}
util.inherits(TitleWidget, Widget);
/**
 * Set title text
 * @param  {String} text text
 */
TitleWidget.prototype.setTitle = function(text) {
 this.setParams(quoteString(text));
}

/**
 * String widget
 */
function StringWidget(screen, widgetId) {
  Widget.call(this, screen, widgetId, "string");
}
util.inherits(StringWidget, Widget);
/**
 * Set widget position and text
 * @param  {Integer} x    x position
 * @param  {Integer} y    y position
 * @param  {String} text  text
 */
StringWidget.prototype.set = function(x, y, text) {
  this.setParams(x, y, quoteString(text));
}
/**
 * Set widget position
 * @param  {Integer} x    x position
 * @param  {Integer} y    y position
 */
StringWidget.prototype.setPos = function(x, y) {
  if(_.isUndefined(this.params)) {
    this.setParams(x, y, 0);
  } else {
    this.setParams(x, y, this.params[2]);
  }
}
/**
 * Set widget text
 * @param  {String} text  text
 */
StringWidget.prototype.setText = function(text) {
  if(_.isUndefined(this.params)) {
    this.set(1, 1, text); // fallback
  } else {
    this.set(this.params[0], this.params[1], text);
  }
}

/**
 * Horizontal bar widget
 */
function HorizontalBarWidget(screen, widgetId) {
  Widget.call(this, screen, widgetId, "hbar");
}
util.inherits(HorizontalBarWidget, Widget);
/**
 * Set widget position and value
 * @param  {Integer} x         x position
 * @param  {Integer} y         y position
 * @param  {Float}   percent   number between 0 and 1
 */
HorizontalBarWidget.prototype.set = function(x, y, percent) {
  this.setParams(x, y,
    Math.round((this.screen.client.lcdprocConfig.size.width - x + 1) *
    this.screen.client.lcdprocConfig.cellsize.width * percent));
}
/**
 * Set widget position
 * @param  {Integer} x    x position
 * @param  {Integer} y    y position
 */
HorizontalBarWidget.prototype.setPos = StringWidget.prototype.setPos;
/**
 * Set widget value
 * @param  {Float}   percent   number between 0 and 1
 */
HorizontalBarWidget.prototype.setValue = function(percent) {
  if(_.isUndefined(this.params)) {
    this.set(1, 1, percent); // fallback
  } else {
    this.set(this.params[0], this.params[1], percent);
  }
}

/**
 * Vertical bar widget
 */
function VerticalBarWidget(screen, widgetId) {
  Widget.call(this, screen, widgetId, "vbar");
}
util.inherits(VerticalBarWidget, Widget);
/**
 * Set widget position and value
 * @param  {Integer} x         x position
 * @param  {Integer} y         y position
 * @param  {Float}   percent   number between 0 and 1
 */
VerticalBarWidget.prototype.set = function(x, y, percent) {
  this.setParams(x, y,
    Math.round(y * this.screen.client.lcdprocConfig.cellsize.height * percent));
}
/**
 * Set widget position
 * @param  {Integer} x    x position
 * @param  {Integer} y    y position
 */
VerticalBarWidget.prototype.setPos = StringWidget.prototype.setPos;
/**
 * Set widget value
 * @param  {Float}   percent   number between 0 and 1
 */
VerticalBarWidget.prototype.setValue = HorizontalBarWidget.prototype.setValue;

/**
 * BigNumber widget
 */
function BigNumberWidget(screen, widgetId) {
  Widget.call(this, screen, widgetId, "num");
}
util.inherits(BigNumberWidget, Widget);
/**
 * Set position and value
 * @param  {Integer} x      x position
 * @param  {Integer} number number between 1 an 10 (the special number 10 is a colon)
 */
BigNumberWidget.prototype.set = function(x, number) {
  this.setParams(x, number);
}

//##############################################################################
//##############################################################################

function quoteString(str) {
  return "{" + str + "}";
}

function flattenObj(obj, donotdashkeys) {
  var out = [];
  _.forOwn(obj, function(value, key) {
    out.push((donotdashkeys?"":"-") + key);
    out.push(value);
  });
  return out;
}

function log() {
  if(debug) console.log.apply(null, arguments);
}
