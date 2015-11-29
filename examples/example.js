"use strict";

var _ = require("lodash");

var Client = require("../lcdprocjs").Client;
var client = new Client({host: "raspberrypi"});

client.on("ready", function() {
  console.log(client.lcdprocConfig);

  //
  // SCREEN 1
  //
  var screen1 = client.addScreen({
    cursor: "under",
    cursor_x: 9,
    cursor_y: 2
  });
  screen1.addTitle().setTitle("A title");
  var s1string = screen1.addString();
  var s1bar1 = screen1.addHorizontalBar();
  var s1bar2 = screen1.addHorizontalBar();
  s1string.set(1, 2, "A string");
  s1bar1.setPos(1, 3);
  s1bar2.setPos(1, 4);
  screen1.on("shown", function() {
    s1bar1.setValue(Math.random());
    s1bar2.setValue(Math.random());
  });

  //
  // SCREEN 2
  //
  var screen2 = client.addScreen({heartbeat: "off"});
  var bars = [];
  for (var i = 0; i < 20; i++) {
    bars[i] = screen2.addVerticalBar();
    bars[i].setPos(i+1, 4);
  }
  screen2.on("shown", function() {
    for (var i = 0; i < bars.length; i++) {
      bars[i].setValue(Math.random());
    }
  });

  //
  // SCREEN 3
  //
  var screen3 = client.addScreen({priority: "alert", backlight: "flash"});
  // screen3.addString().set(5, 2, "_");
  // screen3.addString().set(4, 2, "_");
  screen3.addBigNumber().set(7, 1);
  screen3.addBigNumber().set(10, 5);
  // screen3.addString().set(13, 1, "O")
  screen3.addString().set(13, 1, "%")


  setTimeout(function() {
    screen3.delete();
  }, 3000);

  setTimeout(function() {
    screen2.delete();
    s1bar1.delete();
    s1bar2.delete();
  }, 10000);

  setTimeout(function() {
    client.close();
  }, 15000);

});

client.connect();
