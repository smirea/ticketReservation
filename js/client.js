
var socket;
var layout;
var $layoutWrapper;
var session = null;
var reservations = [];

var getLayout = function _getLayout () {
  return layout || new LayoutView({
    showLabels: true,
    map: config.map,
    socket: socket
  });
}

var onLoadState = function _onLoadState (state) {
  delete state.map;
  layout = getLayout();
  layout.loadState(state);
  $layoutWrapper
    .empty()
    .html(layout.toElement());
  reservations = [];
  for (var i=0; i<state.reservations.length; ++i) {
    registerReservation(state.reservations[i]);
  }
  for (var seatID in state.locks) {
    var arr = seatID.split('-');
    if (layout.getType(arr[0], arr[1]) === layout.TYPES.EMPTY) {
      if (state.locks[seatID] === socket.id) {
        layout.lock(arr[0], arr[1]);
      } else {
        layout.outerLock(arr[0], arr[1], state.locks[seatID]);
      }
    }
  }
  addEvents(layout);
}

// window ready
$(function _initializeLayout () {
  $layoutWrapper = $('#layout');
});

function setupSocket (namespace) {
  socket = io.connect(config.client.serverAddress ||
                      window.location.protocol + '//' +
                      window.location.hostname +
                      (namespace || '')
  );
  socket
    .on('loadState', onLoadState)
    .on('reservation', registerReservation)
    .on('lock', function _onLock (row, column, socketID) {
      layout.outerLock(row, column, socketID);
    })
    .on('unlock', function _onUnlock(row, column) {
      layout.outerUnlock(row, column);
    })
    .on('statusUpdate', function _statusUpdate (title, content, type) {
      statusUpdate(title, content, type);
    })
    .on('checkSession', function _onCheckSession (serverSession, callback) {
      if (session === null) {
        session = serverSession;
        callback(true);
        return;
      } else if (session !== serverSession) {
        callback(false);
        window.location.reload();
        return;
      }
      callback(true);
    })
    .on('connect', function _onConnect () {
      console.info('[SOCKET] Connected');
    })
    .on('disconnect', function _onDisconnect () {
      console.info('[SOCKET] Disconnected');
    });
}

function registerReservation (reservationObject) {
  if (reservations[reservationObject.number]){
    var existing = reservations[reservationObject.number];
    statusUpdate('Invalid reservation number',
                    'A reservation with the number `' + existing.number + '` ' +
                    'already exists for `' + existing.name + '` ' +
                    ' ('+existing.email+') with the following seats: ' +
                    existing.seats.join(','),
                  'error'
    );
  } else if (reservationObject.seats.length === 0) {
    statusUpdate('Empty reservation', null, 'error');
  } else {
    for (var i=0; i<reservationObject.seats.length; ++i) {
      var arr = reservationObject.seats[i].split('-');
      layout.makeEmpty(arr[0], arr[1]);
      layout.reserve(arr[0], arr[1]);
      layout.getCell(arr[0], arr[1])
        .attr('reservation-number', reservationObject.number);
    }
    reservations[reservationObject.number] = reservationObject;
  }
}

function statusUpdate (title, content, type) {
  type = type || 'log';
  var li = jqElement('li');
  menu.status.append(
    li.attr('class', type)
      .append(
        jqElement('div')
          .addClass('title')
          .html(title)
      )
  );
  if (content) {
    li.append(
      jqElement('div')
        .addClass('content')
        .html(content)
    );
    li.collapsible({target:'.content'});
  }
  menu.status[0].scrollTop = menu.status[0].scrollHeight;
}

var highlightSeats = (function () {
  var $oldSelection = $();
  return function _highlight ($seats) {
    $oldSelection.removeClass('highlighted')
    $oldSelection = $();
    if ($seats) {
      $seats.addClass('highlighted');
      $oldSelection = $seats;
    }
  }
})();

function addEvents () {
  var components = layout.getComponents();
  var $seats = layout.toElement().find('.'+layout.classes.seat);
  var $message = jqElement('div');
  $message
    .addClass('reservation-message')
    .hide()
    .appendTo(document.documentElement);
  layout
    .toElement()
    .disableSelection()
    .on('mouseenter.outerLock', '[outer-lock]', function () {
      var outerLock = $(this).attr('outer-lock');
      highlightSeats($seats.filter('[outer-lock="' + outerLock + '"]'));
      $message.show().html('Locked by `' + outerLock + '`');
    })
    .on('mouseleave.outerLock', '[outer-lock]', function () {
      highlightSeats();
      $message.hide();
    })
    .on('mouseenter.selectReservation', '[reservation-number]', function () {
      var number = $(this).attr('reservation-number');
      number = parseInt(number, 10);
      var reserv = reservations[number];
      highlightSeats($seats.filter('[reservation-number="'+number+'"]'));
      $message
        .show()
        .html(
          '<table>' +
            (!reserv.number ? '' :
              '<tr><td><b>Number: </b></td><td>'+ reserv.number +'</td></tr>') +
            (!reserv.name ? '' :
              '<tr><td><b>Name: </b></td><td>' + reserv.name + '</td></tr>') +
            (!reserv.email ? '' :
              '<tr><td><b>Email: </b></td><td>' + reserv.email + '</td></tr>') +
          '</table>'
        )
    })
    .on('mouseleave.selectReservation', '[reservation-number]', function () {
      highlightSeats();
      $message.hide();
    });
}

function jqElement (type) {
  return $(document.createElement(type));
}