/*
	Tobii4Csession.js: JavaScript/JQuery library handling the Tobii fixation data via a WebSocket connection
	Copyright: Technische Universiteit Eindhoven - Human Technology Interaction group
	Date: October 2014-February 2018
	Author: Martin C. Boschman
	Prerequisites:
	- Tobii4C eye tracker hardware connected to the local machine via USB3 or USB2
	- the eyetracker is calibrated
	- The home made FixDataServer is installed and is running.
	- The JQuery library js file is loaded before this js 
	- Only FireFox or Chrome (FireFox is better) browsers are supported. FireFox only if the bottom task bar is closed.
*/

// Global variables
var ws;
var host = "127.0.0.1";
var port = 8080;
var gazeClickTimeCriterion = 1000;
var gazeableMargin = 50;
var showDisks = false;
var numberOfFixations = 0; // global variable containing the current number of fixations
var browserViewportVerticalOffset = window.outerHeight - window.innerHeight; // Only for Chrome and Firefox (only if bottom task bar is closed).
var gazeState = [];
var fmode = "disable fixations";
var bmode = "disable blinks";
var epmode = "disable eyepos"; // enable eyepos 90 : return eye positions once every 90 samples (1sec)
var gmode = "disable gaze"; //return

// Function definitions not requiring the DOM to be loaded
//

function formatInt2(ival) {
  //create a 2 digit integer string
  return ("00" + ival).slice(-2);
}

function formatInt3(ival) {
  //create a 3 digit integer string
  return ("000" + ival).slice(-3);
}

function timeString(time) {
  //create a hh:mm:ss.mmm time string from the timestamp.
  t = parseInt(time) / 1000;
  uren = parseInt(t / 3600);
  minuten = parseInt((t - 3600 * uren) / 60);
  seconden = parseInt(t - 3600 * uren - 60 * minuten);
  milliseconden = t - uren * 3600000 - minuten * 60000 - seconden * 1000;
  return (
    formatInt2(uren) +
    ":" +
    formatInt2(minuten) +
    ":" +
    formatInt2(seconden) +
    "." +
    formatInt3(milliseconden)
  );
}

// calculate a json screen position object from raw eye data
function fixPosition(rawx, rawy) {
  var jsonpos = { top: 0, left: 0 };
  jsonpos.left = rawx - screenX;
  jsonpos.top = rawy - screenY - browserViewportVerticalOffset;
  return jsonpos;
}

// create json object for eye positions
function eyePosition(lepx, lepy, lepz, repx, repy, repz) {
  var jsonepos = { lx: 0, ly: 0, lz: 0, rx: 0, ry: 0, rz: 0 };
  jsonepos.lx = lepx;
  jsonepos.ly = lepy;
  jsonepos.lz = lepz;
  jsonepos.rx = repx;
  jsonepos.ry = repy;
  jsonepos.rz = repz;
  return jsonepos;
}

// prevent our red and blue disks falling off the window
function borderCorrection(jsonpos) {
  var correctedJsonpos = { top: jsonpos.top - 6, left: jsonpos.left - 6 };
  if (correctedJsonpos.left < 0) correctedJsonpos.left = 0;
  if (correctedJsonpos.top < 0) correctedJsonpos.top = 0;
  return correctedJsonpos;
}

// connect to our websocket server. Some magic is needed to deal with browser issues.
function connectSocketServer(ip, port) {
  var support =
    "MozWebSocket" in window
      ? "MozWebSocket"
      : "WebSocket" in window
      ? "WebSocket"
      : null;

  if (support == null) {
    alert("Your browser does not support WebSockets!");
    return null;
  }
  // create a new websocket and connect
  var ws = new WebSocket("ws://" + ip + ":" + port);

  return ws;
}

// send request to FixDataServer for slow or sensitive fixations
function Request(ws, mode) {
  ws.send(mode);
}

// disconnect the websocket
function disconnectWebSocket() {
  // if the websocket is present, close it
  if (ws) {
    ws.close();
  }
}

// for future use...
window.onload = function () {};

// disconnect the socket if the window closes
window.onclose = function () {
  disconnectWebSocket();
};

// create the red disk if it is not already there and place it on the initial position of this fixation
function setRunningDisk(jsonpos) {
  var cjsonpos = borderCorrection(jsonpos);
  if (!$("#disk").length) {
    var appendText = '<svg id="disk" class="fdisk" width="13" height="13">';
    appendText +=
      '<circle cx="5" cy="5" r="5" stroke="black" stroke-width="1" fill="red" /></svg>';
    $("body").append(appendText);
  }
  $("#disk").css({
    position: "absolute",
    top: cjsonpos.top,
    left: cjsonpos.left,
  });
}

// create a new blue disk and place it at the average fixation position
function setNewDisk(jsonpos) {
  var cjsonpos = borderCorrection(jsonpos);
  var appendText =
    '<svg id="disk' +
    numberOfFixations +
    '" class="fdisk"  width="13" height="13">';
  appendText +=
    '<circle cx="5" cy="5" r="5" stroke="black" stroke-width="1" fill="blue" /></svg>';
  $("body").append(appendText);
  $("#disk" + numberOfFixations).css({
    position: "absolute",
    top: cjsonpos.top,
    left: cjsonpos.left,
  });
  numberOfFixations++;
}

function handleMessage(evt) {
  // to be called by the ws.onmessage handler
  //alert(evt.data);
  var messin = $.parseJSON(evt.data); //here the raw eye data are coming in!!
  switch (messin.type) {
    case "sf": //starting new fixation
      if (showDisks) {
        setRunningDisk(fixPosition(messin.x, messin.y));
      }
      gazeEvents(messin.t, messin.x, messin.y);
      //alert(messin.type + " " + messin.t);
      break;
    case "fd": //completing fixation
      var pos = fixPosition(messin.x, messin.y);
      fireFixationEvent(timeString(messin.t), pos, messin.d);
      if (showDisks) {
        setNewDisk(pos);
      }
      gazeEvents(messin.t, messin.x, messin.y);
      //alert(messin.type + " " + messin.t);
      break;
    case "gd": //raw gaze data
      gazeEvents(messin.t, messin.x, messin.y);
      if (showDisks) {
        setRunningDisk(fixPosition(messin.x, messin.y));
      }
      break;
    case "ep":
      var eyepos = eyePosition(
        messin.lx,
        messin.ly,
        messin.lz,
        messin.rx,
        messin.ry,
        messin.rz
      );
      firePositionEvent(timeString(messin.t), eyepos);
      break;
    case "bl":
      fireBlinkEvent(timeString(messin.t), messin.d);
      break;
    case "ms":
      alert(
        "If you are ready, please press space to close this dialog, and space AGAIN to start the video."
      );
      break;
    default:
  }
}

function gazeIsIn(id, gazePosition, margin) {
  //alert("gazeIsIn " + id + gazePosition.left.toString() + " " + gazePosition.top.toString() + "outerwidth:" + $("#" + id).outerWidth());
  var r = gazePosition.left > $("#" + id).offset().left - margin;
  r &=
    gazePosition.left <
    $("#" + id).offset().left + $("#" + id).outerWidth() + margin;
  r &= gazePosition.top > $("#" + id).offset().top - margin;
  r &=
    gazePosition.top <
    $("#" + id).offset().top + $("#" + id).outerHeight() + margin;
  return r;
}

//******************** implementation of events **************
function gazeEvents(t, x, y) {
  var gazePosition = fixPosition(x, y);

  for (i = 0; i < gazeState.length; i++) {
    var margin = gazeState[i].margin;
    var id = gazeState[i].id;
    if (!gazeState[i].entered && gazeIsIn(id, gazePosition, margin)) {
      gazeState[i].entered = true;
      //gazeState[i].enterTime = (new Date).getTime(); //epoch in ms
      gazeState[i].enterTime = t;
      gazeState[i].time = t;
      fireGazeEvent(gazeState[i], "GazeEnter");
    } else if (
      gazeState[i].entered &&
      gazeIsIn(id, gazePosition, margin) &&
      gazeState[i].clickable
    ) {
      gazeState[i].time = t;
      if (
        gazeState[i].time - gazeState[i].enterTime >
        gazeState[i].timeCriterion
      ) {
        fireGazeEvent(gazeState[i], "GazeClick");
        gazeState[i].clickable = false;
      }
    } else if (gazeState[i].entered && !gazeIsIn(id, gazePosition, margin)) {
      gazeState[i].time = t;
      gazeState[i].entered = false;
      gazeState[i].clickable = true;
      fireGazeEvent(gazeState[i], "GazeLeave");
    }
  }
}

function fireGazeEvent(gState, eventType) {
  $("#" + gState.id).trigger({
    type: eventType,
    time: timeString(gState.time),
  });
}

function fireFixationEvent(time, position, duration) {
  $("body").trigger({
    type: "Fixation",
    time: time,
    position: position,
    duration: duration,
  });
}

function firePositionEvent(time, eyeposition) {
  $("body").trigger({
    type: "EyePosition",
    time: time,
    lx: eyeposition.lx,
    ly: eyeposition.ly,
    lz: eyeposition.lz,
    rx: eyeposition.rx,
    ry: eyeposition.ry,
    rz: eyeposition.rz,
  });
}

function fireBlinkEvent(time, duration) {
  $("body").trigger({
    type: "Blink",
    time: time,
    duration: duration,
  });
}

//wait until the DOM is loaded and initialize the gazeState for all objects belonging to class Gazable.
$(document).ready(function () {
  $(".Gazeable").each(function () {
    //initialize the gazeState of all Gazeable elements
    gazeState.push({
      id: this.id,
      entered: false,
      enterTime: 0,
      time: 0,
      timeCriterion: gazeClickTimeCriterion,
      margin: gazeableMargin,
      clickable: true,
    });
  });
  // create a socket instance
  // just pick a host and a port. They should be equal to the port that is set in FixDataServer
  ws = connectSocketServer(host, port);

  // when data is coming from the server, this method is called
  ws.onmessage = function (evt) {
    handleMessage(evt);
  };

  // when the connection is established, we need to wait for a second
  ws.onopen = function () {
    setTimeout(Request(ws, gmode), 1000);
    setTimeout(Request(ws, fmode), 1000);
    setTimeout(Request(ws, bmode), 1000);
    setTimeout(Request(ws, epmode), 1000);
  };
});
