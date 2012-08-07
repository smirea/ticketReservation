
var socket = io.connect(config.client.serverAddress ||
                        window.location.protocol +'//'+ window.location.hostname
);
var layout;
var typeList;
var menu;
var $layoutWrapper;
var reservations = [];

var session = null;

if (typeof String.prototype.trim !== 'function') {
  String.prototype.trim = function _trim () {
    return this.replace(/^\s\s*/, '').replace(/\s\s*$/, '');
  }
}

$.fn.disableSelection = function () {
  return this.each(function () {
    $(this)
      .attr('unselectable', 'on')
      .css({
        '-moz-user-select': 'none',
        '-webkit-user-select': 'none',
        'user-select': 'none',
        '-ms-user-select': 'none'
      })
      .each(function () {
        this.onselectstart = function() { return false; };
      });
  });
};

$.fn.collapsible = function (_options) {
  var options = $.extend({
    // if set to a selector and if any children mathching the selector are
    //  found than they will be used as the toggleable container
    target: null,
    // the slideToggle speed
    speed: 400
  }, _options);
  return this.each(function () {
    var button = $(document.createElement('a'));
    var parent = $(this);
    var target = options.target ? $(this).find(options.target) : null;
    var targetHeight = null;

    if (!target || !target.length) {
      $(this).wrap('<div />');
      parent = $(this).parent();
      target = $(this);
    }

    if (parent.css('position') == 'static') {
      parent.css('position', 'relative');
    }

    button
      .data('parent', parent)
      .data('target', target)
      .attr({
        href: 'javascript:void(0)',
        'class': 'collapsible-button'
      })
      .html(target.is(':visible') ? '-' : '+')
      .on('click', function _toggle (event) {
        event.preventDefault();
        if (target.is(':visible')){
          button.html('+');
          target.stop().slideUp(options.speed);
        } else {
          button.html('-');
          target.stop().slideDown(options.speed, function _restoreHeight () {
            target.css('height', targetHeight);
          });
        }
      });

    target.addClass('collapsible-target');

    parent
      .addClass('collapsible-parent')
      .append(button);
    targetHeight = target.css('height');
  });
}

var classes = {
  selected: 'selected'
};

// init socket
setupSocket();

// window ready
$(function _initializeLayout () {
  layout = new LayoutView({
    showLabels: true,
    spaces: ['E-F', 'M-N'],
    map: config.map,
    socket: socket
  });
  typeList = Object.keys(layout.TYPES);
  typeList.unshift(0);

  $layoutWrapper = $('#layout');
  $layoutWrapper.html(layout.toElement());
  addEvents(layout);

  setupMenu();
  menu.reserve.name.val('Tester');
  menu.reserve.email.val('theTest@testy.de');
});

function setupMenu () {
  menu = {
    main: jqElement('div'),
    status: jqElement('ul'),
    reserve: {
      main: jqElement('div'),
      name: jqElement('input'),
      email: jqElement('input'),
      submit: jqElement('input')
    }
  };

  menu.status.attr({
    id: 'status',
    'class': 'section'
  });

  menu.reserve.name.attr({
    type: 'text',
    placeholder: 'name ...'
  });

  menu.reserve.email.attr({
    type: 'text',
    placeholder: 'email ...'
  });

  menu.reserve.submit.attr({
    type: 'button',
    value: 'Reserve'
  });

  menu.reserve.main.attr({
    id: 'reserve',
    'class': 'section'
  }).append(
    menu.reserve.name,
    menu.reserve.email,
    menu.reserve.submit
  );

  menu.reserve.submit
    .on('click.reserve', function _reserve () {
      var name = menu.reserve.name.val().trim();
      var email = menu.reserve.email.val().trim();
      var emailRegExp = /^[a-zA-Z0-9\-_.]+@[a-zA-Z0-9\-_]+\.[a-z]{2,3}$/;

      if (Object.keys(layout.locks).length === 0) {
        statusUpdate('No seats selected!', null, 'error');
      } else if (!name || name.length < 4) {
        menu.reserve.name.focus();
        statusUpdate('Name must have at least 4 characters', null, 'error');
      } else if (!email || !emailRegExp.test(email)) {
        menu.reserve.email.focus();
        statusUpdate('Invalid email', null, 'error');
      } else {
        var seats = Object.keys(layout.locks);
        if (confirm('Reserving the following seats: ' + seats.join(', '))) {
          socket.emit('reserve', name, email, seats, function (result, error) {
            if (error) {
              statusUpdate(error, 'error');
            } else {
              var seats = Object.keys(result.codes);
              var reservationObject = $.extend({}, result);
              delete reservationObject.codes;
              reservationObject.seats = seats;
              registerReservation(reservationObject);
              seats.sort();
              var codes = [];
              for (var i=0; i<seats.length; ++i) {
                codes.push(
                  '<tr>' +
                    '<td><b>'+ seats[i] +':</b></td>'+
                    '<td> ' + result.codes[seats[i]] + '</td>' +
                  '</tr>'
                );
              };
              statusUpdate('Reservation complete! ',
                            '<div><b>number:</b> ' + result.number + '</div>'+
                            '<div><b>name:</b> ' + result.name + '</div>' +
                            '<div><b>email:</b> ' + result.email + '</div>' +
                            '<table>' +
                              '<tr><th colspan="2">Codes:</th></tr>' +
                              codes.join("\n") +
                            '</table>'
              );
            }
          });
        }
      }
    });

  menu.main
    .attr('id', 'menu')
    .insertBefore($layoutWrapper)
    .append(
      menu.status,
      menu.reserve.main
    );
}

function setupSocket () {
  socket.on('loadState', function _onLoadState (state) {
    delete state.map;
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
  })
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

function addEvents (layout) {
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
            '<tr><td><b>Number: </b></td><td>' + reserv.number + '</td></tr>' +
            '<tr><td><b>Name: </b></td><td>' + reserv.name + '</td></tr>' +
            '<tr><td><b>Email: </b></td><td>' + reserv.email + '</td></tr>' +
          '</table>'
        )
    })
    .on('mouseleave.selectReservation', '[reservation-number]', function () {
      highlightSeats();
      $message.hide();
    });

  $seats
    .on('click.lock', function _selectSeat () {
      var id = $(this).attr('id');
      var arr = id.split('-');
      var row = arr[0];
      var column = arr[1];
      switch (layout.getType(row, column)) {
        case layout.TYPES.EMPTY:
          layout.lock(row, column, function _onConflict (error, newType) {
            layout.unlock(row, column);
            statusUpdate( 'Could not lock seat `' + id + '`',
                          'It is `' + layout.getEnumName(newType) + '`.<br />' +
                            error +
                            ' <b>You should refresh the page ...</b>'
            );
          });
          break;
        case layout.TYPES.LOCKED:
          if (layout.locks[id]) {
            layout.unlock(row, column, true);
          } else {
            statusUpdate('The seat `' + id + '` is locked by somebody else');
          }
          break;
        default:
          // Do nothing
      }
      menu.reserve.name.focus();
    });
}

function jqElement (type) {
  return $(document.createElement(type));
}