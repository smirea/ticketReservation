
// custom files
var config = require('./js/config.js').config;
var Class = require('./js/Class.js').Class;
var Layout = require('./js/Layout.js').Layout;

// standard libraries
var connect = require('connect');
var fs = require('fs');

var PORT = config.server.port;
var backupDir = config.server.backupDir;
var lastStatePath = backupDir + '-last-state.json';
var saveInterval = config.server.saveInterval;
var backupInterval = config.server.backupInterval;

var reservations = [];

// the server's session
var session = Math.floor(Math.random() * 100000000);

/** set-up the server **/
var app = connect.createServer(
  connect.static(__dirname)
).listen(PORT);

var io = require('socket.io').listen(app);

io.sockets.on('connection', function (socket) {
  console.info('[SOCKET] Checking session:' + socket.id);
  // if the client's session is different from the server's session
  // the client will be forced to refresh
  socket.emit('checkSession', session, function (ok) {
    if (!ok) {
      console.info('[SOCKET] Forced refresh:' + socket.id);
      return;
    }
    console.info('[SOCKET] Connected:' + socket.id);
    setupSocket(socket);
    var stateObject = getStateObject();
    delete stateObject.codes;
    delete stateObject.reservations;
    stateObject.reservations = [];
    for (var i=0; i<reservations.length; ++i) {
      var newReservation = cloneObject(reservations[i]);
      newReservation.seats = Object.keys(newReservation.codes);
      delete newReservation.codes;
      stateObject.reservations[i] = newReservation;
    }
    socket.emit('loadState', stateObject);
  });
});

console.info('Listening on port: `' + PORT + '`');
/** end server set-up **/

// config app logic
var layout = new Layout(config.layout);

// restore state if backup file exists
if (fs.existsSync(lastStatePath)) {
  try {
    var state = fs.readFileSync(lastStatePath);
    var stateObject = JSON.parse(state.toString());
    for (var row in stateObject.map) {
      for (var column in stateObject.map[row]) {
        if (stateObject.map[row][column] === layout.TYPES.LOCKED) {
          stateObject.map[row][column] = layout.TYPES.EMPTY;
        }
      }
    }
    reservations = stateObject.reservations;
    layout.loadState(stateObject);
    console.info('[INFO] Successfully loaded old state');
  } catch (exception) {
    console.warn(exception);
    throw '[FAIL] Unable to read last backup file: `'+lastStatePath+'`';
  }
} else {
  console.info('[INFO] No backup file found!');
}

var saveTimeout = setTimeout(function _saveTimeout () {
  saveStatus();
  setTimeout(_saveTimeout, saveInterval);
}, saveInterval);

/** Functions **/

var lastSave = new Date();
var saveErrors = [];
function saveStatus () {
  var now = new Date();
  if (lastSave.getTime() + backupInterval < now.getTime()) {
    lastSave = now;
  }
  var stateObject = getStateObject();
  // remove all temporary locks
  delete stateObject.locks;
  var content = JSON.stringify(stateObject, undefined, 2);
  var dynamicPath = backupFilePath(lastSave);
  fs.writeFile(lastStatePath, content, function _saveComplete (err) {
    if (err) {
      console.warn(err);
    }
  });
  fs.writeFile(dynamicPath, content, function _saveComplete (err) {
    if (err) {
      console.warn(err);
    }
  });
}
function backupFilePath (date) {
  var leadingZero = function (str) { return ('0' + str).slice(-2); }
  return backupDir + 'map_' + date.getFullYear() + '.' +
          leadingZero(date.getMonth()) + '.' + leadingZero(date.getDate()) +'_'+
          leadingZero(date.getHours()) + 'h' + '.json';
}

function getStateObject () {
  return {
    reservations: reservations,
    locks: layout.locks,
    options: layout.options,
    TYPES: layout.TYPES,
    map: layout.getComponents().map,
    codes: layout.getComponents().codes
  };
}

function setupSocket (socket) {
  socket.on('reserve', function _onReserve (name, email, seats, callback) {
    var error = null;
    var splitSeats = [];
    for (var i=0; i<seats.length; ++i) {
      splitSeats[i] = seats[i].split('-');
      if (splitSeats[i].length === 2) {
        var oldType = layout.getType.apply(layout, splitSeats[i]);
        if (oldType === layout.TYPES.EMPTY || oldType === layout.TYPES.LOCKED) {
          // everything OK!
        } else {
          error = 'Seat number `' + seats[i] + '` is not available';
          break;
        }
      } else {
        error = 'Invalid seat: `' + seats[i] + '`';
        break;
      }
    }

    if (splitSeats.length === seats.length) {
      var codes = {};
      for (var i=0; i<seats.length; ++i) {
        layout.reserve.apply(layout, splitSeats[i]);
        codes[seats[i]] = layout.getCode.apply(layout, splitSeats[i]);
      }
      var reservationObject = {
        number: reservations.length+1,
        name: name,
        email: email,
        codes: codes    // maps: seat_name -> seat_code
      };
      reservations.push(reservationObject);
      callback(reservationObject);
      var publicReservationObject = cloneObject(reservationObject);
      delete publicReservationObject.codes;
      publicReservationObject.seats = seats;
      socket.broadcast.emit('reservation', publicReservationObject);
    } else if (!error) {
      error = 'Something went wrong, seats not reserved!';
    }

    callback(null, error);
  })
  .on('lock', function _onLock (row, column, errorCallback) {
    if (layout.lock(row, column, socket.id)) {
      socket.broadcast.emit('lock', row, column, socket.id);
    } else {
      var oldType = layout.getType(row, column);
      errorCallback('Could not lock seat `' + layout.makeID(row, column) +
                      '` as it is `' + oldType + '`',
                    oldType
      );
    }
  })
  .on('unlock', function _onUnlock (row, column, errorCallback) {
    if (layout.unlock(row, column)) {
      socket.broadcast.emit('unlock', row, column);
    } else {
      var oldType = layout.getType(row, column);
      errorCallback('Could not unlock seat `' + layout.makeID(row, column) +
                      '` as it is `' + oldType + '`',
                    oldType
      );
    }
  })
  .on('echo', function _onEcho (data) {
    socket.emit('echo', 'ECHO: ' + data);
  })
  .on('disconnect', function _onDisconnect (data) {
    for (var seatID in layout.locks) {
      if (layout.locks[seatID] === socket.id) {
        var arr = seatID.split('-');
        layout.unlock(arr[0], arr[1]);
        socket.broadcast.emit('unlock', arr[0], arr[1]);
      }
    }
    console.info('[SOCKET] Disconnected:' + socket.id);
  });
}

/**
 * Clones an Array or an Object literal
 */
function cloneObject (object) {
  var newObject = null;
  if (typeof object === 'object') {
    if (object.constructor === Object) {
      newObject = {};
      for (var key in object) {
        newObject[key] = object[key];
      }
    } else if (object.constructor === Array) {
      newObject = [];
      for (var i=0; i<object.length; ++i) {
        newObject[i] = object[i];
      }
    }
  }
  return newObject || object;
}