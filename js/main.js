
var socket = io.connect(config.client.serverAddress ||
                        window.location.protocol +'//'+ window.location.hostname
);
var layout;
var typeList;
var menu;
var $layoutWrapper;

(function _main ($, undefined) {
  $.fn.disableSelection = function () {
    return this.each(function () {
      $(this)
        .attr('unselectable', 'on')
        .css({
          '-moz-user-select':'none',
          '-webkit-user-select':'none',
          'user-select':'none',
          '-ms-user-select':'none'
        })
        .each(function () {
          this.onselectstart = function() { return false; };
        });
    });
  };

  var classes = {
    selected: 'selected'
  };

  var selection = {};


  // init socket
  setupSocket();

  // window ready
  $(function _initializeLayout () {
    layout = new LayoutView({
      showLabels: true,
      spaces: ['E-F', 'M-N'],
      map: config.map
    });
    typeList = Object.keys(layout.TYPES);
    typeList.unshift(0);

    $layoutWrapper = $('#layout');
    $layoutWrapper.html(layout.toElement());
    addEvents(layout);

    setupMenu();
  });

  function setupMenu () {
    menu = {
      main: jqElement('div'),
      status: jqElement('ul'),
      reserveBtn: jqElement('input')
    };

    menu.status.attr('id', 'status');

    menu.reserveBtn
      .attr({
        id: 'reserve',
        type: 'button',
        value: 'Reserve'
      })
      .on('click.reserve', function _reserve () {
        var seats = Object.keys(selection).map(function _removePrefix (r) {
          return r.slice(layout.options.seatSeparator.length +
                          layout.options.seatPrefix.length);
        });
        if (confirm('Reserving the following seats: '+seats.join(', '))) {
          socket.emit('reserve', seats, function _doneCallback (error) {
            if (error) {
              statusUpdate(error, 'error');
            }
          });
        }
      });

    menu.main
      .attr('id', 'menu')
      .insertBefore($layoutWrapper)
      .append(
        menu.status,
        menu.reserveBtn
      );
  }

  function setupSocket () {
    socket.on('loadState', function _onLoadState (state) {
      layout.loadState(state);
      $layoutWrapper.empty();
      $layoutWrapper.html(layout.toElement());
      addEvents(layout);
    })
    .on('reserve', function _onReserve (seats) {
      if (seats.length === 0) {
        return;
      }
      for (var i=0; i<seats.length; ++i) {
        layout.reserve(seats[i].row, seats[i].column);
        delete selection[layout.makeID(seats[i].row, seats[i].column)];
      }
      if (!!seats[0].code) {
        var codes = seats.map(function _getCodeMessage (seat) {
          return seat.row + '-' + seat.column + ': ' + seat.code;
        });
        statusUpdate('Reservation complete! Codes:<br />'+codes.join('<br />'));
      } else {
        //TODO: who reserved which seats maybe? :)
      }
    })
    .on('setType', function _onSetType (row, column, type) {
      var oldType = layout.getType(row, column);
      /*
      if (oldType !== layout.TYPES.EMPTY) {
        statusUpdate('Seat ' + row + '-' + column + ' changed from ' +
                      typeList[oldType] + ' to ' + typeList[type]);
      }
      */
      layout.setType(row, column, type);
    })
    .on('statusUpdate', function _statusUpdate (content, type) {
      statusUpdate(content, type);
    })
    .on('connect', function _onConnect () {
      console.info('[SOCKET] Connected');
    })
    .on('disconnect', function _onDisconnect () {
      console.info('[SOCKET] Disconnected');
    });
  }

  function statusUpdate (content, type) {
    type = type || 'log';
    menu.status.append(
      jqElement('li')
        .attr('class', type)
        .append(content)
    );
    menu.status[0].scrollTop = menu.status[0].scrollHeight;
  }

  function addEvents (layout) {
    var components = layout.getComponents();
    var $seats = layout.toElement().find('.'+layout.classes.seat);
    layout.toElement().disableSelection();
    $seats
      .on('click.lock', function _selectSeat () {
        var id = $(this).attr('id');
        var arr = id.split('-');
        var row = arr[1];
        var column = arr[2];
        if (layout.getType(row, column) === layout.TYPES.EMPTY) {
          selection[id] = true;
          layout.lock(row, column, function _onConflict (newType) {
            delete selection[id];
            statusUpdate('Could not lock seat `' + row + '-' + column +
                          '`. It is `' + layout.getEnumName(newType) + '`'
            );
          });
        } else if (layout.getType(row, column) === layout.TYPES.LOCKED) {
          delete selection[id];
          layout.unlock(row, column, true);
        } else {
          console.warn('[addEvents] This is bad', this.id, arguments);
        }
      });
  }

  function jqElement (type) {
    return $(document.createElement(type));
  }

}(jQuery));