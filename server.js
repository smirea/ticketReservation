
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

/** set-up the server **/
var app = connect.createServer(
  connect.static(__dirname)
).listen(PORT);

var io = require('socket.io').listen(app);

io.sockets.on('connection', function (socket) {
  console.info('[SOCKET] Connected:' + socket.id);
  setupSocket(socket);
  var stateObject = getStateObject();
  delete stateObject.codes;
  socket.emit('loadState', stateObject);
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
  var content = JSON.stringify(getStateObject(), undefined, 2);
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
      socket.broadcast.emit('reserve', seats);
    } else if (!error) {
      error = 'Something went wrong, seats not reserved!';
    }

    callback(null, error);
  })
  .on('setType', function _onSetType (row, column, type, errorCallback) {
    var oldType = layout.getType(row, column);
    var ok = true;
    if (type === layout.TYPES.LOCKED && oldType === layout.TYPES.RESERVED) {
      ok = false;
    }
    if (ok && layout.setType(row, column, type)) {
      socket.broadcast.emit('setType', row, column, type);
    } else {
      var actualType = layout.getType(row, column);
      if (typeof errorCallback === 'function') {
        errorCallback(actualType);
      }
      socket.emit('setType', row, column, actualType);
    }
  })
  .on('echo', function _onEcho (data) {
    socket.emit('echo', 'ECHO: ' + data);
  })
  .on('disconnect', function _onDisconnect (data) {
    console.info('[SOCKET] Disconnected:' + socket.id);
  });
}